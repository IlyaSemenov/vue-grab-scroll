// Renders components that use the composable and the directive on the server and prints the HTML; runs without the DOM that tests preload.
import { createSSRApp, h, useTemplateRef, withDirectives } from "vue"
import { renderToString } from "vue/server-renderer"
import { useGrabScroll, vGrabScroll } from "vue-grab-scroll"

const app = createSSRApp({
  setup() {
    useGrabScroll(useTemplateRef<HTMLElement>("container"))
    return () => [
      h("div", { ref: "container" }, "composable"),
      withDirectives(h("div", "directive"), [[vGrabScroll]]),
    ]
  },
})

console.log(await renderToString(app))
