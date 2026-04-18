const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    scanFolder: (path, mode) => ipcRenderer.invoke('scan-folder', path, mode),
    onScanProgress: (callback) => ipcRenderer.on('scan-progress', callback),
    deleteFiles: (files) => ipcRenderer.invoke('delete-files', files)
});
