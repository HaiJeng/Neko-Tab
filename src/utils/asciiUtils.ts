/**
 * Pure, immutable string operations on ASCII art. Each function returns a new
 * string and never mutates its input. Used by the AsciiPreviewPanel "local"
 * chips (flip / scale / trim) so deterministic edits don't burn AI tokens.
 */

/** Reverse the character order of every line, preserving line structure. */
export function flipHorizontal(art: string): string {
  if (!art) return ''
  return art
    .split('\n')
    .map(line => [...line].reverse().join(''))
    .join('\n')
}

/**
 * Double the art: each character repeats horizontally, and every line is
 * duplicated vertically. Keeps the original aspect ratio.
 */
export function scaleUp(art: string): string {
  if (!art) return ''
  const widened = art
    .split('\n')
    .map(line => [...line].map(ch => ch + ch).join(''))
  return widened.flatMap(line => [line, line]).join('\n')
}

/**
 * Halve the art: keep even-indexed characters on each line and even-indexed
 * lines. Keeps the original aspect ratio when the art was produced by scaleUp.
 */
export function scaleDown(art: string): string {
  if (!art) return ''
  return art
    .split('\n')
    .filter((_, i) => i % 2 === 0)
    .map(line => [...line].filter((_, i) => i % 2 === 0).join(''))
    .join('\n')
}

/** Remove blank lines (whitespace-only) from the top and bottom only. */
export function trimEmptyLines(art: string): string {
  if (!art) return ''
  const lines = art.split('\n')
  const isBlank = (l: string) => l.trim() === ''
  let start = 0
  while (start < lines.length && isBlank(lines[start])) start++
  let end = lines.length - 1
  while (end > start && isBlank(lines[end])) end--
  return lines.slice(start, end + 1).join('\n')
}

/**
 * Strip the common leading whitespace column shared by all non-blank lines,
 * and trim trailing whitespace on every line. Collapses the bounding box of
 * the art without distorting internal alignment.
 */
export function trimEmptyColumns(art: string): string {
  if (!art) return ''
  const lines = art.split('\n')
  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    const match = line.match(/^\s*/)
    const indent = match ? match[0].length : 0
    if (indent < minIndent) minIndent = indent
  }
  if (!Number.isFinite(minIndent)) minIndent = 0
  return lines
    .map(line => {
      const dedented = line.length >= minIndent ? line.slice(minIndent) : line
      return dedented.replace(/\s+$/, '')
    })
    .join('\n')
}
