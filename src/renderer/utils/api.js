export const invokeIPC = (channel, data) => {
  return window.ipcRenderer.invoke(channel, data)
}

export const sendIPC = (channel, data) => {
  return window.ipcRenderer.send(channel, data)
}
