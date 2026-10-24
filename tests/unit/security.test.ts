import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mimeTypeFor, resolveAppRequestPath } from '../../src/main/app/protocolPath';
import { pageUrl } from '../../src/main/app/pages';
import { developmentCsp, PRODUCTION_CSP } from '../../src/main/security/csp';
import { isSafeExternalUrl, isTrustedRendererUrl } from '../../src/main/security/urls';

describe('isSafeExternalUrl', () => {
  it.each([
    ['https://github.com/', true],
    ['http://example.com/docs', true],
    ['javascript:alert(1)', false],
    ['file:///C:/Windows/System32', false],
    ['data:text/html,<b>oi</b>', false],
    ['ms-settings:privacy', false],
    ['https://user:pass@example.com', false],
    ['not a url', false],
    ['', false]
  ])('%s → %s', (url, expected) => {
    expect(isSafeExternalUrl(url)).toBe(expected);
  });
});

describe('isTrustedRendererUrl', () => {
  it('aceita o protocolo do app e o servidor de dev configurado', () => {
    expect(isTrustedRendererUrl('app://clipster/character.html', { devServerOrigin: null })).toBe(
      true
    );
    expect(
      isTrustedRendererUrl('http://localhost:5173/settings.html', {
        devServerOrigin: 'http://localhost:5173'
      })
    ).toBe(true);
  });

  it('recusa outras origens, inclusive parecidas', () => {
    const trusted = { devServerOrigin: 'http://localhost:5173' };
    expect(isTrustedRendererUrl('app://evil/character.html', trusted)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5174/', trusted)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173.evil.com/', trusted)).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/', trusted)).toBe(false);
    expect(isTrustedRendererUrl('file:///tmp/x.html', trusted)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/', { devServerOrigin: null })).toBe(false);
  });
});

describe('resolveAppRequestPath', () => {
  const root = resolve('/opt/clipster/renderer');

  it('resolve arquivos dentro da pasta do renderer', () => {
    expect(resolveAppRequestPath('app://clipster/character.html', root)).toBe(
      `${root}${sep}character.html`
    );
    expect(resolveAppRequestPath('app://clipster/assets/a.js?v=1', root)).toBe(
      `${root}${sep}assets${sep}a.js`
    );
  });

  it.each(['app://clipster/../secrets.json', 'app://clipster/%2e%2e/%2e%2e/etc/passwd'])(
    'o parser de URL normaliza "%s" e o resultado continua dentro da pasta',
    (url) => {
      const result = resolveAppRequestPath(url, root);
      expect(result?.startsWith(root + sep)).toBe(true);
    }
  );

  it.each([
    'app://clipster/assets/..%2f..%2fmain%2findex.js',
    'app://clipster/assets/..%5c..%5cmain%5cindex.js',
    'app://clipster/',
    'app://other/character.html',
    'https://clipster/character.html',
    'app://clipster/%E0%A4%A',
    'app://clipster/a%00.html'
  ])('recusa %s', (url) => {
    expect(resolveAppRequestPath(url, root)).toBeNull();
  });

  it('informa o tipo MIME correto', () => {
    expect(mimeTypeFor('x/character.html')).toBe('text/html; charset=utf-8');
    expect(mimeTypeFor('x/a.JS')).toBe('text/javascript; charset=utf-8');
    expect(mimeTypeFor('x/unknown.bin')).toBe('application/octet-stream');
  });
});

describe('CSP', () => {
  it('produção não permite inline, eval nem rede', () => {
    expect(PRODUCTION_CSP).toContain("default-src 'none'");
    expect(PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(PRODUCTION_CSP).not.toContain('unsafe-inline');
    expect(PRODUCTION_CSP).not.toContain('unsafe-eval');
  });

  it('desenvolvimento libera só o servidor do Vite e o websocket do HMR', () => {
    const csp = developmentCsp('http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('*');
  });
});

describe('pageUrl', () => {
  it('usa app:// fora do modo dev', () => {
    expect(pageUrl('character', null)).toBe('app://clipster/character.html');
  });

  it('usa o servidor do Vite em dev e preserva parâmetros', () => {
    expect(pageUrl('settings', 'http://localhost:5173/', { section: 'about' })).toBe(
      'http://localhost:5173/settings.html?section=about'
    );
  });
});
