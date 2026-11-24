import { tryOnScopeDispose, useEventListener } from "@vueuse/core"
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue"
import { toValue, unref, watch } from "vue"

/** Axes along which a container scrolls: horizontal, vertical, or both. */
export type GrabScrollAxis = "x" | "y" | "both"

/**
 * Presses that a container leaves alone: a CSS selector, or a function that receives the `pointerdown` event and returns whether to leave the press alone.
 *
 * The selector is tested against the pressed element and each ancestor up to and including the grab-scroll container.
 */
export type GrabScrollIgnore = string | ((press: PointerEvent) => boolean)

/** Options of {@link useGrabScroll}. */
export interface GrabScrollOptions {
  /** Axes along which the container scrolls; the default is both. */
  axis?: MaybeRefOrGetter<GrabScrollAxis>
  /**
   * Presses that the container leaves alone, so that other handlers, such as a drag-and-drop library, can take them.
   *
   * It is a value or a ref, not a getter, because a function value is the predicate itself.
   */
  ignore?: MaybeRef<GrabScrollIgnore | undefined>
}

/** Whether a gesture scrolls the container along each axis. */
interface Axes {
  x: boolean
  y: boolean
}

/** Distance in px from the press point, measured along the axes that the container took for the press, at which the press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 5

/**
 * Inline styles that a drag turns off on the container.
 *
 * Scroll snapping would pull the container to a snap point on every move, and the moves would select text.
 */
const DRAG_STYLES = ["scroll-snap-type", "user-select"] as const

/** Attribute that a container has during a drag. */
const DRAGGING_ATTRIBUTE = "data-grab-scrolling"

/** Axes of presses that containers have already taken, so that the containers around them scroll only along the other axes. */
const claimedAxes = new WeakMap<PointerEvent, Axes>()

/**
 * Functions that stop the click suppressions of each release.
 *
 * Nested containers that a press dragged each suppress the click after its release, and the first one that suppresses it stops the others, so that they do not suppress a later click.
 */
const releaseSuppressions = new WeakMap<PointerEvent, Set<() => void>>()

/** Presses that a container has left alone, which no container scrolls and native drag and drop may follow. */
const ignoredPresses = new WeakSet<PointerEvent>()

/**
 * Scrolls a container when the user drags it with the mouse.
 *
 * The container scrolls along both axes, unless `axis` limits it to one; an axis along which the container does not overflow stays still.
 * When nested containers use it, each axis goes to the innermost container that selected it, even if its content fits.
 *
 * During a drag, the container has the `data-grab-scrolling` attribute, for example to show a grabbing cursor.
 *
 * Only the mouse is handled, because touch screens scroll the container natively.
 * The click that ends a drag is suppressed, so that it does not activate links or buttons inside the container.
 *
 * When `ignore` matches a press, no grab-scroll container on its event path starts scrolling, and the package leaves its click and native drag and drop to the application.
 * On other presses, links, images, and `draggable` elements in the container cannot be dragged with native drag and drop, because that would interrupt the scrolling.
 *
 * Call it in `setup` or inside an effect scope, which removes its listeners when it stops.
 */
