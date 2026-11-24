---
"vue-grab-scroll": minor
---

Add the `ignore` option of `useGrabScroll` and the directive value `{ ignore }`, which exclude presses from grab scrolling with a CSS selector or a `pointerdown` predicate, so that other handlers, such as a drag-and-drop library, can take them.
