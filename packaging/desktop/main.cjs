const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const hospitalUrl = process.env.HOSPITAL_APP_URL || 'https://hopitalcentreisiro.online';
const applicationIcon = path.join(__dirname, 'build', 'icon.png');

function allowedNavigation(url) {
  try {
    const target = new URL(url);
    const hospital = new URL(hospitalUrl);
    return target.origin === hospital.origin;
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#004a44',
    title: 'CHI Isiro',
    icon: applicationIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => {
    window.setFullScreen(true);
    window.show();
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
      window.maximize();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedNavigation(url)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowedNavigation(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    void window.loadFile(path.join(__dirname, 'offline.html'), {
      query: { message: errorDescription, url: validatedUrl || hospitalUrl },
    });
  });

  void window.loadURL(hospitalUrl);
}

app.setAppUserModelId('cd.isiro.hopital.desktop');
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
