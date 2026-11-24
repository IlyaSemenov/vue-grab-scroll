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

## Behavior

Dragging with the primary mouse button scrolls the container in both directions, along the axes where its content overflows; touch screens keep their native scrolling.
When nested containers both use grab scrolling, a drag inside the inner one scrolls only the inner one.

A press becomes a drag once the mouse moves 5 px away from where it was pressed; until then, it remains a click.
The click that ends a drag is suppressed, so links and buttons inside the container do not fire when the user releases the mouse after dragging.

During a drag, the container's scroll snapping and text selection are turned off.

Links, images, and `draggable` elements in the container cannot be dragged with native drag and drop, because that would interrupt the scrolling.
