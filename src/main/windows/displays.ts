import { screen } from 'electron';
import type { DisplayInfo } from './placement';

/** Lê os monitores do Electron no formato usado pelas funções puras de posicionamento. */
export function currentDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    isPrimary: display.id === primaryId
  }));
}
