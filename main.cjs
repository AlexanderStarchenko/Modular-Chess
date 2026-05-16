const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = process.argv.includes('--dev');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            contextIsolation: false,
            webSecurity: false // Necessary for WASM and local files
        },
        autoHideMenuBar: true,
        title: "Modular Chess"
    });

    if (isDev) {
        win.loadURL('http://localhost:3000');
        // win.webContents.openDevTools(); // Optional: open dev tools on start
    } else {
        win.loadFile('index.html');
    }

    // Hotkeys for development
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key.toLowerCase() === 'r') {
            win.reload();
            event.preventDefault();
        }
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            win.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
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
