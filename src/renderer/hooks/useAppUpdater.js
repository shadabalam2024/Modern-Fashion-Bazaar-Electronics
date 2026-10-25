import { useEffect, useState, useCallback } from 'react'

// Shared update-check logic used by the update popup (Navbar) and the Settings "Updates" tab.
// Every page mounts its own Navbar, so the state lives at module level: an update found at launch
// is still known after navigating, and "Later" stays dismissed until the app is next opened.
const shared = {
  status: 'idle', // idle | checking | available | downloading | downloaded | not-available | error
  version: null,
  progress: 0,
  error: '',
  dismissed: false, // user pressed "Later" for this app session
  installAfterDownload: false // user pressed "Update now"
}
const subscribers = new Set()
const publish = (patch) => {
  Object.assign(shared, patch)
  subscribers.forEach(fn => fn({ ...shared }))
}

let listening = false
function listen() {
  if (listening || !window.ipcRenderer) return
  listening = true
  window.ipcRenderer.on('update-available', (info) => publish({ status: 'available', version: info?.version, dismissed: false }))
  window.ipcRenderer.on('update-not-available', () => publish({ status: shared.status === 'checking' ? 'not-available' : shared.status }))
  window.ipcRenderer.on('update-download-progress', (p) => publish({ status: 'downloading', progress: p?.percent || 0 }))
  window.ipcRenderer.on('update-downloaded', () => {
    publish({ status: 'downloaded' })
    if (shared.installAfterDownload) window.ipcRenderer.invoke('install-update-now')
  })
  window.ipcRenderer.on('update-error', (e) => publish({ status: 'error', error: e?.message || 'Update check failed', installAfterDownload: false }))
}

export default function useAppUpdater() {
  const [state, setState] = useState({ ...shared })
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    listen()
    setState({ ...shared })
    subscribers.add(setState)
    window.ipcRenderer.invoke('get-app-version').then(setCurrentVersion)
    return () => { subscribers.delete(setState) }
  }, [])

  const checkForUpdates = useCallback(async () => {
    publish({ status: 'checking', error: '', dismissed: false })
    const result = await window.ipcRenderer.invoke('check-for-updates')
    if (!result.success) publish({ status: 'error', error: result.message || 'Could not check for updates' })
  }, [])

  // "Update now": download, then restart into the new version as soon as it is ready
  const updateNow = useCallback(async () => {
    publish({ installAfterDownload: true, status: 'downloading', progress: 0, error: '' })
    const result = await window.ipcRenderer.invoke('download-update')
    if (!result.success) publish({ status: 'error', error: result.message || 'Could not download the update', installAfterDownload: false })
  }, [])

  const later = useCallback(() => publish({ dismissed: true }), [])

  const installNow = useCallback(() => {
    window.ipcRenderer.invoke('install-update-now')
  }, [])

  return { ...state, currentVersion, checkForUpdates, updateNow, later, installNow }
}
