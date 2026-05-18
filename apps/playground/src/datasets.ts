import type { Row } from '@reports-web/shared';

export interface Dataset {
  readonly id: string;
  readonly name: { en: string; ar: string };
  readonly rows: readonly Row[];
}

const sales: readonly Row[] = [
  { region: 'North', product: 'Widget A', qty: 12, unitPrice: 25.5, amount: 306, date: '2026-01-15' },
  { region: 'North', product: 'Widget B', qty: 7, unitPrice: 49.0, amount: 343, date: '2026-01-22' },
  { region: 'North', product: 'Gadget', qty: 4, unitPrice: 99.0, amount: 396, date: '2026-02-03' },
  { region: 'South', product: 'Gadget', qty: 5, unitPrice: 99.0, amount: 495, date: '2026-02-08' },
  { region: 'South', product: 'Widget A', qty: 18, unitPrice: 25.5, amount: 459, date: '2026-02-19' },
  { region: 'South', product: 'Widget B', qty: 9, unitPrice: 49.0, amount: 441, date: '2026-02-27' },
  { region: 'West', product: 'Gadget', qty: 11, unitPrice: 99.0, amount: 1089, date: '2026-03-04' },
  { region: 'West', product: 'Widget B', qty: 3, unitPrice: 49.0, amount: 147, date: '2026-03-25' },
  { region: 'West', product: 'Widget A', qty: 22, unitPrice: 25.5, amount: 561, date: '2026-03-30' },
  { region: 'East', product: 'Widget A', qty: 9, unitPrice: 25.5, amount: 229.5, date: '2026-04-11' },
  { region: 'East', product: 'Gadget', qty: 7, unitPrice: 99.0, amount: 693, date: '2026-04-18' },
  { region: 'East', product: 'Widget B', qty: 14, unitPrice: 49.0, amount: 686, date: '2026-04-29' },
];

const employees: readonly Row[] = [
  { id: 1001, name: 'Sara Al-Mansoori', department: 'Engineering', position: 'Senior Engineer', salary: 18500, joinDate: '2022-03-15' },
  { id: 1002, name: 'Ahmed Hassan', department: 'Engineering', position: 'Engineer', salary: 14000, joinDate: '2023-06-01' },
  { id: 1003, name: 'Lina Khoury', department: 'Engineering', position: 'Lead Engineer', salary: 22000, joinDate: '2020-01-10' },
  { id: 1004, name: 'Khalid Al-Sabah', department: 'Sales', position: 'Account Manager', salary: 13500, joinDate: '2021-09-22' },
  { id: 1005, name: 'Noura Al-Otaibi', department: 'Sales', position: 'Sales Rep', salary: 9500, joinDate: '2024-02-14' },
  { id: 1006, name: 'Yusuf Ibrahim', department: 'Sales', position: 'Sales Director', salary: 25000, joinDate: '2019-08-03' },
  { id: 1007, name: 'Fatima Al-Zahra', department: 'Marketing', position: 'Marketing Manager', salary: 17000, joinDate: '2021-11-30' },
  { id: 1008, name: 'Omar Al-Rashid', department: 'Marketing', position: 'Content Specialist', salary: 10500, joinDate: '2023-04-18' },
  { id: 1009, name: 'Maryam Al-Najjar', department: 'Finance', position: 'CFO', salary: 32000, joinDate: '2018-05-12' },
  { id: 1010, name: 'Hassan Al-Marri', department: 'Finance', position: 'Accountant', salary: 11500, joinDate: '2022-10-05' },
];

const invoices: readonly Row[] = [
  { invoiceNo: 'INV-2026-001', customer: 'Acme Corp', items: 3, subtotal: 1500, vat: 75, total: 1575, status: 'paid', date: '2026-01-10' },
  { invoiceNo: 'INV-2026-002', customer: 'Globex Inc', items: 7, subtotal: 4200, vat: 210, total: 4410, status: 'paid', date: '2026-01-18' },
  { invoiceNo: 'INV-2026-003', customer: 'Acme Corp', items: 2, subtotal: 800, vat: 40, total: 840, status: 'pending', date: '2026-02-05' },
  { invoiceNo: 'INV-2026-004', customer: 'Initech', items: 12, subtotal: 8400, vat: 420, total: 8820, status: 'paid', date: '2026-02-15' },
  { invoiceNo: 'INV-2026-005', customer: 'Hooli', items: 5, subtotal: 2700, vat: 135, total: 2835, status: 'paid', date: '2026-03-01' },
  { invoiceNo: 'INV-2026-006', customer: 'Globex Inc', items: 4, subtotal: 1900, vat: 95, total: 1995, status: 'overdue', date: '2026-03-12' },
  { invoiceNo: 'INV-2026-007', customer: 'Initech', items: 9, subtotal: 5500, vat: 275, total: 5775, status: 'paid', date: '2026-03-28' },
  { invoiceNo: 'INV-2026-008', customer: 'Acme Corp', items: 6, subtotal: 3300, vat: 165, total: 3465, status: 'pending', date: '2026-04-14' },
];

export const DATASETS: readonly Dataset[] = [
  { id: 'sales', name: { en: 'Sales (12 rows)', ar: 'المبيعات (12 صفًا)' }, rows: sales },
  { id: 'employees', name: { en: 'Employees (10 rows)', ar: 'الموظفون (10 صفوف)' }, rows: employees },
  { id: 'invoices', name: { en: 'Invoices (8 rows)', ar: 'الفواتير (8 صفوف)' }, rows: invoices },
];

export function getDataset(id: string): Dataset {
  const d = DATASETS.find((x) => x.id === id);
  if (!d) throw new Error(`Dataset not found: ${id}`);
  return d;
}

export function allTables(): Record<string, readonly Row[]> {
  return Object.fromEntries(DATASETS.map((d) => [d.id, d.rows]));
}
