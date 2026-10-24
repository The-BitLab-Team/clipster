import { contextBridge, ipcRenderer } from 'electron';
import { createClipsterApi } from './api';

// Somente a API tipada vai para o renderer; o ipcRenderer nunca é exposto (SPEC §17.1).
contextBridge.exposeInMainWorld('clipster', createClipsterApi(ipcRenderer));
