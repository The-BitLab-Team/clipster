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
const normalizeText = (text) => text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
const generateReply = (profile, messages) => {
    const lastUserMessage = messages.filter((m) => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) {
        return profile.exampleGreetings[0] ?? 'Olá! Como posso ajudar?';
    }
    const input = normalizeText(lastUserMessage.content);
    // TODO: integrar com LLM local ou API. Manter fallback offline por padrão.
    const isQuestion = input.includes('?') || input.startsWith('como') || input.startsWith('o que');
    const isError = input.includes('erro') || input.includes('falha') || input.includes('bug');
    const isSetup = input.includes('instalar') || input.includes('configurar') || input.includes('setup');
    if (profile.id === 'witty') {
        if (isError) {
            return 'Ah, os erros. Me diga o texto exato do erro e o que você estava fazendo. Eu prometo não julgar (muito).';
        }
        if (isSetup) {
            return 'Configuração, hein? Diga o ambiente e o objetivo, e eu te poupo de 3 horas de sofrimento.';
        }
        if (isQuestion) {
            return 'Vamos lá: explique seu contexto em 2 frases e eu te devolvo um plano de ação.';
        }
        return 'Entendi. Me dê mais detalhes (passos, objetivo, e o que já tentou) e eu ajusto a rota.';
    }
    if (isError) {
        return 'Sinto muito pelo erro. Compartilhe a mensagem exata e os passos para reproduzir, e eu ajudo a diagnosticar.';
    }
    if (isSetup) {
        return 'Claro! Informe seu sistema e o que deseja configurar, e eu te passo um passo a passo objetivo.';
    }
    if (isQuestion) {
        return 'Para ajudar melhor, descreva seu contexto e o objetivo final. Posso sugerir um plano inicial.';
    }
    return 'Obrigado pela mensagem. Se puder detalhar o objetivo e o contexto, consigo orientar melhor.';
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
