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
  // Con varias versiones publicadas seguidas, el parche diferencial (blockmap)
  // entre una instalación vieja y la nueva a veces no coincide y falla a medio
  // aplicar (deja la app a medio actualizar). Forzar la descarga completa del
  // instalador es más lento pero no depende de que el historial de blockmaps
  // esté intacto — evita ese modo de falla silencioso.
  autoUpdater.disableDifferentialDownload = true;

  let downloadFailed = false;

  autoUpdater.on("update-downloaded", () => {
    downloadFailed = false;
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
    console.error("Error buscando/descargando actualización:", err);
    // Solo se avisa la primera vez que falla en esta sesión (y solo si ya
    // había empezado a descargar algo) — así una racha de reintentos por mala
    // conexión no bombardea a la usuaria con el mismo aviso cada hora.
    if (!downloadFailed && mainWindow) {
      downloadFailed = true;
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "No se pudo actualizar",
        message: "JerseyID Envíos no pudo descargar la actualización automáticamente.",
        detail:
          "La app sigue funcionando normalmente con la versión actual. Si esto se repite, baja la última versión a mano desde GitHub.",
        buttons: ["Entendido"]
      });
    }
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
