const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");

const isDev = process.env.NODE_ENV === "development";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Actualización disponible",
        message: "Se descargó una nueva versión de JerseyID Envíos.",
        detail: "La app se va a reiniciar para instalarla.",
        buttons: ["Reiniciar ahora"]
      })
      .then(() => autoUpdater.quitAndInstall());
  });

  autoUpdater.on("error", (err) => {
    console.error("Error buscando actualizaciones:", err);
  });

  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  if (!isDev) {
    setupAutoUpdates();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
