import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readerCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('reader pane CSS', () => {
  it('clips reader panes without making them programmatically scrollable', () => {
    expect(readerCss).toMatch(/\.reading-surface\s*\{[^}]*overflow:\s*clip;/s)
    expect(readerCss).toMatch(/\.page-pane\s*\{[^}]*overflow:\s*clip;/s)
  })
})
