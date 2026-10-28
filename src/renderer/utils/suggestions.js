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

// Names are saved in capital letters (the main process does the same), so one spelling exists per word.
export const labelCase = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
