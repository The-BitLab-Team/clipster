import { contextBridge, ipcRenderer } from 'electron';
import { ChatMessage, PersonalityMode } from '../shared/types';

contextBridge.exposeInMainWorld('clipster', {
  getMode: (): Promise<PersonalityMode> => ipcRenderer.invoke('clipster:getMode'),
  setMode: (mode: PersonalityMode): Promise<PersonalityMode> =>
    ipcRenderer.invoke('clipster:setMode', mode),
  sendMessage: (message: string, history: ChatMessage[]) =>
    ipcRenderer.invoke('clipster:sendMessage', message, history),
  onModeChanged: (callback: (mode: PersonalityMode) => void) => {
    ipcRenderer.on('clipster:modeChanged', (_event, mode: PersonalityMode) => callback(mode));
  },
});
