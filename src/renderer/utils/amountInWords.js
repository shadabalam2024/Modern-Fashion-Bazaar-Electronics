const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
}

function below1000(n) {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : '', rest ? below100(rest) : ''].filter(Boolean).join(' ')
}

// Same as src/main/amountInWords.js - keep them in step.
export function amountInWords(amount) {
  const value = Math.round(Math.abs(Number(amount) || 0) * 100)
  let rupees = Math.floor(value / 100)
  const paise = value % 100
  if (rupees === 0 && paise === 0) return 'INR Zero Only'

  const parts = []
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000
  const lakh = Math.floor(rupees / 100000); rupees %= 100000
  const thousand = Math.floor(rupees / 1000); rupees %= 1000
  if (crore) parts.push(`${below100(crore)} Crore`)
  if (lakh) parts.push(`${below100(lakh)} Lakh`)
  if (thousand) parts.push(`${below100(thousand)} Thousand`)
  if (rupees) parts.push(below1000(rupees))

  const words = parts.join(' ')
  const paiseWords = paise ? `${words ? ' and ' : ''}${below100(paise)} Paise` : ''
  return `INR ${words}${paiseWords} Only`
}
