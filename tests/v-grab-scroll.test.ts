import { expect, it } from "bun:test"

import type { DirectiveModifiers, MaybeRefOrGetter } from "vue"
import { createApp, h, nextTick, shallowRef, toValue, withDirectives } from "vue"
import { vGrabScroll } from "vue-grab-scroll"

import { dispatchPointer, drag } from "./pointer"

/** Mounts an element with the directive and its modifiers, which rerender it when they change, into a new root on the document. */
function mountContainer(modifiers: MaybeRefOrGetter<DirectiveModifiers<"x" | "y">> = {}) {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp({
    render: () =>
      withDirectives(h("div"), [[vGrabScroll, undefined, undefined, toValue(modifiers)]]),
  })
  app.mount(root)
  return { root, app, container: root.firstElementChild as HTMLElement }
}

it("scrolls the element while it is mounted", () => {
  const { root, app, container } = mountContainer()

  drag(container, { x: 200, y: 200 }, { x: 100, y: 150 })
  expect(container.scrollLeft).toBe(100)
  expect(container.scrollTop).toBe(50)

  // The unmounted element is detached, so move the mouse over the document as the window listener needs.
  app.unmount()
  dispatchPointer(container, "pointerdown", { x: 200, y: 200 })
  dispatchPointer(document.body, "pointermove", { x: 100, y: 150 })
  expect(container.scrollLeft).toBe(100)
  expect(container.scrollTop).toBe(50)

  root.remove()
})

it("selects the scroll axes from the directive modifiers", () => {
  for (const [modifiers, scrollLeft, scrollTop] of [
    [{ x: true }, 100, 0],
    [{ y: true }, 0, 50],
    [{ x: true, y: true }, 100, 50],
  ] as const) {
    const { root, app, container } = mountContainer(modifiers)
    drag(container, { x: 200, y: 200 }, { x: 100, y: 150 })
    expect([container.scrollLeft, container.scrollTop]).toEqual([scrollLeft, scrollTop])
    app.unmount()
    root.remove()
  }
})

it("follows modifiers that change on the mounted element", async () => {
  const modifiers = shallowRef<DirectiveModifiers<"x" | "y">>({ x: true })
  const { root, app, container } = mountContainer(modifiers)
  modifiers.value = { y: true }
  await nextTick()

  drag(container, { x: 200, y: 200 }, { x: 100, y: 150 })
  expect([container.scrollLeft, container.scrollTop]).toEqual([0, 50])
  app.unmount()
  root.remove()
})
