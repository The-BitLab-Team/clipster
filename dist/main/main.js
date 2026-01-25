"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let mainWindow = null;
let tray = null;
let currentMode = 'helpful';
let personalities;
let isQuitting = false;
const isDev = !electron_1.app.isPackaged;
const loadPersonalities = () => {
    const basePath = isDev
        ? path_1.default.join(electron_1.app.getAppPath(), 'config', 'personalities')
        : path_1.default.join(process.resourcesPath, 'app', 'config', 'personalities');
    const helpfulPath = path_1.default.join(basePath, 'helpful.json');
    const wittyPath = path_1.default.join(basePath, 'witty.json');
    const helpful = JSON.parse(fs_1.default.readFileSync(helpfulPath, 'utf-8'));
    const witty = JSON.parse(fs_1.default.readFileSync(wittyPath, 'utf-8'));
    return {
        helpful,
        witty,
    };
};
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 360,
        height: 520,
        transparent: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            sandbox: true,
        },
    });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    // Minimiza para bandeja ao fechar
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
};
const createTray = () => {
    // Ícone placeholder 1x1. Substituir por um ícone real.
    const emptyIcon = electron_1.nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWP4//8/AwAI/AL+qskI+QAAAABJRU5ErkJggg==');
    tray = new electron_1.Tray(emptyIcon);
    tray.setToolTip('Clipster');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Mostrar/Esconder',
            click: () => {
                if (mainWindow?.isVisible()) {
                    mainWindow.hide();
                }
                else {
                    mainWindow?.show();
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Sair',
            click: () => {
                isQuitting = true;
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (mainWindow?.isVisible()) {
            mainWindow.hide();
        }
        else {
            mainWindow?.show();
        }
    });
};
const generateReply = (profile, messages) => {
    const lastUserMessage = messages.filter((m) => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) {
        return profile.exampleGreetings[0] ?? 'Olá! Como posso ajudar?';
    }
    // TODO: integrar com LLM local ou API. Manter fallback offline por padrão.
    const base = profile.id === 'witty'
        ? 'Certo. Aqui vai um resumo objetivo:'
        : 'Claro! Aqui vai uma orientação inicial:';
    return `${base} ${lastUserMessage.content}`;
};
electron_1.app.whenReady().then(() => {
    personalities = loadPersonalities();
    createWindow();
    createTray();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    // Mantém app vivo para bandeja
});
electron_1.ipcMain.handle('clipster:getMode', () => currentMode);
electron_1.ipcMain.handle('clipster:setMode', (_event, mode) => {
    currentMode = mode;
    mainWindow?.webContents.send('clipster:modeChanged', mode);
    return currentMode;
});
electron_1.ipcMain.handle('clipster:sendMessage', (_event, message, history) => {
    const profile = personalities[currentMode];
    const reply = generateReply(profile, [...history, { role: 'user', content: message }]);
    return {
        reply,
        mode: currentMode,
        displayName: profile.displayName,
    };
});
