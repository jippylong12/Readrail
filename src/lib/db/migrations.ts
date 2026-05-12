import Database from '@tauri-apps/plugin-sql'
import { SCHEMA_STATEMENTS } from './schema'

type SqlDatabase = Awaited<ReturnType<typeof Database.load>>

let databasePromise: Promise<SqlDatabase | null> | null = null

type TableColumn = {
  name: string
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getDatabase(): Promise<SqlDatabase | null> {
  if (!isTauriRuntime()) {
    return null
  }

  databasePromise ??= Database.load('sqlite:readrail.db')
    .then(async (database) => {
      for (const statement of SCHEMA_STATEMENTS) {
        await database.execute(statement)
      }
      await runStructuredDocumentSqliteMigration(database)
      await runOcrJobSqliteMigration(database)
      await runReadingSessionScopeSqliteMigration(database)

      return database
    })
    .catch((error: unknown) => {
      console.warn('SQLite initialization failed; using browser storage fallback.', error)
      return null
    })

  return databasePromise
}

async function runReadingSessionScopeSqliteMigration(database: SqlDatabase): Promise<void> {
  const sessionColumns = await database.select<TableColumn[]>('PRAGMA table_info(reading_sessions)')
  if (!sessionColumns.some((column) => column.name === 'scope_type')) {
    await database.execute("ALTER TABLE reading_sessions ADD COLUMN scope_type TEXT DEFAULT 'document'")
  }
  if (!sessionColumns.some((column) => column.name === 'scope_label')) {
    await database.execute('ALTER TABLE reading_sessions ADD COLUMN scope_label TEXT')
  }
  if (!sessionColumns.some((column) => column.name === 'chapter_id')) {
    await database.execute('ALTER TABLE reading_sessions ADD COLUMN chapter_id TEXT')
  }
  if (!sessionColumns.some((column) => column.name === 'chapter_title')) {
    await database.execute('ALTER TABLE reading_sessions ADD COLUMN chapter_title TEXT')
  }
  if (!sessionColumns.some((column) => column.name === 'page_ids_json')) {
    await database.execute("ALTER TABLE reading_sessions ADD COLUMN page_ids_json TEXT NOT NULL DEFAULT '[]'")
  }
  if (!sessionColumns.some((column) => column.name === 'page_numbers_json')) {
    await database.execute("ALTER TABLE reading_sessions ADD COLUMN page_numbers_json TEXT NOT NULL DEFAULT '[]'")
  }
  if (!sessionColumns.some((column) => column.name === 'source_page_numbers_json')) {
    await database.execute("ALTER TABLE reading_sessions ADD COLUMN source_page_numbers_json TEXT NOT NULL DEFAULT '[]'")
  }

  await database.execute("UPDATE reading_sessions SET scope_type = 'document' WHERE scope_type IS NULL OR scope_type = ''")
}

async function runStructuredDocumentSqliteMigration(database: SqlDatabase): Promise<void> {
  const documentColumns = await database.select<TableColumn[]>('PRAGMA table_info(documents)')
  if (!documentColumns.some((column) => column.name === 'structure_version')) {
    await database.execute('ALTER TABLE documents ADD COLUMN structure_version INTEGER NOT NULL DEFAULT 1')
  }

  await database.execute('UPDATE documents SET structure_version = 1 WHERE structure_version IS NULL')
  await database.execute(
    `INSERT OR IGNORE INTO document_chapters (
      id, document_id, title, sort_order, created_at, updated_at
    )
    SELECT
      'chapter:' || documents.id || ':default',
      documents.id,
      'Main text',
      0,
      documents.created_at,
      documents.updated_at
    FROM documents
    WHERE NOT EXISTS (
      SELECT 1 FROM document_chapters WHERE document_chapters.document_id = documents.id
    )`,
  )
  await database.execute(
    `INSERT OR IGNORE INTO document_pages (
      id, document_id, chapter_id, sort_order, page_number, source_page_number, title, text,
      word_count, review_status, ocr_confidence, ocr_notes, uncertain_spans_json, source_file_id,
      source_file_name, source_kind, source_local_path, source_sha256, created_at, updated_at
    )
    SELECT
      'page:' || documents.id || ':default',
      documents.id,
      COALESCE(
        (
          SELECT document_chapters.id
          FROM document_chapters
          WHERE document_chapters.document_id = documents.id
          ORDER BY document_chapters.sort_order ASC
          LIMIT 1
        ),
        'chapter:' || documents.id || ':default'
      ),
      0,
      1,
      NULL,
      NULL,
      documents.content,
      documents.word_count,
      'reviewed',
      NULL,
      NULL,
      '[]',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      documents.created_at,
      documents.updated_at
    FROM documents
    WHERE NOT EXISTS (
      SELECT 1 FROM document_pages WHERE document_pages.document_id = documents.id
    )`,
  )
}

async function runOcrJobSqliteMigration(database: SqlDatabase): Promise<void> {
  const ocrJobColumns = await database.select<TableColumn[]>('PRAGMA table_info(ocr_jobs)')
  if (!ocrJobColumns.some((column) => column.name === 'target_chapter_id')) {
    await database.execute('ALTER TABLE ocr_jobs ADD COLUMN target_chapter_id TEXT REFERENCES document_chapters(id)')
  }
  if (!ocrJobColumns.some((column) => column.name === 'warnings_json')) {
    await database.execute("ALTER TABLE ocr_jobs ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]'")
  }
  if (!ocrJobColumns.some((column) => column.name === 'updated_at')) {
    await database.execute("ALTER TABLE ocr_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
    await database.execute("UPDATE ocr_jobs SET updated_at = created_at WHERE updated_at = ''")
  }
}
