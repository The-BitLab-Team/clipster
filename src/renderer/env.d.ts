/// <reference types="vite/client" />
import type { ClipsterApi } from '../shared/ipc/api';

declare global {
  interface Window {
    /** API exposta pelo preload. Única ponte entre a interface e o main process. */
    readonly clipster: ClipsterApi;
  }
}

export {};
