import { tryOnScopeDispose, useEventListener } from "@vueuse/core"
import type { ShallowRef } from "vue"
import { watch } from "vue"

/** Distance in px from the press point at which a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 5

/**
 * Inline styles that a drag turns off on the container.
 *
 * Scroll snapping would pull the container to a snap point on every move, and the moves would select text.
 */
const DRAG_STYLES = ["scroll-snap-type", "user-select"] as const

/** Presses that a container has already taken, so that the containers around it skip them. */
const claimedPresses = new WeakSet<PointerEvent>()

/**
 * Scrolls a container when the user drags it with the mouse.
 *
 * The container scrolls along both axes; an axis along which the container does not overflow stays still.
 * When nested containers both use it, a drag inside the inner one scrolls only the inner one.
 *
 * Only the mouse is handled, because touch screens scroll the container natively.
 * The click that ends a drag is suppressed, so that it does not activate links or buttons inside the container.
 * Links, images, and `draggable` elements in the container cannot be dragged with native drag and drop, because that would interrupt the scrolling.
 *
 * Call it in `setup` or inside an effect scope, which removes its listeners when it stops.
 */
export function useGrabScroll(target: Readonly<ShallowRef<HTMLElement | null>>) {
  let endGesture: (() => void) | undefined
  let releaseClick: (() => void) | undefined

  useEventListener(target, "pointerdown", (event: PointerEvent) => {
    const element = target.value
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      !element ||
      claimedPresses.has(event)
    ) {
      return
    }

    claimedPresses.add(event)
    endGesture?.()
    endGesture = startGesture(element, event, releaseAfterDrag => {
      endGesture = undefined
      if (releaseAfterDrag) {
        releaseClick?.()
        releaseClick = suppressClickAfterRelease(
          element,
          releaseAfterDrag,
          () => (releaseClick = undefined),
        )
      }
    })
  })

  // In the capture phase, so that handlers inside the container that stop propagation do not let a drag start.
  useEventListener(target, "dragstart", (event: DragEvent) => event.preventDefault(), {
    capture: true,
  })

  const reset = () => {
    endGesture?.()
    releaseClick?.()
  }

  // The gesture and the click suppression belong to the element that was pressed.
  watch(target, reset)
  tryOnScopeDispose(reset)
}

/**
 * Starts following a mouse press on the element, and returns the function that ends the gesture.
 *
 * The gesture listens to the element's own window, which differs from the global one inside an iframe.
 * It listens to pointer events in the capture phase, so that handlers in the page that stop propagation do not hide the pointer from it.
 * When the gesture ends, it calls `onEnd` with the `pointerup` event that released the mouse after a drag, or with `undefined` if the pointer never reached the drag threshold or the gesture is cancelled.
 */
function startGesture(
  element: HTMLElement,
  press: PointerEvent,
  onEnd: (releaseAfterDrag: PointerEvent | undefined) => void,
): () => void {
  const view = element.ownerDocument.defaultView
  if (!view) {
    return () => {}
  }

  const start = {
    x: press.clientX,
    y: press.clientY,
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
  }
  let restoreStyles: (() => void) | undefined

  const end = (release?: PointerEvent) => {
    view.removeEventListener("pointermove", onMove, { capture: true })
    view.removeEventListener("pointerup", onUp, { capture: true })
    view.removeEventListener("pointercancel", onCancel, { capture: true })
    view.removeEventListener("blur", onBlur)
    const dragged = Boolean(restoreStyles)
    restoreStyles?.()
    restoreStyles = undefined
    onEnd(dragged ? release : undefined)
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) {
      return
    }

    // The release can be lost, such as when the mouse is released outside the window.
    if (!(event.buttons & 1)) {
      end()
      return
    }

    const offsetX = event.clientX - start.x
    const offsetY = event.clientY - start.y
    if (!restoreStyles) {
      if (Math.hypot(offsetX, offsetY) < DRAG_THRESHOLD) {
        return
      }
      restoreStyles = overrideStyles(element)
      view.getSelection()?.removeAllRanges()
    }

    // One instant call, because with `scroll-behavior: smooth` a second scroll would interrupt the first.
    element.scrollTo({
      left: start.scrollLeft - offsetX,
      top: start.scrollTop - offsetY,
      behavior: "instant",
    })
  }

  const onUp = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) {
      end(event)
    }
  }

  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) {
      end()
    }
  }

  // The mouse can be released in another window while this one has no focus.
  const onBlur = () => end()

  view.addEventListener("pointermove", onMove, { capture: true })
  view.addEventListener("pointerup", onUp, { capture: true })
  view.addEventListener("pointercancel", onCancel, { capture: true })
  // Not in the capture phase, which would also catch elements losing focus.
  view.addEventListener("blur", onBlur)

  return () => end()
}

/**
 * Turns off the drag styles on the element, and returns the function that restores their previous inline values.
 *
 * The styles are set as `none !important` to override stylesheets.
 * A property is restored only while it still holds that declaration, so that a different value that the application sets during the drag stays.
 */
function overrideStyles(element: HTMLElement) {
  const { style } = element
  const saved = DRAG_STYLES.map(name => ({
    name,
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name),
  }))
  for (const name of DRAG_STYLES) {
    style.setProperty(name, "none", "important")
  }

  return () => {
    for (const { name, value, priority } of saved) {
      if (
        style.getPropertyValue(name) !== "none" ||
        style.getPropertyPriority(name) !== "important"
      ) {
        continue
      }
      if (value) {
        style.setProperty(name, value, priority)
      } else {
        style.removeProperty(name)
      }
    }
  }
}

/**
 * Suppresses the click on the element that follows the mouse release, and returns the function that stops suppressing it, which also calls `onRelease`.
 *
 * Clicks that handlers dispatch while the release event is still being dispatched, such as by calling `click()` on a button, go through.
 */
function suppressClickAfterRelease(
  element: HTMLElement,
  release: PointerEvent,
  onRelease: () => void,
) {
  const preventClick = (event: MouseEvent) => {
    if (release.eventPhase !== Event.NONE) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    stop()
  }
  const stop = () => {
    clearTimeout(timeout)
    element.removeEventListener("click", preventClick, { capture: true })
    onRelease()
  }

  // The click follows the release in the same task; if no click follows, the timeout removes the listener.
  element.addEventListener("click", preventClick, { capture: true })
  const timeout = setTimeout(stop)
  return stop
}
