import '@reports-web/core';
import {
  createStaticAdapter,
  createLocalStorageAdapter,
  t,
  type ReportSchemaV1,
  type ReportsViewerElement,
  type ReportsBuilderElement,
} from '@reports-web/core';
import { DATASETS, allTables } from './datasets.js';
import { SAMPLE_REPORTS, getSampleReport } from './reports.js';

type Locale = 'ar' | 'en';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const viewer = $('viewer') as ReportsViewerElement;
const builder = $('builder') as ReportsBuilderElement;

const dataAdapter = createStaticAdapter({ tables: allTables() });
const storage = createLocalStorageAdapter();

viewer.dataAdapter = dataAdapter;
builder.dataAdapter = dataAdapter;
builder.storageAdapter = storage;
// Fonts copied/served by vite.config.ts at <base>/assets/fonts/ (BUG-35): pass the folder
// explicitly instead of relying on the default derived from the bundled module's URL. The
// viewer hands it to the PDF exporter too.
const FONTS_BASE_URL = new URL('assets/fonts/', document.baseURI).href;
builder.fontsBaseUrl = FONTS_BASE_URL;
viewer.fontsBaseUrl = FONTS_BASE_URL;

const state = {
  locale: 'ar' as Locale,
  activeReportId: SAMPLE_REPORTS[0]!.id,
};

