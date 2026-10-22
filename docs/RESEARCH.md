# Evidence and decisions

Researched October 22, 2026. The user confirmed Windows-only access, an A16 iPad, a third-party pencil, and the latest stable iPadOS. The exact OS build and pencil capabilities were not observed. No Mac, paid developer membership, or native app artifacts were available.

## Installation comparison

| Route | Cost and requirements | Maintenance and limits | Decision |
|---|---|---|---|
| Native Xcode Personal Team | Free account; requires a Mac/Xcode to produce and provision a native app | Apple documents 7-day limits for free provisioning resources; native installation is not a permanent free distribution channel | Not viable on the confirmed Windows-only hardware |
| Native IPA via AltStore Classic on Windows | AltServer supports Windows; still needs a correctly built IPA and an Apple account | AltStore documents app expiration after seven days and periodic refresh requirements | Does not solve native build availability; not chosen |
| App Store or regional alternative distribution | Developer distribution, review/notarization, accounts, and eligibility requirements apply | Regional rules vary; no user region assumed and no blanket worldwide free distribution claimed | Unnecessary for a personal web app |
| Safari Home Screen web app | HTTPS host and Safari; no Apple developer signing required | Initial asset download, browser input/storage limits; private host may require owner sign-in | Chosen and implemented |

Sources: [Apple developer accounts](https://developer.apple.com/help/account/basics/about-your-developer-account), [AltStore Windows setup](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), [AltStore app expiration](https://faq.altstore.io/altstore-classic/your-altstore), [Apple Home Screen installation](https://support.apple.com/en-mide/guide/ipad/ipad8f1f7a29/ipados), [Apple alternative distribution eligibility](https://support.apple.com/en-ie/118110).

The PWA has no required subscription or external processing. It uses local Canvas drawing instead of native PencilKit. Pressure is used only when Pointer Events reports a pen and nonzero pressure. With a touch-emulating pencil, finger input cannot reliably distinguish the user's hand from the pencil; the app cannot promise palm rejection. No assumption is made about the user's region.

WebKit describes best-effort storage and heuristic persistent-storage grants. The implementation requests persistence on demand and supplies editable external backups. Home Screen installation is useful for storage retention but is not a durability guarantee. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/). Web Locks support is documented in [Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/); Fieldnote uses it to prevent concurrent editing windows.

## Product evidence and feature matrix

The reference behavior is documented in [Notability's getting-started guide](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability), [Goodnotes features](https://www.goodnotes.com/features/), [Goodnotes lasso operations](https://support.goodnotes.com/hc/en-us/articles/7353695644175-Select-Move-and-Edit-Content-With-the-Lasso-Tool), and [Goodnotes audio and Note Replay](https://support.goodnotes.com/hc/en-us/articles/7352688559631-Add-Audio-Recordings-to-your-documents). Capabilities and availability differ by product/platform/plan; this matrix compares functionality, not subscription tiers.

| Workflow | Reference capability | Fieldnote implementation/status |
|---|---|---|
| Notebooks and organization | Both products organize note libraries | Titles, folders, tags, sorting and search implemented |
| Handwriting | Both provide ink tools | Pen, highlighter, colors, widths, whole-stroke erase; pressure when reported. Device input quality unverified |
| Selection and editing | Lasso workflows select and edit content | Lasso move, resize, copy/paste and deletion, session undo/redo implemented. Rotation/reflow not implemented |
| Page objects | Text, images and shape workflows | Multiline text boxes, image placement, rectangles, ellipses and diagonal lines implemented |
| Multipage documents | Notebook pages and paper choices | Four templates, rendered page thumbnails, add, duplicate, reorder and delete implemented |
| PDFs | Import and annotate documents | Local PDF.js rendering and extracted-text search; flattened PDF/PNG export implemented |
| Offline persistence | Reference products offer local note workflows | IndexedDB save/reopen and full offline static cache implemented; browser storage remains evictable |
| Search and OCR | Reference products search handwriting/text | Metadata, typed text, PDF text and corrected English OCR search implemented. Reliable handwriting indexing/conversion unsupported |
| Audio-linked notes | Recording and synchronized note replay | Chunked recording, playback, timestamps and surviving-ink replay implemented. Fake-microphone Chromium checks only |
| Backup and transfer | Document export and backup workflows | Editable versioned ZIP including media; validated non-destructive atomic restore implemented. No proprietary notebook-format import/export |
| Math and handwriting reflow | Advanced recognition/editing tools | Deferred: no suitable reliable free local model integrated |
| Sync and collaboration | Cross-device/shared workflows | Deferred: local-first personal scope; manual backup transfer available |
| AI and study tools | Product-specific advanced features | Deferred: outside the core note workflow; no paid service dependency introduced |

Reliable handwriting conversion and the deferred advanced workflows are material parity gaps. This is a functional personal notebook app, not a claim to reproduce every feature of either reference product.

## REA usage and limits

REA captured the public Notability getting-started page using a temporary headless Edge instance and a declared wait action. Its DOM capture and digest confirm accessible documentation, not native implementation details. The temporary browser was terminated by REA. The evidence summary is retained in `REA-EVIDENCE.json`, including its identifier and limitations.

No Notability or Goodnotes binary/package, logged-in app session, proprietary source, or native iPad behavior was inspected. Product feature claims above are documented facts; architecture, priorities, and parity decisions are our implementation judgments. No paid access or app protections were bypassed.

## Dependencies

- Mozilla PDF.js renders source PDFs locally; [official examples and API](https://mozilla.github.io/pdf.js/).
- PDF-LIB creates flattened PDF exports; [PDFDocument API](https://pdf-lib.js.org/docs/api/classes/pdfdocument).
- Tesseract.js runs English print OCR with local worker/core/model paths; [local installation guidance](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).
- fflate reads/writes editable ZIP backups.

Package versions are locked. MIT/Apache-2.0 notices and bundled font notices are included in `THIRD-PARTY-NOTICES.txt` and the vendored font directory. No external font, analytics, CDN, or note-processing service is used at runtime.
