// Tracks which user is logged in on each renderer window (keyed by the sender's
// webContents.id, which the renderer cannot forge/spoof - it's assigned by Electron
// itself to the IPC event, never something a client sends us in the message payload).
const sessions = new Map();

function setSession(webContentsId, session) {
  sessions.set(webContentsId, session);
}

function getSession(webContentsId) {
  return sessions.get(webContentsId) || null;
}

function clearSession(webContentsId) {
  sessions.delete(webContentsId);
}

// Call at the top of a sensitive IPC handler: `const denied = checkPermission(event, 'inventory'); if (denied) return denied;`
// `permission` is either a permissions-JSON key (e.g. 'billing', 'inventory') or the
// literal 'admin' to require the Admin role specifically. Returns null when allowed,
// or a { success: false, message } object (matching this app's existing error-response
// shape) when denied - safe to `return` directly from any handler that already returns
// { success, message } on failure.
function checkPermission(event, permission) {
  const session = getSession(event.sender.id);
  if (!session) {
    return { success: false, message: 'Not logged in' };
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

module.exports = { setSession, getSession, clearSession, checkPermission };
