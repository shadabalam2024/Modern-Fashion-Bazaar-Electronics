import { useEffect, useState, useCallback } from 'react'

// Shared update-check logic used by both the Navbar popup and the Settings "Updates" tab.
// Each component that calls this gets its own independent listeners, fed by the same
// main-process broadcasts, so they naturally stay in sync without any shared context.
export default function useAppUpdater() {
  const [status, setStatus] = useState('idle') // idle | checking | available | downloading | downloaded | not-available | error
  const [version, setVersion] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    window.ipcRenderer.invoke('get-app-version').then(setCurrentVersion)

    const onAvailable = (info) => { setStatus('available'); setVersion(info?.version) }
    const onNotAvailable = () => setStatus(s => (s === 'checking' ? 'not-available' : s))
    const onProgress = (p) => { setStatus('downloading'); setProgress(p?.percent || 0) }
    const onDownloaded = () => setStatus('downloaded')
    const onError = (e) => { setStatus('error'); setError(e?.message || 'Update check failed') }

    window.ipcRenderer.on('update-available', onAvailable)
    window.ipcRenderer.on('update-not-available', onNotAvailable)
    window.ipcRenderer.on('update-download-progress', onProgress)
    window.ipcRenderer.on('update-downloaded', onDownloaded)
    window.ipcRenderer.on('update-error', onError)

    return () => {
      window.ipcRenderer.removeListener('update-available', onAvailable)
      window.ipcRenderer.removeListener('update-not-available', onNotAvailable)
      window.ipcRenderer.removeListener('update-download-progress', onProgress)
      window.ipcRenderer.removeListener('update-downloaded', onDownloaded)
      window.ipcRenderer.removeListener('update-error', onError)
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    setStatus('checking')
    setError('')
    const result = await window.ipcRenderer.invoke('check-for-updates')
    if (!result.success) {
      setStatus('error')
      setError(result.message || 'Could not check for updates')
    }
  }, [])

  const installNow = useCallback(() => {
    window.ipcRenderer.invoke('install-update-now')
  }, [])

  return { status, version, progress, error, currentVersion, checkForUpdates, installNow }
}
