import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { resolveFontUrl } from '../exporters/fonts-manifest.js';

const UI_FACES: readonly { family: string; weight: number }[] = [
  { family: 'Cairo', weight: 400 },
  { family: 'Cairo', weight: 700 },
  { family: 'Tajawal', weight: 400 },
  { family: 'Tajawal', weight: 700 },
];

const loading = new Map<string, Promise<void>>();

function quoteUrl(url: string): string {
  return `url("${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

/** Load one woff2 face into `document.fonts`. Repeated calls share one FontFace. */
export async function ensureWebFont(family: string, weight = 400, fontsBaseUrl?: string): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  const url = await resolveFontUrl({ family, weight, style: 'normal' }, { format: 'woff2', fontsBaseUrl });
  if (!url || url.startsWith('file:')) return;
  const key = `${family}\0${weight}\0${url}`;
  let job = loading.get(key);
  if (!job) {
    job = (async () => {
      try {
        const face = new FontFace(family, quoteUrl(url), { weight: String(weight), style: 'normal', display: 'swap' });
        await face.load();
        document.fonts.add(face);
      } catch {
        loading.delete(key);
      }
    })();
    loading.set(key, job);
  }
  await job;
}

function pushFace(out: { family: string; weight: number }[], family: string | undefined, bold?: boolean): void {
  const name = family?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
  if (!name) return;
  out.push({ family: name, weight: bold ? 700 : 400 });
}

/** Faces named by element `style.font` (plus bold when the element is bold). */
export function schemaFontFaces(schema: ReportSchemaV1): { family: string; weight: number }[] {
  const out: { family: string; weight: number }[] = [];
  const walk = (elements: { style?: { font?: string; bold?: boolean } }[] | undefined) => {
    for (const el of elements ?? []) pushFace(out, el.style?.font, el.style?.bold);
  };
  for (const band of Object.values(schema.bands)) walk(band?.elements);
  for (const group of schema.groups) {
    walk(group.header?.elements);
    walk(group.footer?.elements);
  }
  return out;
}

/** Cairo and Tajawal for the designer/viewer UI, then any family the template names. */
export async function ensureReportFonts(schema: ReportSchemaV1 | null | undefined, fontsBaseUrl?: string): Promise<void> {
  const faces = [...UI_FACES, ...(schema ? schemaFontFaces(schema) : [])];
  await Promise.all(faces.map((face) => ensureWebFont(face.family, face.weight, fontsBaseUrl)));
}
