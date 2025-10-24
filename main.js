const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    kiosk: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true // Development için, production'da false yapın
    }
  });

  mainWindow.loadFile('index.html');
  
  // Development için DevTools'u aç
  mainWindow.webContents.openDevTools();
  
  // Kiosk modundan çıkmayı engelle (F11, ESC vb.)
  mainWindow.setFullScreen(true);
  mainWindow.setKiosk(true);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});