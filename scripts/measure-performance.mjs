// Mede o desempenho do Clipster (SPEC §25): tempo até o personagem aparecer, CPU e memória
// parado (à disposição e dormindo). Uso: `npm run measure` (faz o build antes).
//
// - Usa o build de `out/` com uma pasta de dados temporária: não toca nas suas configurações.
// - O app instalado não pode ser medido assim (os Fuses bloqueiam a automação, como deve ser);
//   o build de `out/` é o mesmo código, sem o empacotamento.
// - Números do próprio Electron (`app.getAppMetrics()`): CPU somada de todos os processos, em
//   % de um núcleo. Memória comparada com a meta: no Windows, a memória privada (a coluna
//   "Memória" do Gerenciador de Tarefas); no Linux, o PSS (memória compartilhada dividida entre
//   os processos). O "working set" somado aparece só como referência: ele conta várias vezes
//   as bibliotecas compartilhadas.
//
// Opções: --seconds=N  duração de cada amostragem (padrão 30)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secondsArg = process.argv.find((arg) => arg.startsWith('--seconds='));
const seconds = Math.max(10, Number(secondsArg?.split('=')[1] ?? 30) || 30);
const SAMPLE_MS = 2000;
const sleepAfterMs = (seconds + 15) * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Uma leitura de `app.getAppMetrics()`, somando todos os processos. */
async function snapshot(app) {
  return app.evaluate(({ app: electronApp }) => {
    const metrics = electronApp.getAppMetrics();
    let cpu = 0;
    let workingSetKb = 0;
    let privateKb = 0;
    for (const metric of metrics) {
      cpu += metric.cpu.percentCPUUsage;
      workingSetKb += metric.memory.workingSetSize;
      privateKb += metric.memory.privateBytes ?? 0;
    }
    return { cpu, workingSetKb, privateKb, pids: metrics.map((metric) => metric.pid) };
  });
}

/** Linux: PSS somado dos processos, em KB (0 se não der para ler). */
function pssKb(pids) {
  if (process.platform !== 'linux') return 0;
  let total = 0;
  for (const pid of pids) {
    try {
      const match = /^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
      total += Number(match?.[1] ?? 0);
    } catch {
      // Processo terminou entre a leitura das métricas e esta.
    }
  }
  return total;
}

/** Média de CPU e maior memória ao longo de `durationMs`. */
async function sample(app, durationMs) {
  // A primeira leitura de CPU do Electron é relativa ao início: descartamos.
  await snapshot(app);
  const readings = [];
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    await wait(SAMPLE_MS);
    readings.push(await snapshot(app));
  }
  const cpu = readings.reduce((sum, item) => sum + item.cpu, 0) / readings.length;
  const last = readings.at(-1);
  const privateKb = last.privateKb > 0 ? last.privateKb : pssKb(last.pids);
  return {
    cpu,
    workingSetMb: last.workingSetKb / 1024,
    // Memória comparada com a meta: privada (Windows), PSS (Linux) ou, sem elas, o working set.
    memoryMb: (privateKb > 0 ? privateKb : last.workingSetKb) / 1024,
    processes: last.pids.length
  };
}

async function characterState(page) {
  return page.locator('#character').getAttribute('data-state');
}

const userDataDir = mkdtempSync(join(tmpdir(), 'clipster-measure-'));
writeFileSync(
  join(userDataDir, 'settings.json'),
  JSON.stringify({ firstRunCompleted: true, ai: { provider: 'demo' } })
);

const startedAt = performance.now();
const app = await electron.launch({
  args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: {
    ...process.env,
    CLIPSTER_E2E: '1',
    CLIPSTER_USER_DATA_DIR: userDataDir,
    CLIPSTER_E2E_SLEEP_AFTER_MS: String(sleepAfterMs)
  }
});

try {
  const page = await app.firstWindow();
  await page.locator('#character[data-state]').waitFor();
  for (;;) {
    const visible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((win) => win.isVisible())
    );
    if (visible) break;
    await wait(20);
  }
  const startupMs = performance.now() - startedAt;
  console.log(`Personagem visível em ${(startupMs / 1000).toFixed(2)} s.`);

  console.log(`Medindo ${seconds} s à disposição…`);
  await wait(5000);
  const idle = await sample(app, seconds * 1000);

  console.log('Esperando o personagem dormir…');
  while ((await characterState(page)) !== 'sleeping') await wait(500);
  // Os "z" animam um pouco e param: mede depois disso.
  await wait(15_000);
  console.log(`Medindo ${seconds} s dormindo…`);
  const sleeping = await sample(app, seconds * 1000);

  const memoryLabel =
    process.platform === 'win32' ? 'privada' : process.platform === 'linux' ? 'PSS' : 'working set';
  const memory = (result) =>
    `${result.memoryMb.toFixed(0)} MB ${memoryLabel} (working set somado: ${result.workingSetMb.toFixed(0)} MB)`;
  const info = await app.evaluate(({ app: electronApp }) => ({
    version: electronApp.getVersion(),
    electron: process.versions.electron,
    platform: `${process.platform} ${process.arch}`
  }));

  console.log('');
  console.log(`Clipster ${info.version} · Electron ${info.electron} · ${info.platform}`);
  console.log(
    `| Situação | CPU (média, % de 1 núcleo) | Memória (todos os ${idle.processes} processos) |`
  );
  console.log('|---|---|---|');
  console.log(`| À disposição | ${idle.cpu.toFixed(2)}% | ${memory(idle)} |`);
  console.log(`| Dormindo | ${sleeping.cpu.toFixed(2)}% | ${memory(sleeping)} |`);
  console.log('');
  console.log(
    `Metas (SPEC §25): personagem em < 2 s; CPU parado < 0,5%; memória ≤ 250 MB. ` +
      `Início: ${startupMs < 2000 ? 'ok' : 'acima da meta'}; CPU: ${
        Math.max(idle.cpu, sleeping.cpu) < 0.5 ? 'ok' : 'acima da meta'
      }; memória: ${idle.memoryMb <= 250 ? 'ok' : 'acima da meta'}.`
  );
} finally {
  await app.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
