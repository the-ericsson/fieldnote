# Fieldnote implementation plan

ECC workflow: the installed `commands/plan.md` was read and applied inline. The user's request explicitly authorizes implementation after planning, so its routine confirmation gate is already satisfied. No slash command execution is claimed. This is a new, empty workspace, with no existing callers, fixtures, exports, or conventions to preserve.

## Decision and scope

Windows-only development; target is an A16 iPad, current stable iPadOS, third-party pencil. Build an original static Progressive Web App with Canvas, IndexedDB, a service worker, and vendored PDF/OCR dependencies. No account is required for local operation; the private hosted installation link may require the owner's ChatGPT account. Do not promise pressure or palm rejection from a pencil that presents as a finger.

Native Xcode development requires macOS. A free Personal Team or AltStore route involves signing restrictions/renewal and still needs an iOS build. A Home Screen app avoids signing and uses a static HTTPS origin. It cannot match native PencilKit input or guaranteed filesystem durability. Preserve data in transactional IndexedDB and provide portable editable ZIP backups. Native and regional marketplace distribution are not chosen.

## Architecture and files

- `src/model.mjs`: versioned records, validation, geometry, transforms, search; shared by UI and tests.
- `src/storage.mjs`: IndexedDB notebooks/assets, atomic restore, backup serialization.
- `src/render.mjs`: Canvas page renderer, ink and selection, templates and images.
- `src/app.mjs`, `src/index.html`, `src/style.css`: accessible library/editor, page management, tools, imports, exports, recordings, OCR.
- `src/sw.js`, manifest, icons: installable offline app; cache only same-origin static resources, never private login HTML or uploaded data.
- `scripts/build.mjs`: reproducible vendor copying and offline asset manifest, license notices.
- `scripts/serve.mjs`: local static preview, no API or uploads.
- `tests/`: meaningful persistence/backup, geometry, import/export, and browser workflow verification.
- `docs/RESEARCH.md`, `README.md`, `docs/VERIFICATION.md`: evidence, feature matrix, installation, backup, limits, actual check results.

## Execution order and exit criteria

1. Data foundation: schema validation, geometry, atomic notebook save and non-destructive backup merge; reject malformed archives before any write. Verify using unit tests and browser persistence checks.
2. Core editor: pressure-aware ink where reported, highlighter, stroke eraser, lasso transforms, text/images/shapes, undo, multipage templates and management. Verify actual browser interactions at desktop and tablet sizes.
3. Documents/media: local PDF import/render/search/export, PNG export, microphone recording with timestamps and replay, English local OCR. Verify generated PDF/ZIP contents, restore, audio failure handling, and worker loading.
4. Installation: manifest/service worker, cache all dependencies and English model locally, storage persistence request and failure messaging. Verify reload with networking disabled.
5. Review/package/deploy: address observed failures, document gaps, package complete source and static build, publish owner-private with Sites, retain returned URL and verify deployment state.

## Risks and handling

- Browser data may be removed by the user or OS: persistence request, visible status and backup instructions; never equate autosave with backup.
- Failed/queued saves: serialize writes and retain an unsaved/error state; no automatic overwriting of corrupt data.
- Large PDFs/OCR: bounded inputs, page-at-a-time rendering, cancellation/failure feedback; disclose memory limits.
- Third-party pencil identification and actual latency cannot be verified on Windows: finger drawing enabled by default, physical-device checklist.
- Browser microphone capture can stop in background/when locked: incremental media chunks persisted, recoverable recordings, explicit errors.
- Offline installation depends on complete initial cache: show readiness only after every asset has cached successfully.
- Screen-reader support covers navigation and controls; freehand canvas contents require text descriptions/OCR for access.
