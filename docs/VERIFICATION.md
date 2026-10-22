# Verification

Windows verification on October 22, 2026. This reports tests that actually ran; it does not establish physical iPad compatibility.

## Automated checks

- `npm.cmd run build`: successful static build; 207 precached assets, approximately 28.9 MiB before compression. Every runtime dependency and the English OCR language data is local.
- `npm.cmd test`: five model tests pass, covering malformed records, unsafe attachment IDs, duplicate pages, eraser segment crossings, lasso/transform behavior, long-stroke bounds, and search fields.
- `node --check`: app, renderer, and storage modules parse successfully.
- `tests/browser-check.mjs`: 13 integration groups pass in headless Microsoft Edge, an isolated temporary profile, and a fake microphone. Raw results and timings are in `test-results/browser-results.json` in the workspace; a deliverable copy is in `docs/browser-results.json`.

The integration groups cover complete offline caching; notebook creation and persisted ink; undo/redo, typed text, selection copying and resizing; page duplication/reordering/templates; generated PDF import/render/text extraction and parsed PDF export; image import and PNG export; local English OCR; fake audio recording/chunk storage/playback; editable backup restore with remapped media IDs and malformed-archive rejection; offline reload and PDF reopening; atomic rollback after a simulated storage exception; blocking a conflicting second editing window; and viewport checks at 320, 768, 1024, and 1440 CSS pixels. No uncaught page errors were reported.

Representative warm-run desktop timings were roughly 2 seconds for a one-page PDF import/export test, 2.6 seconds for local OCR of the printed fixture, and 0.6 seconds for offline reopen. These are workflow timings on this Windows host, not stylus latency, large-document benchmarks, or iPad measurements. The measured cold offline preload took approximately 2 seconds over loopback, not over an internet connection.

Manual in-app-browser checks also created a notebook, drew a stroke, and confirmed its saved object count. The browser test runner saves screenshots in `screenshots/`.

Production inspection found that the host redirects `/index.html` to `/`. Offline installation now accepts same-origin redirects only after validating the actual app shell, rejects HTML in asset responses, and reports failed worker installation. The local preview reproduces the canonical redirect, so the offline integration checks cover this regression.

## Known unverified behavior

- Physical A16 iPad, exact installed iPadOS build, and the user's third-party pencil.
- Pointer identification, pressure, palm behavior, input latency, high-DPI rendering performance, and real handwriting OCR quality.
- Actual microphone permission/capture, Safari audio chunk concatenation/playback, interrupted/locked-device recordings, and system share/Save to Files.
- Installed Home Screen startup after device restart, long-term browser eviction, low-storage handling under actual device pressure, and persistent-storage grants.
- Maximum-size PDFs, large audio libraries, backup archives near memory limits, VoiceOver navigation, and a full accessibility audit.

The automated recording test used generated audio; it did not access the user's microphone. The layout test checks overflow and available controls; it is not a WCAG certification or assistive-technology audit.

## First-run device checklist

1. Install from the published HTTPS link using Safari; wait for Ready offline.
2. Draw using the third-party pencil with Finger ink on. Test your usual hand position. If the palm draws, try your pencil's hardware palm-rejection mode or avoid resting the palm; this app cannot infer a pen from a touch-only signal.
3. Add text and an image, import a small PDF, annotate, then close/reopen the Home Screen app.
4. Enable Airplane Mode and repeat reopening/annotation, PDF export and OCR.
5. Record ten seconds of actual audio, stop, play it back, and test Replay ink.
6. Save an editable ZIP to Files. Restore it and confirm new copies retain handwriting, PDF backgrounds, images, and audio.
7. Confirm both PDF/PNG and the editable backup exist in Files before using the app for irreplaceable notes.
