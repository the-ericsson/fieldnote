# Fieldnote

A personal, offline note-taking app for your A16 iPad and third-party pencil. It runs as a Home Screen web app, with local notebooks, drawing, PDF annotation, images, audio, and editable backups. No subscription, paid API, backend, or Apple Developer membership is required by the app.

The published link and deployment status are recorded in `docs/DEPLOYMENT.md` when publication succeeds. Hosting is external infrastructure: the complete static build is included so you can move it to another HTTPS host. No permanent availability or future hosting price is guaranteed.

## Install on your iPad

1. Open the published HTTPS link in **Safari**. If the private host asks you to sign in, use the account that owns the Site.
2. Tap **Share → Add to Home Screen**. Enable **Open as Web App** if offered, then tap **Add**.
3. Open Fieldnote from its new icon while online. Wait for **✓ Ready offline · back up regularly**. The first download is approximately 29 MB and includes the English OCR model.
4. Create a test notebook. Close and reopen it, then test again in Airplane Mode before relying on it for a class or meeting.
5. Open **Install & help → Request persistent storage**. A browser may decline; external backups are needed either way.

This uses Apple's supported website-to-app mechanism, without jailbreaking, device profiles, sideloading, or signing renewal. The local Windows preview address is for development; it is not the iPad installation link.

## Write and organize

- **New notebook** creates a notebook. **Details** edits its title, folder, tags, and cover color. Search finds titles, folders, tags, typed note text, imported PDF text, and saved OCR text.
- Use **Pen**, **Highlight**, **Eraser**, **Text**, **Shape**, or **Image**. Eraser removes whole ink strokes. Shapes are rectangles, ellipses, and downward diagonal lines.
- Keep **Finger ink** on for a pencil that behaves as a finger. If your pencil is reported as a pen, turning Finger ink off lets fingers scroll while the pen writes. Two fingers pan the drawing workspace; **Zoom** changes page size.
- **Lasso** selects strokes with points inside the loop, and other objects whose center is inside it. Drag inside the selected bounds to move them. Use Copy/Paste, Smaller/Larger, or Delete selection. **Objects** offers a keyboard-accessible way to select canvas content; **Edit text** changes a selected text box.
- Add, duplicate, reorder, or delete pages using the page sidebar. Choose ruled, grid, dotted, or blank paper. Page deletion requires confirmation and is not undoable; drawing and text edits have session undo/redo.
- Import a PDF as a notebook, or use **Add PDF** to append it. Annotate using the drawing tools. Encrypted PDFs must be unlocked elsewhere first.
- **Scan text** runs English print OCR locally, saves the result for search, and lets you correct it or insert it as typed text. Handwriting accuracy is limited; this does not provide reliable native handwriting-to-text or math recognition.
- **Record audio** saves microphone chunks locally while you write. Stop before leaving the notebook. **Recordings** opens playback; **Replay ink** reveals surviving objects and ink by recording time. It does not reconstruct erased strokes or a history of later edits. Keep the app visible and the iPad unlocked while recording.

Controls and navigation have accessible names and keyboard focus. Canvas artwork itself is not a semantic document; use typed text or corrected OCR when you need accessible note content.

## Save, export, and restore

**Saved locally** means the current notebook was written to IndexedDB on this device and origin. It does not mean an external backup exists. Keep the app open if it reports unsaved changes. Only one window can edit at a time in browsers supporting Web Locks.

**Export** creates a flattened PDF of the notebook, a PNG of the current page, or an editable library backup. When the file is ready, choose **Save file** or **Share** and save it to Files. PDF and PNG preserve appearance, not editable ink or embedded audio.

Use **Back up library** regularly. Its ZIP contains versioned notebook JSON, original PDFs, images, and recorded audio. Save it outside the browser. **Restore backup** validates the archive and imports notebooks as new copies, remapping asset IDs; it never overwrites existing notes. The restore operation is one IndexedDB transaction.

Deleting the web app, clearing website data, low device storage, or an OS/browser eviction can remove local notes. Safari tabs and an installed Home Screen app may use different storage contexts. Export from the context containing your notes before switching. A changed domain is a different library; use backup/restore to move it.

## Build and run on Windows

Requires Node.js 22 or later and npm. From this folder:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd test
npm.cmd start
```

Open `http://127.0.0.1:4173/` on this computer. `dist/` is the complete static app and can be hosted on an HTTPS static host with JavaScript modules, WASM, and service workers enabled. Do not open `index.html` using a `file://` URL. Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`; keep the included file structure intact. All runtime dependencies are vendored under `dist/vendor/`; no CDN is needed at runtime.

For development after rebuilding, close every app tab/window and reopen it so a waiting service-worker update can activate. Installed users should also close and reopen after an update; back up before changing host or origin. The app caches static assets only, not uploaded notes or authentication pages.

The optional browser test runner uses Playwright and installed Microsoft Edge in an isolated temporary context, with a fake microphone. Install Playwright as a development tool or set `FIELDNOTE_PLAYWRIGHT` to an existing `playwright/index.mjs`, then run `node tests/browser-check.mjs` while the preview server is running. This is separate from the app's runtime dependencies.

### Free hosting alternative

GitHub Pages supports static sites in public repositories on GitHub Free. To host independently, create a public repository containing only the contents of `dist/` at its root, add an empty `.nojekyll` file, and select that branch/root under **Settings → Pages**. Open the HTTPS URL GitHub returns, then follow the iPad steps above. The app code becomes public; your local notebooks are not part of that upload. Keep notebook backups outside the repository. GitHub documents the current [free availability](https://docs.github.com/en/pages/getting-started-with-github-pages) and [publication steps](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Limits

PDF import: 75 MB and 250 pages per import, 500 pages per notebook. Images: 25 MB and 30 megapixels. Backup restore: 150 MB compressed input, 300 MB expanded, with record and point-count limits. Work with smaller notebooks and export backups frequently; the app uses in-memory rendering and archive assembly. Flattened PDFs can be larger than their originals, and exported text is not searchable as PDF text.

Reliable handwriting recognition, handwriting reflow, math conversion, native PencilKit behavior, guaranteed palm rejection, sync, collaboration, flashcard/study workflows, and AI assistance are not implemented. These are explicit gaps from Notability/Goodnotes, not features hidden behind subscriptions. Third-party pencil identification, pressure support, real microphone capture, and Safari/Home Screen behavior still need physical-device testing.

See `docs/RESEARCH.md` for the feature matrix and installation comparison, `docs/PLAN.md` for the ECC implementation plan, and `docs/VERIFICATION.md` for test coverage and its limits.
