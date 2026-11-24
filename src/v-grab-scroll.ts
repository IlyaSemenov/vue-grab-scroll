import type { Directive, EffectScope } from "vue"
import { effectScope, shallowRef } from "vue"

import { useGrabScroll } from "./use-grab-scroll"

/** Scopes of the mounted elements, which hold their event listeners. */
const scopes = new WeakMap<HTMLElement, EffectScope>()

/**
 * Directive that scrolls its element when the user drags it with the mouse, as {@link useGrabScroll} does.
 *
 * Use it as `v-grab-scroll` after importing it into `<script setup>`.
 */
export const vGrabScroll: Directive<HTMLElement> = {
  mounted(element) {
    // A detached scope, so that the listeners live exactly as long as the element is mounted.
    const scope = effectScope(true)
    scope.run(() => useGrabScroll(shallowRef(element)))
    scopes.set(element, scope)
  },
  unmounted(element) {
    scopes.get(element)?.stop()
    scopes.delete(element)
  },
}
