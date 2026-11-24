// Mouse input helpers for tests; events bubble from the target to its window like real ones.

/** Pointer coordinates in the viewport. */
export interface Point {
  x: number
  y: number
}

/**
 * Dispatches a mouse pointer event at the point on the target, unless `init` overrides the pointer.
 *
 * The primary button is held, as between a press and a release, except in `pointerup` and `pointercancel`.
 */
export function dispatchPointer(
  target: Element,
  type: string,
  { x, y }: Point,
  init: { pointerType?: string; pointerId?: number; button?: number; buttons?: number } = {},
) {
  // The constructor of the target's own window, which differs from the global one for another document.
  const { PointerEvent } = target.ownerDocument.defaultView!
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      pointerId: 1,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      clientX: x,
      clientY: y,
      ...init,
    }),
  )
}

/** Presses the primary mouse button over the target, moves the mouse, and releases the button. */
export function drag(target: Element, from: Point, to: Point) {
  dispatchPointer(target, "pointerdown", from)
  dispatchPointer(target, "pointermove", to)
  dispatchPointer(target, "pointerup", to)
}
