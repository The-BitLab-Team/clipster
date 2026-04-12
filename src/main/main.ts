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

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const generateReply = (profile: PersonalityProfile, messages: ChatMessage[]): string => {
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
