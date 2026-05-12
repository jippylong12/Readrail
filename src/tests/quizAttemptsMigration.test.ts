import { describe, expect, it, vi } from 'vitest'
import { runQuizAttemptSqliteMigration } from '../lib/db/migrations'
import { SCHEMA_STATEMENTS } from '../lib/db/schema'

describe('quiz attempt SQLite migration', () => {
  it('defines the durable quiz_attempts table and indexes', () => {
    const schema = SCHEMA_STATEMENTS.join('\n')

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS quiz_attempts')
    expect(schema).toContain('document_id TEXT NOT NULL REFERENCES documents(id)')
    expect(schema).toContain('reading_session_id TEXT REFERENCES reading_sessions(id)')
    expect(schema).toContain('scope_type TEXT NOT NULL')
    expect(schema).toContain('question_results_json TEXT NOT NULL')
    expect(schema).toContain('questions_json TEXT NOT NULL')
    expect(schema).toContain('idx_quiz_attempts_document_id')
    expect(schema).toContain('idx_quiz_attempts_reading_session_id')
    expect(schema).toContain('idx_quiz_attempts_kind')
    expect(schema).toContain('idx_quiz_attempts_created_at')
  })

  it('adds missing scope columns to existing quiz_attempts tables', async () => {
    const database = {
      select: vi.fn().mockResolvedValue([{ name: 'id' }, { name: 'document_id' }]),
      execute: vi.fn().mockResolvedValue(undefined),
    }

    await runQuizAttemptSqliteMigration(database as never)

    expect(database.execute.mock.calls.map((call) => call[0])).toEqual([
      "ALTER TABLE quiz_attempts ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'document'",
      'ALTER TABLE quiz_attempts ADD COLUMN scope_label TEXT',
      'ALTER TABLE quiz_attempts ADD COLUMN chapter_id TEXT',
      'ALTER TABLE quiz_attempts ADD COLUMN chapter_title TEXT',
      "ALTER TABLE quiz_attempts ADD COLUMN page_ids_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE quiz_attempts ADD COLUMN page_numbers_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE quiz_attempts ADD COLUMN source_page_numbers_json TEXT NOT NULL DEFAULT '[]'",
      "UPDATE quiz_attempts SET scope_type = 'document' WHERE scope_type IS NULL OR scope_type = ''",
    ])
  })
})
