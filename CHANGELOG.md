# vue-grab-scroll

## 1.2.0

### Minor Changes

- 0fd4f0f: Mark a container with the `data-grab-scrolling` attribute during a drag, so that stylesheets can show a grabbing cursor.

## 1.1.0

### Minor Changes

- c32b181: Add the `axis` option and the `x` and `y` directive modifiers, which limit scrolling to one axis.
  In nested containers, each axis goes to the innermost container that selected it.
- 82e3418: Add the `ignore` option of `useGrabScroll` and the directive value `{ ignore }`, which exclude presses from grab scrolling with a CSS selector or a `pointerdown` predicate, so that other handlers, such as a drag-and-drop library, can take them.

### Patch Changes

- 95d0693: Fix a bug where a drag suppressed a click triggered by a `pointerup` handler and allowed the drag-ending click instead.
- 2d1c49e: Support `@vueuse/core` 14.

## 1.0.0

### Major Changes

- f61a23e: Use the `useGrabScroll` composable or the `v-grab-scroll` directive to scroll a container by dragging it with the mouse.
