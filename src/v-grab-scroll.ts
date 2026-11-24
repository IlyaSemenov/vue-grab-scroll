import type { Directive, EffectScope, ShallowRef } from "vue"
import { effectScope, shallowRef } from "vue"

import type { GrabScrollAxis } from "./use-grab-scroll"
import { useGrabScroll } from "./use-grab-scroll"

/** Directive state of the mounted elements: the scope that holds their event listeners, and the axis that their modifiers select. */
const instances = new WeakMap<
  HTMLElement,
  { scope: EffectScope; axis: ShallowRef<GrabScrollAxis> }
>()

/**
 * Directive that scrolls its element when the user drags it with the mouse, as {@link useGrabScroll} does.
 *
 * Use it as `v-grab-scroll` after importing it into `<script setup>`.
 * The `x` or `y` modifier, as in `v-grab-scroll.x`, limits scrolling to that axis; without modifiers, or with both, the element scrolls along both axes.
 */
export const vGrabScroll: Directive<HTMLElement, undefined, "x" | "y"> = {
  mounted(element, { modifiers }) {
    const axis = shallowRef(toAxis(modifiers))
    // A detached scope, so that the listeners live exactly as long as the element is mounted.
    const scope = effectScope(true)
    scope.run(() => useGrabScroll(shallowRef(element), { axis }))
    instances.set(element, { scope, axis })
  },
  updated(element, { modifiers }) {
    const instance = instances.get(element)
    if (instance) {
      instance.axis.value = toAxis(modifiers)
    }
  },
  unmounted(element) {
    instances.get(element)?.scope.stop()
    instances.delete(element)
  },
}

/** Returns the axis that the directive modifiers select: one of them limits scrolling to it, none or both keep both axes. */
function toAxis(modifiers: Partial<Record<"x" | "y", boolean>>): GrabScrollAxis {
  if (modifiers.x && !modifiers.y) {
    return "x"
  }
  if (modifiers.y && !modifiers.x) {
    return "y"
  }
  return "both"
}
