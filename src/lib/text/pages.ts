/**
 * Splits a flat array of items (text chunks) into `pageCount` balanced pages.
 * Each page is a contiguous slice. The last page absorbs any remainder.
 *
 * @param items - The full ordered list of chunks/items.
 * @param pageCount - Number of pages to distribute into (1–4).
 * @returns An array of `pageCount` arrays, each containing a slice of items.
 */
export function splitIntoPages<T>(items: T[], pageCount: number): T[][] {
  if (!pageCount || pageCount <= 1 || items.length === 0) {
    return [items]
  }

  const clampedCount = Math.min(pageCount, items.length)
  const baseSize = Math.floor(items.length / clampedCount)
  const remainder = items.length % clampedCount

  const pages: T[][] = []
  let offset = 0

  for (let i = 0; i < clampedCount; i++) {
    // Distribute remainder across the first `remainder` pages
    const pageSize = baseSize + (i < remainder ? 1 : 0)
    pages.push(items.slice(offset, offset + pageSize))
    offset += pageSize
  }

  return pages
}

/**
 * Returns the page index (0-based) that contains the item at `activeIndex`.
 */
export function getActivePage(activeIndex: number, totalItems: number, pageCount: number): number {
  if (pageCount <= 1 || totalItems === 0) {
    return 0
  }

  const clampedCount = Math.min(pageCount, totalItems)
  const baseSize = Math.floor(totalItems / clampedCount)
  const remainder = totalItems % clampedCount

  let offset = 0

  for (let i = 0; i < clampedCount; i++) {
    const pageSize = baseSize + (i < remainder ? 1 : 0)
    if (activeIndex < offset + pageSize) {
      return i
    }
    offset += pageSize
  }

  return clampedCount - 1
}
