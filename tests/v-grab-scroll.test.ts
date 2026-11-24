import { expect, it } from "bun:test"

import { createApp, h, withDirectives } from "vue"
import { vGrabScroll } from "vue-grab-scroll"

import { dispatchPointer, drag } from "./pointer"

it("scrolls the element while it is mounted", () => {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp({ render: () => withDirectives(h("div"), [[vGrabScroll]]) })
  app.mount(root)
  const container = root.firstElementChild as HTMLElement

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
