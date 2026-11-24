# vue-grab-scroll

Vue composable and directive that scroll a container when the user drags it with the mouse.

## Install

```sh
npm install vue-grab-scroll
```

## Usage

Add the `v-grab-scroll` directive to a scrollable container:

```vue
<script setup lang="ts">
import { vGrabScroll } from "vue-grab-scroll"
</script>

<template>
  <div v-grab-scroll style="display: flex; overflow-x: auto">
    <a v-for="item in items" :key="item.id" :href="item.url">{{ item.title }}</a>
  </div>
</template>
```

To scroll along one axis only, add the `x` or `y` modifier, as in `v-grab-scroll.x`; without modifiers, or with both, the container scrolls along both axes.

To use the container's template ref instead, pass it to `useGrabScroll`:

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue"
import { useGrabScroll } from "vue-grab-scroll"

const track = useTemplateRef("track")
useGrabScroll(track)
</script>

<template>
  <div ref="track" style="display: flex; overflow-x: auto">…</div>
</template>
```

To limit the example above to horizontal scrolling, replace `useGrabScroll(track)` with:

```ts
useGrabScroll(track, { axis: "x" })
```

`axis` accepts `"x"`, `"y"`, or `"both"`, the default, as a value, a ref, or a getter; a drag uses the value it had when the mouse was pressed.

## Behavior

Dragging with the primary mouse button scrolls the container along each of its axes where its content overflows; touch screens keep their native scrolling.
When nested containers use grab scrolling, each axis goes to the innermost container that selected it, even if its content fits.
For example, a diagonal drag can scroll a row with `v-grab-scroll.x` horizontally and its enclosing list with `v-grab-scroll.y` vertically.

A press becomes a drag in a container once the mouse moves 5 px away from where it was pressed, measured along the axes that the container took; until then, it remains a click.
The click that ends a drag is suppressed, so that it does not activate links or buttons inside the container.

During a drag, the container's scroll snapping and text selection are turned off.

Links, images, and `draggable` elements in the container cannot be dragged with native drag and drop, because that would interrupt the scrolling.
