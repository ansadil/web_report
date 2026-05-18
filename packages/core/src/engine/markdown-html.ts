import { escapeHtml } from '@reports-web/shared';

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

function inlineMarkdown(text: string): string {
  let s = text;
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`);
  s = s.replace(/\*([^*]+)\*/g, (_m, inner: string) => `<em>${inner}</em>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = escapeAttr(href);
    return `<a href="${safeHref}" rel="noopener noreferrer">${label}</a>`;
  });
  return s;
}

/** Converts a small Markdown subset to HTML. Field placeholders should be substituted before calling. */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let listOpen = false;

  const closeList = (): void => {
    if (listOpen) {
      blocks.push('</ul>');
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = trimmed.match(/^#+/)![0].length;
      const body = inlineMarkdown(escapeHtml(heading[1]!));
      blocks.push(`<h${level}>${body}</h${level}>`);
      continue;
    }

    const listItem = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (listItem) {
      if (!listOpen) {
        blocks.push('<ul>');
        listOpen = true;
      }
      blocks.push(`<li>${inlineMarkdown(escapeHtml(listItem[1]!))}</li>`);
      continue;
    }

    closeList();
    blocks.push(`<p>${inlineMarkdown(escapeHtml(trimmed))}</p>`);
  }

  closeList();
  return blocks.join('\n');
}
