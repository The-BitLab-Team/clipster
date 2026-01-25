import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { ChatMessage, PersonalityMode, PersonalityProfile } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentMode: PersonalityMode = 'helpful';
let personalities: Record<PersonalityMode, PersonalityProfile>;
let isQuitting = false;

const isDev = !app.isPackaged;

const loadPersonalities = (): Record<PersonalityMode, PersonalityProfile> => {
  const basePath = isDev
    ? path.join(app.getAppPath(), 'config', 'personalities')
    : path.join(process.resourcesPath, 'app', 'config', 'personalities');

  const helpfulPath = path.join(basePath, 'helpful.json');
  const wittyPath = path.join(basePath, 'witty.json');

  const helpful = JSON.parse(fs.readFileSync(helpfulPath, 'utf-8')) as PersonalityProfile;
  const witty = JSON.parse(fs.readFileSync(wittyPath, 'utf-8')) as PersonalityProfile;

  return {
    helpful,
    witty,
  };
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

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
  const emptyIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWP4//8/AwAI/AL+qskI+QAAAABJRU5ErkJggg=='
  );

  tray = new Tray(emptyIcon);
  tray.setToolTip('Clipster');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar/Esconder',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
};

const generateReply = (profile: PersonalityProfile, messages: ChatMessage[]): string => {
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

app.whenReady().then(() => {
  personalities = loadPersonalities();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Mantém app vivo para bandeja
});

ipcMain.handle('clipster:getMode', () => currentMode);

ipcMain.handle('clipster:setMode', (_event, mode: PersonalityMode) => {
  currentMode = mode;
  mainWindow?.webContents.send('clipster:modeChanged', mode);
  return currentMode;
});

ipcMain.handle('clipster:sendMessage', (_event, message: string, history: ChatMessage[]) => {
  const profile = personalities[currentMode];
  const reply = generateReply(profile, [...history, { role: 'user', content: message }]);
  return {
    reply,
    mode: currentMode,
    displayName: profile.displayName,
  };
});
