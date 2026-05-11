# Coaching Model and Feedback Rules

This document outlines the adaptive coaching model for Readrail, which recommends reading speeds (WPM) based on user comprehension.

## Core Philosophy

1. **Prioritize Comprehension:** Reading without understanding is simply skimming. The model never rewards raw speed if comprehension is poor.
2. **Conservative Growth:** When users demonstrate high comprehension, speed increases should be small (e.g., +10 to +25 WPM) to avoid overwhelming the learner.
3. **Pacing:** If comprehension drops, the model suggests a moderate reduction in speed to help the user regain focus and understanding.

## Rules for Adjusting WPM

When a user completes a manual or AI-generated quiz, the system evaluates their `comprehensionPercent` and their `rawWpm` (actual reading speed) to recommend a new `targetWpm`:

- **High Comprehension (80% - 100%)**
  - **Action:** Increase target WPM slightly.
  - **Formula:** `newWpm = currentTargetWpm + 15` (cap at some reasonable max, or let it grow as long as they maintain 80%+).
  - **Feedback:** "Great comprehension! You have a solid grasp of the material. Try pushing your speed up slightly to challenge yourself."

- **Moderate Comprehension (60% - 79%)**
  - **Action:** Maintain current WPM.
  - **Formula:** `newWpm = currentTargetWpm`
  - **Feedback:** "Good effort. Your comprehension is decent, but there is room for improvement. Keep practicing at this speed until it feels effortless."

- **Low Comprehension (< 60%)**
  - **Action:** Decrease target WPM.
  - **Formula:** `newWpm = Math.max(100, currentTargetWpm - 20)`
  - **Feedback:** "It looks like you're reading a bit too fast for full understanding. Let's slow down slightly to focus on building strong comprehension first."

## Special Cases

- **Manual Attempts:** If a user manually logs a speed and a self-rated comprehension score, the same logic applies, though the system may flag it as self-rated versus measured.
- **Unrealistic Claims:** We avoid promising "1000 WPM in 10 days" or similar claims. The tone should remain encouraging, focusing on steady, sustainable growth.

## Schema Tracking

To track this progress over time, the state store includes a new `quizAttempts` array tracking `QuizAttempt` objects. Each attempt records:
- Whether it was generated or manual.
- The raw WPM and comprehension score.
- The adjusted WPM.
- The new recommended WPM and the coaching explanation provided.
