export type ReportLocale = 'ar' | 'en';
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
