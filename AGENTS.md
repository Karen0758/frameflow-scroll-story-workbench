# Scroll Story Workbench working agreements

This is a standalone Frameflow product. Before changing the editor, read `docs/PROCESS_TEMPLATE.md`, `docs/USER_GUIDE.md`, and `README.md`. A private source-project note may exist locally under `.local/`; do not require it for public development or commit it.

- Preserve source projects and all user-supplied videos and generated media. Read them for comparison only; do not copy them into this repository or upload them by default.
- Treat imported media as local user data. The workbench stores it in this browser's IndexedDB and exports it only when the user chooses export.
- Keep the scene format versioned. New page types or animation parameters should not silently break old project files.
- Validate editing, desktop and mobile preview, scene navigation, video extraction, and import/export before claiming they work. Distinguish a build from browser interaction tests.
- Document reusable design decisions without publishing private source paths or media.
