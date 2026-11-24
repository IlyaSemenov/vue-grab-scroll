import type { Directive, EffectScope, ShallowRef } from "vue"
import { effectScope, shallowRef } from "vue"

import type { GrabScrollAxis, GrabScrollIgnore } from "./use-grab-scroll"
import { useGrabScroll } from "./use-grab-scroll"

/** Value of the {@link vGrabScroll} directive. */
export interface GrabScrollDirectiveOptions {
  /** Presses that the element leaves alone, as the `ignore` option of `useGrabScroll` describes. */
  ignore?: GrabScrollIgnore
}

/** Directive state of a mounted element. */
interface Instance {
  /** Scope that holds the event listeners. */
  scope: EffectScope
  /** Axis that the modifiers select. */
  axis: ShallowRef<GrabScrollAxis>
  /** Latest value of the binding. */
  value: GrabScrollDirectiveOptions | undefined
}

/** Directive state of the mounted elements. */
const instances = new WeakMap<HTMLElement, Instance>()

/**
 * Directive that scrolls its element when the user drags it with the mouse, as {@link useGrabScroll} does.
 *
 * Use it as `v-grab-scroll` after importing it into `<script setup>`.
 * The `x` or `y` modifier, as in `v-grab-scroll.x`, limits scrolling to that axis; without modifiers, or with both, the element scrolls along both axes.
 * The value, as in `v-grab-scroll="{ ignore: '.card' }"`, selects presses that the element leaves alone.
 */
export const vGrabScroll: Directive<
  HTMLElement,
  GrabScrollDirectiveOptions | undefined,
  "x" | "y"
> = {
  mounted(element, { value, modifiers }) {
    // A detached scope, so that the listeners live exactly as long as the element is mounted.
    const instance: Instance = {
      scope: effectScope(true),
      axis: shallowRef(toAxis(modifiers)),
      value,
    }
    instance.scope.run(() =>
      useGrabScroll(shallowRef(element), {
        axis: instance.axis,
        // Read on each press, so that a changed `ignore` applies even when the value object stays the same.
        get ignore() {
          return instance.value?.ignore
        },
      }),
    )
    instances.set(element, instance)
  },
  updated(element, { value, modifiers }) {
    const instance = instances.get(element)
    if (instance) {
      instance.axis.value = toAxis(modifiers)
      instance.value = value
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
