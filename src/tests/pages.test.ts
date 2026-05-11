import { describe, expect, it } from 'vitest'
import { getActivePage, splitIntoPages } from '../lib/text/pages'

describe('splitIntoPages', () => {
  it('returns a single page when pageCount is 1', () => {
    const items = [1, 2, 3, 4, 5]
    expect(splitIntoPages(items, 1)).toEqual([[1, 2, 3, 4, 5]])
  })

  it('returns a single page when items is empty', () => {
    expect(splitIntoPages([], 4)).toEqual([[]])
  })

  it('splits 10 items into 2 equal pages', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const pages = splitIntoPages(items, 2)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveLength(5)
    expect(pages[1]).toHaveLength(5)
  })

  it('splits 10 items into 3 pages distributing remainder to early pages', () => {
    // 10 / 3 = 3 r1 → first page gets 4, rest get 3
    const items = Array.from({ length: 10 }, (_, i) => i)
    const pages = splitIntoPages(items, 3)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toHaveLength(4)
    expect(pages[1]).toHaveLength(3)
    expect(pages[2]).toHaveLength(3)
  })

  it('splits 11 items into 4 pages distributing 3 extra items', () => {
    // 11 / 4 = 2 r3 → pages 0,1,2 get 3 items; page 3 gets 2
    const items = Array.from({ length: 11 }, (_, i) => i)
    const pages = splitIntoPages(items, 4)
    expect(pages).toHaveLength(4)
    expect(pages[0]).toHaveLength(3)
    expect(pages[1]).toHaveLength(3)
    expect(pages[2]).toHaveLength(3)
    expect(pages[3]).toHaveLength(2)
  })

  it('clamps page count to item count when fewer items than pages', () => {
    const items = ['a', 'b']
    const pages = splitIntoPages(items, 4)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toEqual(['a'])
    expect(pages[1]).toEqual(['b'])
  })

  it('preserves all items across all pages (no items dropped)', () => {
    const items = Array.from({ length: 17 }, (_, i) => i)
    for (const count of [1, 2, 3, 4] as const) {
      const pages = splitIntoPages(items, count)
      const flat = pages.flat()
      expect(flat).toHaveLength(17)
      expect(flat).toEqual(items)
    }
  })

  it('returns contiguous ordered slices', () => {
    const items = Array.from({ length: 8 }, (_, i) => i)
    const pages = splitIntoPages(items, 3)
    const flat = pages.flat()
    expect(flat).toEqual(items)
  })
})

describe('getActivePage', () => {
  it('returns 0 for a single-page layout', () => {
    expect(getActivePage(5, 10, 1)).toBe(0)
  })

  it('returns the correct page index for a two-page layout', () => {
    // 10 items, 2 pages → each 5 items
    expect(getActivePage(0, 10, 2)).toBe(0)
    expect(getActivePage(4, 10, 2)).toBe(0)
    expect(getActivePage(5, 10, 2)).toBe(1)
    expect(getActivePage(9, 10, 2)).toBe(1)
  })

  it('returns the correct page for a four-page layout', () => {
    // 8 items, 4 pages → 2 each
    expect(getActivePage(0, 8, 4)).toBe(0)
    expect(getActivePage(1, 8, 4)).toBe(0)
    expect(getActivePage(2, 8, 4)).toBe(1)
    expect(getActivePage(4, 8, 4)).toBe(2)
    expect(getActivePage(7, 8, 4)).toBe(3)
  })

  it('clamps when pageCount exceeds item count', () => {
    // 2 items, asking for 4 pages → effectively 2 pages
    expect(getActivePage(0, 2, 4)).toBe(0)
    expect(getActivePage(1, 2, 4)).toBe(1)
  })
})