function toast(msg: string, kind: 'ok' | 'error' = 'ok'): void {
  const el = document.createElement('div');
  el.className = `toast${kind === 'error' ? ' error' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applySchema(schema: ReportSchemaV1): void {
  viewer.schema = schema;
  builder.schema = schema;
}

function paintChrome(): void {
  const loc = state.locale;
  $('samples-heading').textContent = t(loc, 'sampleReports');
  $('saved-heading').textContent = t(loc, 'savedReports');
  $('datasets-heading').textContent = t(loc, 'datasetsHeading');
  $('tips-heading').textContent = t(loc, 'tips');
  $('tips-body').textContent = t(loc, 'sampleTips');
}

function renderReportsList(): void {
  const container = $('reports-list');
  container.innerHTML = '';
  for (const r of SAMPLE_REPORTS) {
    const card = document.createElement('div');
    card.className = `report-card${state.activeReportId === r.id ? ' active' : ''}`;
    card.innerHTML = `
      <div class="name"></div>
      <div class="desc"></div>
      <div class="dataset"></div>
    `;
    (card.querySelector('.name') as HTMLElement).textContent = r.name[state.locale];
    (card.querySelector('.desc') as HTMLElement).textContent = r.description[state.locale];
    (card.querySelector('.dataset') as HTMLElement).textContent = `${t(state.locale, 'datasetLabel')}: ${r.dataset}`;
    card.addEventListener('click', () => {
      state.activeReportId = r.id;
      applySchema(r.build());
      renderReportsList();
    });
    container.appendChild(card);
  }
}

async function renderSavedList(): Promise<void> {
  const container = $('saved-list');
  container.innerHTML = '';
  let list: readonly { id: string; name: string }[] = [];
  try {
    list = (await storage.list?.()) ?? [];
  } catch {
    list = [];
  }
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-msg">${t(state.locale, 'noSavedReports')}</div>`;
    return;
  }
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'saved-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = item.name;
    const openBtn = document.createElement('button');
    openBtn.className = 'open-btn';
    openBtn.textContent = t(state.locale, 'open');
    openBtn.addEventListener('click', async () => {
      try {
        const schema = await storage.load(item.id);
        state.activeReportId = item.id;
        applySchema(schema);
        renderReportsList();
        toast(state.locale === 'ar' ? 'تم تحميل التقرير' : 'Report loaded');
      } catch (e) {
        toast(`${state.locale === 'ar' ? 'فشل التحميل' : 'Load failed'}: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = t(state.locale, 'delete');
    delBtn.addEventListener('click', async () => {
      await storage.delete?.(item.id);
      void renderSavedList();
      toast(state.locale === 'ar' ? 'تم الحذف' : 'Deleted');
    });
    row.appendChild(nameSpan);
    row.appendChild(openBtn);
    row.appendChild(delBtn);
    container.appendChild(row);
  }
}

function renderDatasets(): void {
  const container = $('datasets-list');
  container.innerHTML = DATASETS
    .map((d) => `<div><strong>${d.id}</strong>: ${d.name[state.locale]}</div>`)
    .join('');
}

function switchLocale(loc: Locale): void {
  state.locale = loc;
  const dir = loc === 'ar' ? 'rtl' : 'ltr';
  viewer.locale = loc;
  viewer.dirOverride = dir;
  builder.locale = loc;
  builder.dir = dir;
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', loc);
  paintChrome();
  renderReportsList();
  void renderSavedList();
  renderDatasets();
  const active = SAMPLE_REPORTS.find((r) => r.id === state.activeReportId);
  if (active) applySchema(active.build());
}

viewer.addEventListener('export', (e) => {
  const detail = (e as CustomEvent<{ kind: string; blob?: Blob; filename?: string }>).detail;
  if (!detail.blob || !detail.filename) {
    toast(state.locale === 'ar' ? `طُلبت ${detail.kind}` : `${detail.kind} requested`);
    return;
  }
  downloadBlob(detail.blob, detail.filename);
  toast(state.locale === 'ar' ? `تم التصدير: ${detail.filename}` : `Exported: ${detail.filename}`);
});

viewer.addEventListener('export-error', (e) => {
  const detail = (e as CustomEvent<{ kind: string; error: string }>).detail;
  toast(`${detail.kind}: ${detail.error}`, 'error');
});

builder.addEventListener('request-preview', () => {
  viewer.fontsBaseUrl = builder.fontsBaseUrl;
  viewer.schema = builder.getSchema();
  viewer.locale = state.locale;
  viewer.dirOverride = state.locale === 'ar' ? 'rtl' : 'ltr';
  builder.previewing = true;
});
viewer.addEventListener('report-rendered', () => {
  if (!builder.previewing) return;
  requestAnimationFrame(() => requestAnimationFrame(() => viewer.fitSheet()));
});
builder.addEventListener('ribbon-tab', (event) => {
  const tab = (event as CustomEvent<{ tab: string }>).detail.tab;
  if (tab !== 'preview') builder.previewing = false;
});

builder.addEventListener('save', (e) => {
  const schema = (e as CustomEvent<{ schema: ReportSchemaV1 }>).detail.schema;
  viewer.schema = schema;
  state.activeReportId = schema.id;
  void renderSavedList();
  toast(state.locale === 'ar' ? `تم الحفظ: ${schema.meta.name}` : `Saved: ${schema.meta.name}`);
});

builder.addEventListener('save-error', (e) => {
  const detail = (e as CustomEvent<{ error: string }>).detail;
  toast(`${state.locale === 'ar' ? 'فشل الحفظ' : 'Save error'}: ${detail.error}`, 'error');
});

builder.addEventListener('export-json', (e) => {
  const detail = (e as CustomEvent<{ blob: Blob; filename: string }>).detail;
  downloadBlob(detail.blob, detail.filename);
  toast(state.locale === 'ar' ? 'تم تصدير JSON' : 'JSON exported');
});

const sampleDrawer = $('sample-drawer');
const appShell = $('app');
function setSamplesOpen(open: boolean): void {
  sampleDrawer.classList.toggle('open', open);
  appShell.classList.toggle('drawer-open', open);
}
builder.addEventListener('toggle-samples', (event) => {
  event.stopPropagation();
  setSamplesOpen(!sampleDrawer.classList.contains('open'));
});
document.addEventListener('click', (event) => {
  if (!sampleDrawer.classList.contains('open')) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (sampleDrawer.contains(target)) return;
  setSamplesOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSamplesOpen(false);
});
builder.addEventListener('locale-change', (event) => {
  const detail = (event as CustomEvent<{ locale: Locale; dir: 'rtl' | 'ltr' }>).detail;
  state.locale = detail.locale;
  viewer.locale = detail.locale;
  viewer.dirOverride = detail.dir;
  document.documentElement.setAttribute('dir', detail.dir);
  document.documentElement.setAttribute('lang', detail.locale);
  paintChrome();
  renderReportsList();
  void renderSavedList();
  renderDatasets();
});
switchLocale('ar');
