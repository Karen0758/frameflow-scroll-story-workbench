---
name: frameflow
description: Plan and build scroll-driven story pages from scene copy, backgrounds, and video frame sequences using the Frameflow workbench. Use for editable desktop/mobile scenes, frame extraction, timed transitions, and static website ZIP handoff.
---

# Frameflow

Help the user turn their own text, images, and videos into an editable scroll-story prototype. The open-source workbench is at `https://github.com/Karen0758/frameflow-scroll-story-workbench`; its `docs/USER_GUIDE.md` explains the controls. Use the user's existing project if present, and preserve source media.

## Build the project

1. Identify the scene order, each scene's title/body, visual layers, interactions, and which video belongs to which scene. Resolve only gaps that block actual work; propose sensible defaults for durations and layouts.
2. Keep background texture, subject, shadow, and text as separately editable elements where source assets allow. A grayscale transparent subject can use Multiply over a color or texture. Do not bake the target color into the subject merely to imitate Multiply.
3. For each video, inspect duration, frame size, motion interval, and representative first/middle/last frames. Choose an interval and frame rate that preserve meaningful motion without unnecessary static frames. Extract all frames to one canvas size and natural numeric filename order. If using the workbench's browser extractor, remember its limit is 120 frames and it **retains the video background**. If transparent people are needed, prepare a cutout sequence separately; do not claim the browser extractor did it.
4. Check head, both feet, shoe tips, and shadow throughout the sequence. Keep a stable ground line and visual scale; if the source has zoom, correct it before import. Don't cover clipped features by stretching or hiding them in CSS. If a feature is absent from source frames, explain the limitation and seek or create replacement source frames when authorized.
5. In Frameflow, create/reorder scenes, import same-sized frames and textures, set title/body/color/transition, then set separate transition, subject, and text timings. Adjust desktop and mobile layouts independently. Preview forward and backward navigation and inspect transition corners, first/last frame, text legibility, and loading behavior.
6. Export a `.frameflow` bundle for future editing and a separate website ZIP for viewers. The ZIP contains `index.html` and referenced media; keep those together. Confirm the ZIP opens and scroll navigation works. Workbench data otherwise stays in this browser's localStorage/IndexedDB. A successful workbench build does **not** establish that a website was exported or deployed.

## When code or publishing is requested

The workbench exports a static website ZIP, but does not deploy it or provide a hosted URL. For a custom production site, extend its runtime as needed, supply owned/licensed fonts and media, then verify browser behavior at desktop/mobile sizes and the deployed URL. Publishing to a repository or hosting service requires the user's authorization; do not upload their videos or frame images by default.
