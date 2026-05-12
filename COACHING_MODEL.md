# Coaching Model and Data Plan

This document is the source-of-truth implementation note for Readrail's adaptive coaching work in epic #13. It defines the model before schema, UI, or runtime changes are made.

Readrail coaches comprehension-adjusted reading practice. Recommendations should help learners pick a sustainable next pace, not chase raw WPM.

## Coaching Inputs

Every recommendation should be based on evidence that includes both reading speed and comprehension. The model can use these inputs when available:

- `rawWpm`: timed words per minute for the attempt or session.
- `adjustedWpm`: raw WPM weighted by comprehension, using the existing pacing helper.
- `comprehensionPercent`: score from a generated quiz, manual check, baseline, or retest.
- `targetWpm`: the WPM the learner was practicing at when the attempt started.
- `attemptKind`: `generated`, `manual`, or `retest`.
- Reading scope: document, chapter, or page range, plus human-readable scope label.
- Word range and word count: `startWordIndex`, `endWordIndex`, and `wordCount`.
- Duration: timed reading seconds used to calculate raw WPM.
- Recency: latest attempts carry the most coaching weight, while older attempts provide trend context.
- Baseline result: initial calibration or later retest result.
- Reading session metadata: mode, scope fields, pause/regression counts, session timestamps, and optional self rating.
- Generated quiz review data: scored question results and reviewable question/answer details.
- Manual entry data: user-entered comprehension and timed reading details when AI is unavailable or not desired.

Raw WPM is never enough by itself. A faster attempt only counts as improvement when comprehension remains stable.

## Recommendation Rules

The baseline assessment seeds the first recommended WPM. After that, coaching should use recent attempts and retests to decide whether to reduce, hold, or increase the next target.

Use these rules as the conservative default for implementation:

- If comprehension is missing, do not increase WPM. Ask for a comprehension check before changing the target.
- If comprehension is below 60%, reduce the target by a small step, currently 20 WPM, and explain that understanding needs to recover first.
- If comprehension is 60% to 79%, hold the current target. Treat this as practice-stabilization evidence, not a speed increase signal.
- If comprehension is 80% to 89%, hold or increase only after repeated recent attempts show stable comprehension. A single result in this band is not enough to justify aggressive growth.
- If comprehension is 90% or higher, allow a small increase, currently 15 WPM, when the attempt is recent and the learner was practicing at or near the current target.
- Clamp all recommendations to the existing reader bounds of 80 to 900 WPM.
- Prefer the active target WPM as the base. Fall back to clamped raw WPM only when no valid target exists.

Trend surfaces may show raw WPM, adjusted WPM, comprehension, words read, streaks, and volume, but coaching copy should describe progress in comprehension-aware terms. A learner who reads faster with lower comprehension should receive a hold or reduce recommendation, not praise for speed.

## Record Ownership

Current records keep their existing responsibilities:

- `BaselineAssessmentResult` remains the calibration record. It stores story/source metadata, duration, raw WPM, comprehension, adjusted WPM, recommended WPM, explanation, question results, and completion time. Later retest flows may produce the same shape or a coaching attempt that references retest intent.
- `ReadingSession` remains the timed reading event. It owns document id, selected scope metadata, reader mode, target/actual/adjusted WPM, words read, duration, positions, pauses, regressions, optional comprehension score, optional self rating, notes, and timestamps.
- `QuizAttempt` is the current persisted app-state coaching-attempt shape. It records generated quiz outcomes today and is the migration source for the durable local-first attempt table.

Future coaching attempts should connect these records without duplicating responsibility:

- `readingSessionId` is optional because manual checks and retests may not always start from a saved reader session.
- `documentId` is required so attempts remain analyzable by reading.
- Scope metadata should be stored with the attempt, either directly or through the linked session, so document, chapter, and page-range trends survive later document edits.
- Generated quiz attempts should preserve review questions and scored answer data.
- Manual checks should record user-entered comprehension, timing, and word range without requiring Gemini.
- Retests should be distinguishable from normal practice attempts so trend views can compare baseline and later calibration points.

## Local-First Persistence Plan

Issue #39 should add durable local-first persistence for coaching attempts. The preferred SQLite table name is `quiz_attempts`, unless implementation reveals a clearer local naming fit such as `coaching_attempts`.

The durable attempt record should include:

- `id` primary key.
- `document_id` required reference to `documents`.
- `reading_session_id` nullable reference to `reading_sessions`.
- `kind` with values for generated quiz, manual check, and retest.
- Scope fields: `scope_type`, `scope_label`, optional chapter/page identifiers, and page number/source-page metadata when available.
- Word fields: `start_word_index`, `end_word_index`, and `word_count`.
- Timing and pace fields: `duration_seconds`, `target_wpm`, `raw_wpm`, and `adjusted_wpm`.
- `comprehension_percent`.
- Recommendation fields: `recommended_wpm` and `explanation`.
- Optional generated-review fields as JSON: `question_results_json` and `questions_json`.
- `created_at`.

Migration expectations for #39:

- Preserve existing Zustand `quizAttempts` by migrating each attempt into the durable shape.
- Do not drop generated quiz review metadata. Existing `questionResults` and `questions` should survive.
- Treat missing optional review metadata as valid legacy data.
- Keep existing `reading_sessions` unchanged.
- Keep the generic `comprehension_checks` table unchanged until #39 either bridges it or replaces it with the durable attempt table.
- Continue saving generated quiz attempts through the current app flow while adding repository helpers for the durable table.

The app should remain local-first. Coaching history is stored locally in app state and SQLite. Gemini is optional and user-owned; manual entry must remain available when a Gemini key is missing, when quiz generation fails, or when the user prefers not to send text to Gemini.

## Copy Constraints

Recommendation copy must stay plain-language and evidence-based:

- Explain the comprehension signal that led to the recommendation.
- Say whether the user should reduce, hold, or slightly increase the next target.
- Avoid promises about extreme speed gains or unrealistic timelines.
- Avoid praising raw speed when comprehension drops.
- Prefer phrases like "keep comprehension steady", "slow down for the next check", and "try a small increase" over claims about speed-reading mastery.

Acceptable examples:

- "Comprehension dipped to 55%. Slow to 220 WPM for the next check so understanding can recover."
- "Comprehension held at 82%. Keep the current target until another check confirms it feels stable."
- "Comprehension stayed strong at 92%. Try a small increase to 265 WPM for the next practice segment."
