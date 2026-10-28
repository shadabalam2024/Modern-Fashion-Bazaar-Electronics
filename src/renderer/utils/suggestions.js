// Starter suggestions for the product fields, shown along with what is already in Inventory,
// so the drop-downs are useful before much has been entered.
export const COMMON_ITEMS = [
  'Fridge', 'Refrigerator', 'Washing Machine', 'Air Conditioner', 'Television', 'Microwave Oven', 'Mixer Grinder',
  'Iron', 'Fan', 'Cooler', 'Geyser', 'Water Purifier', 'Induction Cooktop', 'Gas Stove', 'Toaster', 'Kettle',
  'Vacuum Cleaner', 'Heater', 'Juicer', 'Inverter', 'Speaker', 'Home Theatre'
]
export const COMMON_COLORS = ['Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Yellow', 'Brown', 'Pink', 'Gold', 'Orange']
export const COMMON_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40']

// existing values first (they are what the shop really uses), then the starter ones not already there
export const mergeSuggestions = (existing, starters = []) => {
  const seen = new Set()
  const out = []
  for (const v of [...existing, ...starters]) {
    const t = String(v || '').trim()
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t) }
  }
  return out
}

// Same rule the main process applies when saving: reuse an existing spelling, otherwise capitalise each
// word (short all-capital words like LG or TV stay) and upper-case sizes. Keeps "samsung" and "Samsung" one value.
export const labelCase = (value, existing = [], upper = false) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const match = existing.find(e => String(e).trim().toLowerCase() === text.toLowerCase())
  if (match) return String(match).trim()
  if (upper) return text.toUpperCase()
  return text.split(' ').map(w => (w.length <= 2 && /[A-Z]/.test(w) && w === w.toUpperCase()) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}
