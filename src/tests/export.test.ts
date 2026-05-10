import { describe, expect, it } from 'vitest'
import { exportProgressCsv, exportProgressJson } from '../lib/db/export'

describe('progress export', () => {
  it('exports valid JSON backup data', () => {
    const parsed = JSON.parse(exportProgressJson([], [])) as { documents: unknown[]; sessions: unknown[] }

    expect(parsed.documents).toEqual([])
    expect(parsed.sessions).toEqual([])
  })

  it('exports CSV headers', () => {
    expect(exportProgressCsv([]).split('\n')[0]).toContain('session_id,document_id,mode')
  })
})