export function useGrabScroll(
  target: Readonly<ShallowRef<HTMLElement | null>>,
  options: GrabScrollOptions = {},
) {
  let endGesture: ((release?: PointerEvent) => void) | undefined
  let releaseClick: (() => void) | undefined
  /** The mouse press in the container while it lasts, which decides whether native drag and drop may start. */
  let currentPress: PointerEvent | undefined
  let stopWatchingPress: (() => void) | undefined

  /** Ends the current press and its gesture, which receives the `pointerup` event that released the mouse, if any. */
  const endPress = (release?: PointerEvent) => {
    stopWatchingPress?.()
    stopWatchingPress = undefined
    currentPress = undefined
    endGesture?.(release)
  }

  // In the capture phase, so that the press is left alone before handlers inside the container, which may stop its propagation, see it, and before nested containers start a gesture.
  useEventListener(
    target,
    "pointerdown",
    (event: PointerEvent) => {
      const element = target.value
      if (!element || !isPrimaryMousePress(event)) {
        return
      }
      endPress()
      currentPress = event
      stopWatchingPress = watchPressEnd(element, event, release => {
        // The watcher has stopped itself.
        stopWatchingPress = undefined
        endPress(release)
      })
      if (isIgnored(element, event, unref(options.ignore))) {
        ignoredPresses.add(event)
      }
    },
    { capture: true },
  )

  useEventListener(target, "pointerdown", (event: PointerEvent) => {
    const element = target.value
    // A child handler can end the press before pointerdown bubbles back to the container, for example by moving focus to another window.
    if (!element || event !== currentPress || ignoredPresses.has(event)) {
      return
    }
    const axes = claimAxes(event, toValue(options.axis) ?? "both")
    if (!axes) {
      return
    }

    endGesture = startGesture(element, event, axes, releaseAfterDrag => {
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
  useEventListener(
    target,
    "dragstart",
    (event: DragEvent) => {
      if (!currentPress || !ignoredPresses.has(currentPress)) {
        event.preventDefault()
      }
    },
    { capture: true },
  )

  const reset = () => {
    endPress()
    releaseClick?.()
  }

  // The gesture and the click suppression belong to the element that was pressed.
  watch(target, reset)
  tryOnScopeDispose(reset)
}

/** Returns whether the press is made with the primary mouse button, the only one that drags a container. */
function isPrimaryMousePress(press: PointerEvent): boolean {
  return press.pointerType === "mouse" && press.button === 0
}

/** Returns whether the container leaves the press alone, as {@link GrabScrollIgnore} describes. */
function isIgnored(
  container: HTMLElement,
  press: PointerEvent,
  ignore: GrabScrollIgnore | undefined,
): boolean {
  if (typeof ignore === "function") {
    return ignore(press)
  }
  if (!ignore) {
    return false
  }
  const match = (press.target as Element).closest(ignore)
  return Boolean(match && container.contains(match))
}

/**
 * Takes the axes of the press that the axis setting allows and no container inside has taken, and returns them, or `undefined` if none are left.
 */
function claimAxes(press: PointerEvent, axis: GrabScrollAxis): Axes | undefined {
  const claimed = claimedAxes.get(press) ?? { x: false, y: false }
  const axes = { x: axis !== "y" && !claimed.x, y: axis !== "x" && !claimed.y }
  if (!axes.x && !axes.y) {
    return undefined
  }
  claimedAxes.set(press, { x: claimed.x || axes.x, y: claimed.y || axes.y })
  return axes
}

/**
 * Starts following the moves of a mouse press on the element along the axes, and returns the function that ends the gesture.
 *
 * The caller ends the gesture when the press ends, with the `pointerup` event that released the mouse, or without one when the press is cancelled.
 * The gesture listens to moves in the element's own window, which differs from the global one inside an iframe, in the capture phase, so that handlers in the page that stop propagation do not hide the pointer from it.
 * When the gesture ends, it calls `onEnd` with the `pointerup` event that released the mouse after a drag, or with `undefined` if the pointer never reached the drag threshold or the press was cancelled.
 */
function startGesture(
  element: HTMLElement,
  press: PointerEvent,
  axes: Axes,
  onEnd: (releaseAfterDrag: PointerEvent | undefined) => void,
): (release?: PointerEvent) => void {
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
  let unmarkDragging: (() => void) | undefined
  let ended = false

  const end = (release?: PointerEvent) => {
    ended = true
    view.removeEventListener("pointermove", onMove, { capture: true })
    const dragged = Boolean(unmarkDragging)
    unmarkDragging?.()
    unmarkDragging = undefined
    onEnd(dragged ? release : undefined)
  }

  const onMove = (event: PointerEvent) => {
    // A move that shows a lost release can end the gesture during its own dispatch, before this listener runs.
    if (ended || event.pointerId !== press.pointerId) {
      return
    }

    // Moves along the other axes neither start a drag nor scroll.
    const offsetX = axes.x ? event.clientX - start.x : 0
    const offsetY = axes.y ? event.clientY - start.y : 0
    if (!unmarkDragging) {
      if (Math.hypot(offsetX, offsetY) < DRAG_THRESHOLD) {
        return
      }
      unmarkDragging = markDragging(element)
      view.getSelection()?.removeAllRanges()
    }

    // One instant call, because with `scroll-behavior: smooth` a second scroll would interrupt the first.
    // The other axes are left out, so that their scroll positions stay wherever the page puts them.
    element.scrollTo({
      ...(axes.x && { left: start.scrollLeft - offsetX }),
      ...(axes.y && { top: start.scrollTop - offsetY }),
      behavior: "instant",
    })
  }

  view.addEventListener("pointermove", onMove, { capture: true })
  return end
}

/**
 * Waits for the end of a mouse press on the element, and returns the function that stops waiting.
 *
 * When the press ends, it stops waiting and calls `onEnd` once, with the `pointerup` event that released the mouse, or with `undefined` when the pointer is cancelled, its release is lost, or the window loses focus.
 * A release is lost when the mouse moves without the primary button or presses again, wherever in the window.
 * It listens to the element's own window, in the capture phase for pointer events, so that handlers that stop propagation do not hide the end.
 */
function watchPressEnd(
  element: HTMLElement,
  press: PointerEvent,
  onEnd: (release?: PointerEvent) => void,
): () => void {
  const view = element.ownerDocument.defaultView
  if (!view) {
    return () => {}
  }

  const stop = () => {
    view.removeEventListener("pointerup", onUp, { capture: true })
    view.removeEventListener("pointercancel", onCancel, { capture: true })
    view.removeEventListener("pointermove", onMove, { capture: true })
    view.removeEventListener("pointerdown", onDown, { capture: true })
    view.removeEventListener("blur", onBlur)
  }
  const end = (release?: PointerEvent) => {
    stop()
    onEnd(release)
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
  // The release can be lost, such as when the mouse is released outside the window.
  const onMove = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId && !(event.buttons & 1)) {
      end()
    }
  }
  // In the window's capture phase, so that the press ends before any container handles the new one.
  const onDown = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) {
      end()
    }
  }
  // The mouse can be released in another window while this one has no focus.
  const onBlur = () => end()

  view.addEventListener("pointerup", onUp, { capture: true })
  view.addEventListener("pointercancel", onCancel, { capture: true })
  view.addEventListener("pointermove", onMove, { capture: true })
  view.addEventListener("pointerdown", onDown, { capture: true })
  // Not in the capture phase, which would also catch elements losing focus.
  view.addEventListener("blur", onBlur)
  return stop
}

/** Applies the drag styles and the dragging attribute to the element, and returns the function that restores the styles and removes the attribute. */
function markDragging(element: HTMLElement): () => void {
  const restoreStyles = overrideStyles(element)
  element.setAttribute(DRAGGING_ATTRIBUTE, "")
  return () => {
    restoreStyles()
    element.removeAttribute(DRAGGING_ATTRIBUTE)
  }
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
  let suppressions = releaseSuppressions.get(release)
  if (!suppressions) {
    suppressions = new Set()
    releaseSuppressions.set(release, suppressions)
  }

  const preventClick = (event: MouseEvent) => {
    if (release.eventPhase !== Event.NONE) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    for (const stopSuppression of suppressions) {
      stopSuppression()
    }
  }
  const stop = () => {
    clearTimeout(timeout)
    element.removeEventListener("click", preventClick, { capture: true })
    suppressions.delete(stop)
    onRelease()
  }

  // The click follows the release in the same task; if no click follows, the timeout removes the listener.
  element.addEventListener("click", preventClick, { capture: true })
  const timeout = setTimeout(stop)
  suppressions.add(stop)
  return stop
}
