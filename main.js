const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Clicks pass through transparent areas by default
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile('index.html');

  // Toggle click-through based on whether cursor is over 3D content
  ipcMain.on('set-ignore-mouse', (_event, ignore) => {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

app.disableHardwareAcceleration(); // needed for transparency on some systems
app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
