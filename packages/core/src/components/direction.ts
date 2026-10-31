import type { LocaleTag } from '@reports-web/shared';

/** BCP 47 locale tag ('ar', 'en', 'ar-SA', 'fa-IR', ...). */
export type ReportLocale = LocaleTag;
export type ReportDir = 'rtl' | 'ltr';

interface MetaLike {
  readonly locale?: ReportLocale;
  readonly dir?: ReportDir;
}

/** Host override wins, then the template, then English. */
export function resolveLocale(host: ReportLocale | undefined | null, meta?: MetaLike | null): ReportLocale {
  return host ?? meta?.locale ?? 'en';
}

/**
 * Host override wins, then the template's saved dir, then infer from locale
 * (Arabic means RTL). An empty string from the native `dir` property counts as unset.
 */
export function resolveDir(host: string | undefined | null, meta?: MetaLike | null, locale?: ReportLocale): ReportDir {
  if (host === 'rtl' || host === 'ltr') return host;
  if (meta?.dir) return meta.dir;
  return (locale ?? meta?.locale) === 'ar' ? 'rtl' : 'ltr';
}

/**
 * `dir` is a host override (explicit attribute or property). When it is unset,
 * the component still writes the resolved direction to its own `dir` attribute
 * so the host element lays out correctly, without that write counting as an override.
 */
export function installDirOverride(proto: object): void {
  Object.defineProperty(proto, 'dir', {
    configurable: true,
    enumerable: true,
    get(this: { dirOverride: '' | 'rtl' | 'ltr' }) {
      return this.dirOverride;
    },
    set(this: { dirOverride: '' | 'rtl' | 'ltr' }, v: unknown) {
      this.dirOverride = v === 'rtl' || v === 'ltr' ? v : '';
    },
  });
}
