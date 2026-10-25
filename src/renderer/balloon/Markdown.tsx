import { useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Element, ElementContent } from 'hast';
import type { Translator } from '../../shared/i18n';
import { IconCheck, IconCopy } from './icons';

/**
 * Markdown seguro para respostas de IA (SPEC §8.4):
 * - sem HTML bruto (`skipHtml`, sem rehype-raw) e sem `dangerouslySetInnerHTML`;
 * - imagens nunca são carregadas (viram texto com a descrição);
 * - links só abrem por clique, no navegador padrão, validados no main; o domínio aparece no título;
 * - blocos de código com "Copiar".
 */

function textOf(node: ElementContent | Element | undefined): string {
  if (node === undefined) return '';
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/** Mesma regra do main: só http(s), sem credenciais. O main valida de novo antes de abrir. */
export function safeHttpUrl(href: string | undefined): URL | null {
  if (href === undefined) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username !== '' || url.password !== '') return null;
    return url;
  } catch {
    return null;
  }
}

function CopyButton({ text, label, t }: { text: string; label: string; t: Translator }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-button icon-button--small"
      title={copied ? t('balloon.copied') : label}
      aria-label={copied ? t('balloon.copied') : label}
      onClick={() => {
        void window.clipster.clipboard.writeText(text).then((result) => {
          if (!result.ok) return;
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, 1500);
        });
      }}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}

export { CopyButton };

function components(t: Translator): Components {
  return {
    a: ({ href, children }) => {
      const url = safeHttpUrl(href);
      if (url === null) return <span className="md-link-disabled">{children}</span>;
      return (
        <a
          href={url.href}
          title={t('balloon.link.title', { host: url.host })}
          onClick={(event) => {
            event.preventDefault();
            void window.clipster.shell.openExternal(url.href);
          }}
          onAuxClick={(event) => {
            event.preventDefault();
          }}
        >
          {children}
        </a>
      );
    },
    img: ({ alt }) => (
      <span className="md-image">
        {alt !== undefined && alt !== '' ? t('balloon.image', { alt }) : t('balloon.imageNoAlt')}
      </span>
    ),
    pre: ({ children, node }) => (
      <div className="md-code">
        <pre>{children}</pre>
        <div className="md-code__actions">
          <CopyButton text={textOf(node).replace(/\n$/, '')} label={t('balloon.copyCode')} t={t} />
        </div>
      </div>
    )
  };
}

export function Markdown({ content, t }: { content: string; t: Translator }): ReactNode {
  const mapped = useMemo(() => components(t), [t]);
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={mapped}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
