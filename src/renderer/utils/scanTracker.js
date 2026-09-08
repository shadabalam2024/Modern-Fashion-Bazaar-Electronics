// Barcode scanners (keyboard-wedge) type a full code in a fast, uniform burst -
// typically a few ms between characters - then send Enter. A person typing or
// correcting a search term takes much longer per keystroke. Track keystroke timing
// so an Enter with an ambiguous (non-exact-barcode) result only auto-adds the first
// match when we're confident a scanner produced the input, not a person who happened
// to press Enter while browsing fuzzy search results.
const FAST_KEYSTROKE_MS = 40
const MIN_KEYS_FOR_SCAN = 4

export function createScanTracker() {
  let lastKeyTime = 0
  let fastStreak = 0
  let totalKeys = 0

  return {
    onKeystroke() {
      const now = Date.now()
      if (lastKeyTime && now - lastKeyTime < FAST_KEYSTROKE_MS) fastStreak++
      lastKeyTime = now
      totalKeys++
    },
    reset() {
      lastKeyTime = 0
      fastStreak = 0
      totalKeys = 0
    },
    isScanLike() {
      return totalKeys >= MIN_KEYS_FOR_SCAN && fastStreak >= totalKeys - 1
    }
  }
}
