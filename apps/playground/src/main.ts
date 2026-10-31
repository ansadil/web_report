import '@reports-web/core';
import {
  createStaticAdapter,
  createLocalStorageAdapter,
  type ReportSchemaV1,
  type ReportsViewerElement,
  type ReportsBuilderElement,
} from '@reports-web/core';
import { DATASETS, allTables } from './datasets.js';
import { SAMPLE_REPORTS, getSampleReport } from './reports.js';

type Locale = 'ar' | 'en';
type View = 'viewer' | 'builder';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const viewer = $('viewer') as ReportsViewerElement;
const builder = $('builder') as ReportsBuilderElement;

const dataAdapter = createStaticAdapter({ tables: allTables() });
const storage = createLocalStorageAdapter();

viewer.dataAdapter = dataAdapter;
builder.dataAdapter = dataAdapter;
builder.storageAdapter = storage;
viewer.fontsBaseUrl = builder.fontsBaseUrl;

const state = {
  locale: 'en' as Locale,
  view: 'builder' as View,
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
  const adjusted: ReportSchemaV1 = {
    ...schema,
    meta: { ...schema.meta, locale: state.locale, dir: state.locale === 'ar' ? 'rtl' : 'ltr' },
  };
  viewer.schema = adjusted;
  builder.schema = adjusted;
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
    (card.querySelector('.dataset') as HTMLElement).textContent = `${state.locale === 'ar' ? 'مصدر البيانات' : 'Dataset'}: ${r.dataset}`;
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
    container.innerHTML = `<div class="empty-msg">${state.locale === 'ar' ? 'لا توجد تقارير محفوظة' : 'No saved reports yet'}</div>`;
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
    openBtn.textContent = state.locale === 'ar' ? 'فتح' : 'Open';
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
    delBtn.textContent = state.locale === 'ar' ? 'حذف' : 'Delete';
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

function switchView(which: View): void {
  state.view = which;
  $('view-viewer').hidden = which !== 'viewer';
  $('view-builder').hidden = which !== 'builder';
  $('tab-viewer').classList.toggle('active', which === 'viewer');
  $('tab-builder').classList.toggle('active', which === 'builder');
}

function switchLocale(loc: Locale): void {
  state.locale = loc;
  const dir = loc === 'ar' ? 'rtl' : 'ltr';
  viewer.locale = loc;
  viewer.dir = dir;
  builder.locale = loc;
  builder.dir = dir;
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', loc);
  $('btn-en').classList.toggle('active', loc === 'en');
  $('btn-ar').classList.toggle('active', loc === 'ar');
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

$('btn-samples').addEventListener('click', () => $('sample-drawer').classList.toggle('open'));
$('tab-viewer').addEventListener('click', () => switchView('viewer'));
$('tab-builder').addEventListener('click', () => switchView('builder'));
$('btn-en').addEventListener('click', () => switchLocale('en'));
$('btn-ar').addEventListener('click', () => switchLocale('ar'));

applySchema(getSampleReport(state.activeReportId).build());
renderReportsList();
renderDatasets();
void renderSavedList();
