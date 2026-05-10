import Database from '@tauri-apps/plugin-sql'
import { SCHEMA_STATEMENTS } from './schema'

type SqlDatabase = Awaited<ReturnType<typeof Database.load>>

let databasePromise: Promise<SqlDatabase | null> | null = null

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

      return database
    })
    .catch((error: unknown) => {
      console.warn('SQLite initialization failed; using browser storage fallback.', error)
      return null
    })

  return databasePromise
}
