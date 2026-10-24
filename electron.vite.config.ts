import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      sourcemap: true
    }
  },
  preload: {
    build: {
      // O preload roda com `sandbox: true`: tudo precisa estar dentro de um único arquivo CJS.
      externalizeDeps: false,
      sourcemap: true
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      sourcemap: true,
      minify: true,
      rolldownOptions: {
        input: {
          character: resolve('src/renderer/character.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
});
