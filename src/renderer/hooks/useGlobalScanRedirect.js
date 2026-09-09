import { useEffect, useRef } from 'react'
import { createScanTracker } from '../utils/scanTracker'

const PAUSE_MS = 300 // gap that means "this is a new burst of keystrokes, not a continuation"

// Barcode scanners are keyboard-wedge devices - they have no awareness of the app's
// UI and just type into whatever field currently has OS focus. If the user clicks into
// an unrelated field (e.g. Customer Name) and then scans, the barcode would otherwise
// garble that field instead of reaching the intended search/barcode input.
//
// This hook watches every keystroke on the page. When it recognizes scanner-speed
// input landing anywhere OTHER than `targetRef`'s field, it restores that field to
// whatever it said before the scan started and hands the scanned code to `onScan`
// instead - so the wrong field ends up untouched and the scan still works.
export default function useGlobalScanRedirect(targetRef, onScan) {
  const trackerRef = useRef(createScanTracker())
  const bufferRef = useRef('')
  const captureValueRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e) => {
      const active = document.activeElement

      // Already in the right field (or it's not focused at all) - nothing to redirect.
      if (!active || active === targetRef.current) {
        trackerRef.current.reset()
        bufferRef.current = ''
        return
      }

      // Only ever intercept plain single-line text inputs - never selects, checkboxes,
      // buttons, textareas, or the field we're redirecting TO.
      const isPlainTextInput = active.tagName === 'INPUT' &&
        ['text', 'search', 'tel', 'number', 'email', ''].includes(active.type)
      if (!isPlainTextInput) return

      const now = Date.now()
      const gap = lastKeyTimeRef.current ? now - lastKeyTimeRef.current : Infinity
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        trackerRef.current.onKeystroke()
        const isScan = bufferRef.current.length >= 4 && trackerRef.current.isScanLike()
        if (isScan) {
          e.preventDefault()
          e.stopPropagation()

          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          nativeSetter.call(active, captureValueRef.current)
          active.dispatchEvent(new Event('input', { bubbles: true }))

          const code = bufferRef.current
          bufferRef.current = ''
          trackerRef.current.reset()
          onScan(code)
        } else {
          bufferRef.current = ''
          trackerRef.current.reset()
        }
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return // ignore modifiers/navigation

      if (gap > PAUSE_MS || bufferRef.current === '') {
        bufferRef.current = ''
        captureValueRef.current = active.value
        trackerRef.current.reset()
      }
      bufferRef.current += e.key
      trackerRef.current.onKeystroke()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [targetRef, onScan])
}
