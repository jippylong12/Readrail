# Structured Document Model

Design note for GitHub issues #14 and #20. This document defines the target local-first model for long OCR imports before schema, migration, editing, reader, or export code changes are introduced.

## Goals

- Preserve Readrail's current local-first behavior and existing saved reading history.
- Keep `documents.id` as the stable canonical document/book identifier for reading sessions, quiz attempts, active document selection, exports, stats, and progress.
- Support long OCR imports as editable documents with ordered chapters and pages.
- Preserve OCR source and review metadata without storing remote credentials, Gemini API keys, or provider secrets in document records.
- Keep the existing flat document text available as a backward-compatible rendered reading projection while page-level text becomes the future source of truth.

## Target Data Shape

### Documents

`documents` remains the parent record and canonical user-facing book/document entity.

- `id`: stable document ID. Existing IDs must not change during migration.
- `title`: editable document/book title.
- `sourceType`: existing import source, such as `paste`, `text_file`, `pdf_text`, `photo_ocr`, or `manual`.
- `content`: backward-compatible rendered text projection generated from ordered pages. During migration it is copied from the current flat document.
- `wordCount`: aggregate word count across all readable pages.
- `estimatedPages`: aggregate estimate used by library and stats surfaces.
- `language`: document language, defaulting to existing `en` behavior.
- `structureVersion`: numeric model version for future idempotent migrations.
- `createdAt`, `updatedAt`, `archivedAt`: existing lifecycle timestamps. Archive remains document-level.

### Chapters

`document_chapters` groups ordered pages inside a document.

- `id`: stable chapter ID. Migrated default chapters should use a deterministic ID derived from the document ID.
- `documentId`: parent document ID.
- `title`: editable chapter title. The migrated default chapter can use `Main text`.
- `sortOrder`: deterministic ordering value within the document.
- `createdAt`, `updatedAt`: lifecycle timestamps.

### Pages

`document_pages` stores the ordered editable reading text and page-level OCR metadata.

- `id`: stable page ID. Migrated default pages should use a deterministic ID derived from the document ID.
- `documentId`: parent document ID.
- `chapterId`: owning chapter ID.
- `sortOrder`: deterministic ordering value within the chapter.
- `pageNumber`: user-visible page number in the organized document.
- `sourcePageNumber`: original OCR/source page number when known.
- `title` or `label`: optional page label for review and organization UI.
- `text`: editable page text.
- `wordCount`: word count for the page text.
- `reviewStatus`: OCR review state, such as `unreviewed`, `reviewed`, or `needs_attention`.
- `ocrConfidence`: optional provider confidence when available.
- `ocrNotes`: optional reviewer/provider notes and warnings.
- `uncertainSpans`: optional list of uncertain OCR spans, preserving Gemini `[?word]` uncertainty data when available.
- `sourceFileId`, `sourceFileName`, `sourceKind`, `sourceLocalPath`, `sourceSha256`: source metadata when available from `source_files`.
- `createdAt`, `updatedAt`: lifecycle timestamps.

The page table owns editable reading text for structured documents. The document `content` field remains a compatibility projection built by joining ordered page text with page breaks.

## Migration Strategy

Issue #21 should add a local-state and SQLite migration that turns every existing flat `DocumentRecord` into a structured document without changing its identity.

- Keep each existing `documents.id` unchanged.
- Create one default chapter per existing document with an ID derived from the document ID, for example `chapter:<documentId>:default`.
- Create one default page per existing document with an ID derived from the document ID, for example `page:<documentId>:default`.
- Copy the current `DocumentRecord.content` into that page's `text`.
- Preserve `title`, `sourceType`, `content`, `wordCount`, `estimatedPages`, `language`, `createdAt`, `updatedAt`, and `archivedAt`.
- Preserve `activeDocumentId`, reading sessions, quiz attempts, baseline results, tour/onboarding state, settings, and coaching state without remapping document IDs.
- Mark migrated pages as reviewed when they came from a user-confirmed saved document, including existing OCR imports.
- Make the migration idempotent by checking for existing structured children before creating deterministic default chapter/page records.

SQLite migration should mirror the Zustand persisted-state migration. Browser/local-storage users and Tauri/SQLite users should see the same resulting document model.

## Reading Ranges And Progress

Existing range fields remain document-level word offsets:

- `ReadingSession.startPosition`
- `ReadingSession.endPosition`
- `QuizAttempt.startWordIndex`
- `QuizAttempt.endWordIndex`

These fields continue to power current progress, stats, coaching, and Gemini quiz history. Structured document work may add optional range metadata later, such as `startChapterId`, `startPageId`, `endChapterId`, `endPageId`, and page-local offsets, but those additions must be nullable and backward-compatible.

The reader should build its text in organized reading order by sorting chapters and pages, then deriving a single rendered text stream. This preserves existing word-offset behavior while allowing future UI to map offsets back to page/chapter context.

## OCR Metadata And Privacy

OCR metadata belongs on pages and source-file records, not in settings or key storage.

- Store source file identity, display name, kind, local path, and hash only when available and allowed by privacy settings.
- Store model ID, prompt version, warnings, uncertain spans, review status, confidence, and notes when available from OCR results.
- Do not store Gemini API keys, keychain material, request credentials, or any remote provider secret in document, chapter, page, source-file, or OCR job records.
- Preserve the existing explicit user confirmation before sending files to Gemini.

## Archive And Delete Behavior

Archive remains document-level.

- Archived documents stay in local storage with their chapters, pages, source metadata, reading sessions, and quiz attempts intact.
- Library search and active-document lists should continue filtering archived documents by `documents.archivedAt`.
- If hard delete is introduced later, it must cascade or explicitly remove document chapters, pages, OCR metadata, and source-file links so local state and SQLite cannot retain orphaned child records.
- Hard delete should not be part of #21 unless the issue explicitly expands scope.

## Compatibility Expectations

Follow-up issues should preserve existing behavior while progressively adopting the structured model.

- #21 storage migration: add persisted types/state and SQLite tables, migrate existing documents into one default chapter/page, and keep current paste/text-file/OCR imports working.
- #22 title/text editing: edit document titles and structured page text without duplicating documents, then refresh aggregate word count, estimated pages, timestamps, and rendered `content`.
- #23 OCR review and append: review OCR output as page-level items, create new structured documents, and append pages to existing documents while preserving source metadata and privacy rules.
- #24 organization controls: create, rename, reorder, and delete/empty chapters; move and reorder pages while preserving page IDs, text, metadata, and deterministic reading order.
- #25 compatibility pass: update search to include document titles, chapter titles, and page text; keep archive filtering; add structured context to JSON/CSV exports where available; verify stats, progress, and walkthrough behavior.

JSON export should preserve the current top-level documents/sessions shape and include structured context when available. CSV export should preserve current columns and may add nullable structured range columns later. Existing import, export, progress, and Gemini quiz history must keep working for documents created before this model.
