import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'
import {
  flipHorizontal,
  scaleUp,
  scaleDown,
  trimEmptyLines,
  trimEmptyColumns,
} from '../utils/asciiUtils'

interface AsciiPreviewPanelProps {
  /** Read-only original art shown in the left column. */
  currentArt: string
  /** Initial previewed art (the LLM's first set_ascii_art payload). */
  art: string
  /** Optional human-readable note from the LLM about this change. */
  description?: string
  onApply: (art: string) => void
  onClose: () => void
  /** Refine the art: given current preview + instruction, return new art. */
  onRequestAI: (currentArt: string, instruction: string) => Promise<string>
}

/** AI chips send a refinement instruction to the model. */
const AI_CHIPS: { key: string; instruction: string }[] = [
  { key: 'hat', instruction: 'add a hat' },
  { key: 'scarf', instruction: 'add a scarf' },
  { key: 'simpler', instruction: 'make it simpler with fewer details' },
  { key: 'cuter', instruction: 'make it cuter, rounder lines' },
  { key: 'cartoon', instruction: 'make it more cartoon-style' },
]

/** Local chips are pure string ops — no network, instant, always enabled. */
const LOCAL_CHIPS: { key: string; op: (art: string) => string }[] = [
  { key: 'flip', op: flipHorizontal },
  { key: 'scaleUp', op: scaleUp },
  { key: 'scaleDown', op: scaleDown },
  { key: 'trimLines', op: trimEmptyLines },
  { key: 'trimCols', op: trimEmptyColumns },
]

const chipLabelKey = (key: string): TranslationKey =>
  `ascii.chip.${key}` as TranslationKey

export function AsciiPreviewPanel({
  currentArt,
  art,
  description,
  onApply,
  onClose,
  onRequestAI,
}: AsciiPreviewPanelProps) {
  const { t: tr } = useTranslation()
  const [preview, setPreview] = useState(art)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const applyRef = useRef<HTMLButtonElement>(null)

  // Apply button is auto-focused so Enter writes immediately (spec requirement).
  useEffect(() => {
    applyRef.current?.focus()
  }, [])

  // Escape closes the drawer without writing. Mounted only while open, so this
  // listener lives exactly for the drawer's lifetime.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Each AI round sends only [latest preview] + [this instruction] — no message
  // history accumulates (D3). On failure the preview is left untouched.
  const runAi = async (instruction: string) => {
    if (loading || !instruction.trim()) return
    setLoading(true)
    setError(null)
    try {
      const next = await onRequestAI(preview, instruction)
      if (next.trim()) setPreview(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    const instruction = input.trim()
    if (!instruction) return
    setInput('')
    void runAi(instruction)
  }

  return createPortal(
    <div className="ascii-overlay" onMouseDown={onClose}>
      <div
        className="ascii-drawer"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('ascii.title')}
      >
        <header className="ascii-header">
          <span className="ascii-title">{tr('ascii.title')}</span>
          <button className="ascii-close" onClick={onClose} aria-label="close">×</button>
        </header>

        {description && <p className="ascii-desc">{description}</p>}

        <div className="ascii-columns">
          <div className="ascii-col">
            <span className="ascii-col-label">{tr('ascii.label.original')}</span>
            <pre className="ascii-pre">{currentArt}</pre>
          </div>
          <div className="ascii-col">
            <span className="ascii-col-label">
              {tr('ascii.label.preview')}
              {loading && <span className="ascii-spinner" aria-label="loading" />}
            </span>
            <pre className="ascii-pre">{preview}</pre>
            {error && <div className="ascii-error">⚠ {error}</div>}
          </div>
        </div>

        <div className="ascii-chips">
          <div className="ascii-chip-group">
            <span className="ascii-group-label">{tr('ascii.group.ai')}</span>
            {AI_CHIPS.map(chip => (
              <button
                key={chip.key}
                type="button"
                className="ascii-chip ascii-chip-ai"
                disabled={loading}
                onClick={() => void runAi(chip.instruction)}
              >
                {tr(chipLabelKey(chip.key))}
              </button>
            ))}
          </div>
          <div className="ascii-chip-group">
            <span className="ascii-group-label">{tr('ascii.group.adjust')}</span>
            {LOCAL_CHIPS.map(chip => (
              <button
                key={chip.key}
                type="button"
                className="ascii-chip ascii-chip-local"
                onClick={() => setPreview(chip.op(preview))}
              >
                {tr(chipLabelKey(chip.key))}
              </button>
            ))}
          </div>
        </div>

        <div className="ascii-input-row">
          <input
            className="ascii-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={tr('ascii.input.placeholder')}
            disabled={loading}
            spellCheck={false}
          />
          <button
            type="button"
            className="ascii-send"
            disabled={loading || !input.trim()}
            onClick={handleSend}
            aria-label="send"
          >
            →
          </button>
        </div>

        <footer className="ascii-footer">
          <button type="button" className="ascii-btn ascii-btn-discard" onClick={onClose}>
            {tr('ascii.action.discard')}
          </button>
          <button
            ref={applyRef}
            type="button"
            className="ascii-btn ascii-btn-apply"
            onClick={() => onApply(preview)}
          >
            {tr('ascii.action.apply')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
