// Gera os ícones PNG a partir dos SVGs originais em assets/icons.
// Uso: npm run icons
// Requer um Chromium do Playwright (`npx playwright install chromium`) ou o caminho de
// um Chromium em CLIPSTER_CHROMIUM_PATH.
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** [svg de origem, arquivo de saída, tamanho em px] */
const targets = [
  ['assets/icons/app.svg', 'build/icon.png', 1024],
  ['assets/icons/app.svg', 'resources/icon.png', 512],
  ['assets/icons/tray.svg', 'resources/tray/tray.png', 16],
  ['assets/icons/tray.svg', 'resources/tray/tray@1.25x.png', 20],
  ['assets/icons/tray.svg', 'resources/tray/tray@1.5x.png', 24],
  ['assets/icons/tray.svg', 'resources/tray/tray@2x.png', 32],
  ['assets/icons/trayTemplate.svg', 'resources/tray/trayTemplate.png', 16],
  ['assets/icons/trayTemplate.svg', 'resources/tray/trayTemplate@2x.png', 32]
];

const executablePath = process.env.CLIPSTER_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  for (const [source, output, size] of targets) {
    const svg = await readFile(join(root, source), 'utf8');
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`
    );
    await page.locator('img').evaluate((img) => img.decode());
    const outputPath = join(root, output);
    await mkdir(dirname(outputPath), { recursive: true });
    await page.screenshot({
      path: outputPath,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size }
    });
    console.log(`✓ ${output} (${size}px)`);
  }
} finally {
  await browser.close();
}
