import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readerCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('reader pane CSS', () => {
  it('clips reader panes without making them programmatically scrollable', () => {
    expect(readerCss).toMatch(/\.reading-surface\s*\{[^}]*overflow:\s*clip;/s)
    expect(readerCss).toMatch(/\.page-pane\s*\{[^}]*overflow:\s*clip;/s)
  })

  it('bounds multi-pane reader layout inside the reader surface', () => {
    expect(readerCss).toMatch(/body\s*\{[^}]*overflow-x:\s*hidden;/s)
    expect(readerCss).toMatch(/\.app-shell\s*\{[^}]*max-width:\s*100vw;[^}]*overflow-x:\s*hidden;/s)
    expect(readerCss).toMatch(/\.main-panel\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*hidden;/s)
    expect(readerCss).toMatch(/\.content-stack\s*\{[^}]*min-width:\s*0;/s)
    expect(readerCss).toMatch(/\.panel\s*\{[^}]*min-width:\s*0;/s)
    expect(readerCss).toMatch(/\.reader-panel\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/s)
    expect(readerCss).toMatch(/\.reader-control-strip\s*\{[^}]*grid-template-columns:\s*minmax\(260px,\s*0\.55fr\)\s*minmax\(480px,\s*1fr\)\s*max-content;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/s)
    expect(readerCss).toMatch(/\.reading-surface\s*\{[^}]*display:\s*grid;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-height:\s*min\(72vh,\s*720px\);/s)
    expect(readerCss).toMatch(/\.page-panes\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*max-height:\s*100%;[^}]*overflow:\s*clip;/s)
    expect(readerCss).toMatch(/\.page-pane\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*max-height:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*line-height:\s*inherit;/s)
    expect(readerCss).toMatch(/\.reader-chunk\s*\{[^}]*display:\s*inline-block;[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s)
  })
})
