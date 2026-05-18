export interface ChartSpec {
  readonly type: 'bar' | 'line' | 'pie' | 'doughnut';
  readonly labels: readonly unknown[];
  readonly values: readonly number[];
  readonly title?: string;
  readonly dir?: 'rtl' | 'ltr';
}

export interface ChartHandle {
  destroy(): void;
}

export interface ChartAdapter {
  readonly id: string;
  render(host: HTMLCanvasElement, spec: ChartSpec): ChartHandle;
}
