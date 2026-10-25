// The company behind the software. Contact details are optional: anything left empty is simply not shown.
export const COMPANY = 'Swift Software'
export const SUPPORT_WHATSAPP = '' // digits with country code, e.g. '919876543210'
export const SUPPORT_EMAIL = ''
export const WEBSITE = ''

export const hasSupportContact = !!(SUPPORT_WHATSAPP || SUPPORT_EMAIL)

// Opens WhatsApp (or email) with the shop, version and machine ID already filled in.
export async function contactSupport() {
  const [shop, version, license] = await Promise.all([
    window.ipcRenderer.invoke('get-shop-settings').catch(() => null),
    window.ipcRenderer.invoke('get-app-version').catch(() => ''),
    window.ipcRenderer.invoke('check-license').catch(() => null)
  ])
  const text = `Hello ${COMPANY}, I need help with the billing software.\nShop: ${shop?.shop_name || '-'}\nVersion: ${version}\nMachine ID: ${license?.machineId || '-'}`
  const url = SUPPORT_WHATSAPP
    ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`
    : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Support request')}&body=${encodeURIComponent(text)}`
  window.ipcRenderer.invoke('open-support-link', url)
}
