import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import type { EffectScope, Ref, ShallowRef } from "vue"
import { effectScope, nextTick, ref, shallowRef } from "vue"
import type { GrabScrollAxis } from "vue-grab-scroll"
import { useGrabScroll } from "vue-grab-scroll"

import { dispatchPointer, drag } from "./pointer"

let scope: EffectScope
let target: ShallowRef<HTMLElement | null>
let container: HTMLElement
let link: HTMLAnchorElement

beforeEach(() => {
  container = document.createElement("div")
  link = document.createElement("a")
  container.append(link)
  document.body.append(container)
  container.scrollLeft = 100
  container.scrollTop = 100

  scope = effectScope()
  target = shallowRef(container)
  scope.run(() => useGrabScroll(target))
})

afterEach(() => {
  scope.stop()
  container.remove()
})

/** Clicks the target, the link by default, and returns whether the click reached the document and whether its default action was prevented. */
function dispatchClick(target: Element = link) {
  let reached = false
  const onClick = () => (reached = true)
  document.addEventListener("click", onClick)
  const event = new MouseEvent("click", { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  document.removeEventListener("click", onClick)
  return { reached, prevented: event.defaultPrevented }
}

/** Result of `dispatchClick` for a click that goes through. */
const passedClick = { reached: true, prevented: false }

/** Result of `dispatchClick` for a suppressed click. */
const suppressedClick = { reached: false, prevented: true }

/** Start and end points of a drag that passes the drag threshold. */
const start = { x: 200, y: 200 }
const end = { x: 100, y: 200 }

describe("scrolling", () => {
  it("scrolls the container along with the mouse", () => {
    dispatchPointer(link, "pointerdown", start)
    dispatchPointer(document.body, "pointermove", { x: 160, y: 230 })
    expect(container.scrollLeft).toBe(140)
    expect(container.scrollTop).toBe(70)

    dispatchPointer(document.body, "pointermove", { x: 230, y: 160 })
    expect(container.scrollLeft).toBe(70)
    expect(container.scrollTop).toBe(140)

    dispatchPointer(document.body, "pointerup", { x: 230, y: 160 })
    dispatchPointer(document.body, "pointermove", { x: 300, y: 300 })
    expect(container.scrollLeft).toBe(70)
    expect(container.scrollTop).toBe(140)
  })

  it("ignores mouse moves below the drag threshold", () => {
    drag(link, start, { x: 203, y: 203 })
    expect(container.scrollLeft).toBe(100)
    expect(container.scrollTop).toBe(100)
    expect(dispatchClick()).toEqual(passedClick)
  })

  it("starts a drag once the mouse moves by the threshold in any direction", () => {
    drag(link, start, { x: 203, y: 204 })
    expect(container.scrollLeft).toBe(97)
    expect(container.scrollTop).toBe(96)
    expect(dispatchClick()).toEqual(suppressedClick)
  })

  it("ignores touch and pen pointers", () => {
    for (const pointerType of ["touch", "pen"]) {
      dispatchPointer(link, "pointerdown", start, { pointerType })
      dispatchPointer(link, "pointermove", end, { pointerType })
      dispatchPointer(link, "pointerup", end, { pointerType })
    }
    expect(container.scrollLeft).toBe(100)
  })

  it("ignores buttons other than the primary one", () => {
    dispatchPointer(link, "pointerdown", start, { button: 2, buttons: 2 })
    dispatchPointer(link, "pointermove", end, { buttons: 3 })
    expect(container.scrollLeft).toBe(100)
  })

  it("ignores other pointers during a drag", () => {
    const touch = { pointerType: "touch", pointerId: 2 }
    dispatchPointer(link, "pointerdown", start)
    dispatchPointer(link, "pointerdown", start, touch)
    dispatchPointer(link, "pointermove", { x: 50, y: 50 }, touch)
    dispatchPointer(link, "pointercancel", { x: 50, y: 50 }, touch)
    dispatchPointer(link, "pointerup", { x: 50, y: 50 }, touch)
    expect(container.scrollLeft).toBe(100)

    dispatchPointer(link, "pointermove", end)
    expect(container.scrollLeft).toBe(200)
  })

  it("scrolls only the innermost of nested containers", () => {
    const inner = document.createElement("div")
    container.append(inner)
    scope.run(() => useGrabScroll(shallowRef(inner)))

    drag(inner, start, end)
    expect(inner.scrollLeft).toBe(100)
    expect(container.scrollLeft).toBe(100)

    drag(link, start, end)
    expect(container.scrollLeft).toBe(200)
  })

  it("scrolls outer containers only along the axes that the inner ones leave", () => {
    const middle = document.createElement("div")
    const inner = document.createElement("div")
    container.append(middle)
    middle.append(inner)
    scope.run(() => {
      useGrabScroll(shallowRef(middle), { axis: "y" })
      useGrabScroll(shallowRef(inner), { axis: "x" })
    })

    drag(inner, start, { x: 150, y: 150 })
    expect([inner.scrollLeft, inner.scrollTop]).toEqual([50, 0])
    expect([middle.scrollLeft, middle.scrollTop]).toEqual([0, 50])
    expect([container.scrollLeft, container.scrollTop]).toEqual([100, 100])

    drag(middle, start, { x: 150, y: 150 })
    expect([middle.scrollLeft, middle.scrollTop]).toEqual([0, 100])
    expect([container.scrollLeft, container.scrollTop]).toEqual([150, 100])
  })

  it("scrolls when a child stops pointermove propagation", () => {
    link.addEventListener("pointermove", event => event.stopPropagation())
    drag(link, start, end)
    expect(container.scrollLeft).toBe(200)
  })

  it("follows the mouse in the window of the container's document", () => {
    // Use `srcdoc` to create the frame document without loading a page.
    const iframe = document.createElement("iframe")
    iframe.srcdoc = "<body></body>"
    document.body.append(iframe)
    const frameDocument = iframe.contentDocument!
    const frameContainer = frameDocument.createElement("div")
    frameDocument.body.append(frameContainer)
    scope.run(() => useGrabScroll(shallowRef(frameContainer)))

    dispatchPointer(frameContainer, "pointerdown", start)
    dispatchPointer(frameDocument.body, "pointermove", end)
    expect(frameContainer.scrollLeft).toBe(100)

    iframe.remove()
  })
})

describe("axis", () => {
  let axis: Ref<GrabScrollAxis>
  let element: HTMLElement

  beforeEach(() => {
    element = document.createElement("div")
    document.body.append(element)
    element.scrollLeft = 100
    element.scrollTop = 100
    axis = ref("x")
    scope.run(() => useGrabScroll(shallowRef(element), { axis }))
  })

  afterEach(() => element.remove())

  it("scrolls only horizontally along the x axis", () => {
    drag(element, start, { x: 150, y: 250 })
    expect(element.scrollLeft).toBe(150)
    expect(element.scrollTop).toBe(100)
  })

  it("scrolls only vertically along the y axis", () => {
    axis.value = "y"
    drag(element, start, { x: 150, y: 250 })
    expect(element.scrollLeft).toBe(100)
    expect(element.scrollTop).toBe(50)
  })

  it("starts a drag once the mouse moves by the threshold along the axis", () => {
    for (const [value, belowThreshold, atThreshold] of [
      ["x", { x: 203, y: 260 }, { x: 195, y: 260 }],
      ["y", { x: 260, y: 203 }, { x: 260, y: 195 }],
    ] as const) {
      axis.value = value
      dispatchPointer(element, "pointerdown", start)
      dispatchPointer(element, "pointermove", belowThreshold)
      expect([element.scrollLeft, element.scrollTop]).toEqual([100, 100])

      dispatchPointer(element, "pointermove", atThreshold)
      expect([element.scrollLeft, element.scrollTop]).toEqual(
        value === "x" ? [105, 100] : [100, 105],
      )
      dispatchPointer(element, "pointerup", atThreshold)
      element.scrollLeft = 100
      element.scrollTop = 100
    }
  })

  it("keeps the scroll position along the other axis that the page sets during a drag", () => {
    dispatchPointer(element, "pointerdown", start)
    dispatchPointer(element, "pointermove", { x: 150, y: 250 })
    element.scrollTop = 30
    dispatchPointer(element, "pointermove", { x: 140, y: 260 })
    expect([element.scrollLeft, element.scrollTop]).toEqual([160, 30])
    dispatchPointer(element, "pointerup", { x: 140, y: 260 })

    axis.value = "y"
    dispatchPointer(element, "pointerdown", start)
    dispatchPointer(element, "pointermove", { x: 250, y: 150 })
    element.scrollLeft = 30
    dispatchPointer(element, "pointermove", { x: 260, y: 140 })
    expect([element.scrollLeft, element.scrollTop]).toEqual([30, 90])
  })

  it("reads the axis from a getter", () => {
    const other = document.createElement("div")
    document.body.append(other)
    other.scrollLeft = 100
    other.scrollTop = 100
    scope.run(() => useGrabScroll(shallowRef(other), { axis: () => "y" }))

    drag(other, start, { x: 150, y: 250 })
    expect([other.scrollLeft, other.scrollTop]).toEqual([100, 50])
    other.remove()
  })

  it("keeps the axis of a drag and uses a changed axis from the next press", () => {
    dispatchPointer(element, "pointerdown", start)
    axis.value = "y"
    dispatchPointer(element, "pointermove", { x: 150, y: 250 })
    dispatchPointer(element, "pointerup", { x: 150, y: 250 })
    expect(element.scrollLeft).toBe(150)
    expect(element.scrollTop).toBe(100)

    drag(element, start, { x: 150, y: 250 })
    expect(element.scrollLeft).toBe(150)
    expect(element.scrollTop).toBe(50)
  })
})

describe("clicks", () => {
  it("suppresses only the click that ends a drag", () => {
    drag(link, start, end)
    expect(dispatchClick()).toEqual(suppressedClick)
    expect(dispatchClick()).toEqual(passedClick)
  })

  it("stops suppressing clicks when the drag ends without one", async () => {
    drag(link, start, end)
    await new Promise(resolve => setTimeout(resolve))
    expect(dispatchClick()).toEqual(passedClick)
  })

  it("suppresses the click when a child stops pointerup propagation", () => {
    link.addEventListener("pointerup", event => event.stopPropagation())
    drag(link, start, end)
    expect(container.style.userSelect).toBe("")
    expect(dispatchClick()).toEqual(suppressedClick)
  })

  it("allows a button click during pointerup and suppresses the drag-ending click", () => {
    const button = document.createElement("button")
    container.append(button)
    const buttonClicks: MouseEvent[] = []
    button.addEventListener("click", event => buttonClicks.push(event))
    link.addEventListener("pointerup", () => button.click())
    drag(link, start, end)
    expect(buttonClicks.map(event => event.defaultPrevented)).toEqual([false])
    expect(dispatchClick()).toEqual(suppressedClick)
    expect(dispatchClick()).toEqual(passedClick)
  })

  it("suppresses one click after a drag that scrolls nested containers", () => {
    const outer = document.createElement("div")
    const inner = document.createElement("div")
    container.append(outer)
    outer.append(inner)
    scope.run(() => {
      useGrabScroll(shallowRef(outer), { axis: "y" })
      useGrabScroll(shallowRef(inner), { axis: "x" })
    })

    for (const [to, clicked] of [
      [{ x: 150, y: 150 }, inner],
      [{ x: 150, y: 150 }, outer],
      [{ x: 150, y: 200 }, inner],
      [{ x: 200, y: 150 }, inner],
    ] as const) {
      drag(inner, start, to)
      expect(dispatchClick(clicked)).toEqual(suppressedClick)
      expect(dispatchClick(clicked)).toEqual(passedClick)
    }
  })

  it("stops suppressing clicks when the target changes", async () => {
    drag(link, start, end)
    target.value = document.createElement("div")
    await nextTick()
    expect(dispatchClick()).toEqual(passedClick)
  })

  it("stops suppressing clicks when its scope is disposed", () => {
    drag(link, start, end)
    scope.stop()
    expect(dispatchClick()).toEqual(passedClick)
  })
})

describe("styles", () => {
  it("overrides stylesheet scroll snapping and text selection during a drag", () => {
    const stylesheet = document.createElement("style")
    stylesheet.textContent =
      ".track { scroll-snap-type: x mandatory !important; user-select: text !important }"
    document.head.append(stylesheet)
    container.className = "track"
    const getStyles = () => {
      const computed = getComputedStyle(container)
      return [
        computed.getPropertyValue("scroll-snap-type"),
        computed.getPropertyValue("user-select"),
      ]
    }

    expect(getStyles()).toEqual(["x mandatory", "text"])
    dispatchPointer(link, "pointerdown", start)
    dispatchPointer(link, "pointermove", end)
    expect(getStyles()).toEqual(["none", "none"])
    dispatchPointer(link, "pointerup", end)
    expect(getStyles()).toEqual(["x mandatory", "text"])
    expect(container.getAttribute("style") ?? "").toBe("")

    stylesheet.remove()
  })

  it("restores the previous inline values after a drag", () => {
    container.style.setProperty("scroll-snap-type", "x mandatory")
    container.style.setProperty("user-select", "text", "important")

    drag(link, start, end)
    expect(container.style.getPropertyValue("scroll-snap-type")).toBe("x mandatory")
    expect(container.style.getPropertyPriority("scroll-snap-type")).toBe("")
    expect(container.style.getPropertyValue("user-select")).toBe("text")
    expect(container.style.getPropertyPriority("user-select")).toBe("important")
  })

  it("keeps a value that the application sets during a drag", () => {
    container.style.setProperty("scroll-snap-type", "x mandatory")
    dispatchPointer(link, "pointerdown", start)
    dispatchPointer(link, "pointermove", end)
    container.style.scrollSnapType = "y mandatory"

    dispatchPointer(link, "pointerup", end)
    expect(container.style.scrollSnapType).toBe("y mandatory")
    expect(container.style.getPropertyPriority("scroll-snap-type")).toBe("")
  })
})

describe("ending a drag early", () => {
  /** Starts a drag on the link and moves the mouse past the drag threshold. */
  function startDrag() {
    dispatchPointer(link, "pointerdown", start)
    dispatchPointer(link, "pointermove", end)
    expect(container.style.userSelect).toBe("none")
  }

  /** Checks that the drag ended without further scrolling and without suppressing a click. */
  function expectDragCancelled() {
    expect(container.style.userSelect).toBe("")
    const { scrollLeft } = container
    dispatchPointer(link, "pointermove", { x: 50, y: 50 })
    expect(container.scrollLeft).toBe(scrollLeft)
    expect(dispatchClick()).toEqual(passedClick)
  }

  it("cancels a drag when the pointer is cancelled", () => {
    startDrag()
    dispatchPointer(link, "pointercancel", end)
    expectDragCancelled()
  })

  it("cancels a drag when a child stops pointercancel propagation", () => {
    link.addEventListener("pointercancel", event => event.stopPropagation())
    startDrag()
    dispatchPointer(link, "pointercancel", end)
    expectDragCancelled()
  })

  it("cancels a drag when the mouse moves without the primary button", () => {
    startDrag()
    dispatchPointer(link, "pointermove", { x: 50, y: 50 }, { buttons: 0 })
    expect(container.scrollLeft).toBe(200)
    expectDragCancelled()
  })

  it("cancels a drag when the window loses focus", () => {
    startDrag()
    // An element losing focus does not end the drag.
    link.dispatchEvent(new FocusEvent("blur"))
    dispatchPointer(link, "pointermove", { x: 90, y: 200 })
    expect(container.scrollLeft).toBe(210)

    window.dispatchEvent(new Event("blur"))
    expectDragCancelled()
  })

  it("cancels a drag when the target changes", async () => {
    startDrag()
    const replacement = document.createElement("div")
    document.body.append(replacement)
    target.value = replacement
    await nextTick()

    expectDragCancelled()
    expect(replacement.scrollLeft).toBe(0)
    replacement.remove()
  })

  it("cancels a drag when its scope is disposed", () => {
    startDrag()
    scope.stop()
    expectDragCancelled()
  })
})

it("prevents native dragging of the container content", () => {
  link.addEventListener("dragstart", event => event.stopPropagation())
  const event = new DragEvent("dragstart", { bubbles: true, cancelable: true })
  link.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})
