// Tracks which user is logged in on each renderer window (keyed by the sender's
// webContents.id, which the renderer cannot forge/spoof - it's assigned by Electron
// itself to the IPC event, never something a client sends us in the message payload).
const sessions = new Map();

// webContents ids of windows we ourselves created for an internal, non-interactive
// purpose (currently: the hidden invoice-print window opened from print-invoice).
// These windows load our own trusted code, not arbitrary user input, but they run as
// a separate renderer/webContents with no login session of their own - so reads they
// need (get-invoice, get-shop-settings, get-shop-logo) must bypass the login check.
const trustedWindows = new Set();

function setSession(webContentsId, session) {
  sessions.set(webContentsId, session);
}

function getSession(webContentsId) {
  return sessions.get(webContentsId) || null;
}

function clearSession(webContentsId) {
  sessions.delete(webContentsId);
}

function markTrusted(webContentsId) {
  trustedWindows.add(webContentsId);
}

function unmarkTrusted(webContentsId) {
  trustedWindows.delete(webContentsId);
}

// Call at the top of a sensitive IPC handler: `const denied = checkPermission(event, 'inventory'); if (denied) return denied;`
// `permission` is either a permissions-JSON key (e.g. 'billing', 'inventory'), the
// literal 'admin' to require the Admin role specifically, or omitted/null to just
// require that *some* user is logged in (for reads shared across pages with different
// permissions, e.g. product lookups used by both Billing and Purchase). Returns null
// when allowed, or a { success: false, message } object (matching this app's existing
// error-response shape) when denied - safe to `return` directly from any handler that
// already returns { success, message } on failure.
function checkPermission(event, permission) {
  const session = getSession(event.sender.id);
  if (!session) {
    return { success: false, message: 'Not logged in' };
  }
  if (!permission) {
    return null;
  }
  if (permission === 'admin') {
    if (session.role !== 'Admin') {
      return { success: false, message: 'Admin access required' };
    }
    return null;
  }
  if (!session.permissions?.[permission]) {
    return { success: false, message: 'You do not have permission to do this' };
  }
  return null;
}

// Like checkPermission(event) (login-only), but also allows the internal print window.
function requireLoginOrTrusted(event) {
  if (trustedWindows.has(event.sender.id)) {
    return null;
  }
  return checkPermission(event);
}

module.exports = { setSession, getSession, clearSession, markTrusted, unmarkTrusted, checkPermission, requireLoginOrTrusted };
