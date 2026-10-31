import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: { destroy: ReturnType<typeof vi.fn> }[] = [];

vi.mock('chart.js', () => {
  function Chart(this: { destroy: ReturnType<typeof vi.fn> }) {
    this.destroy = vi.fn();
    created.push(this);
  }
  Chart.register = vi.fn();
  Chart.getChart = vi.fn();
  return {
    Chart,
    ArcElement: class {},
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    DoughnutController: class {},
    Legend: class {},
    LineController: class {},
    LineElement: class {},
    LinearScale: class {},
    PieController: class {},
    PointElement: class {},
    Title: class {},
    Tooltip: class {},
  };
});

import { Chart } from 'chart.js';
import { createChartJsAdapter } from './chartjs.js';

const spec = { type: 'bar' as const, labels: ['Jan'], values: [3] };

describe('chartjs adapter', () => {
  beforeEach(() => {
    created.length = 0;
    vi.mocked(Chart.getChart).mockReset();
    vi.mocked(Chart.getChart).mockReturnValue(undefined);
  });

  it('destroys a chart already bound to the canvas before creating another', () => {
    const previous = { destroy: vi.fn() };
    vi.mocked(Chart.getChart).mockReturnValue(previous as never);
    const canvas = document.createElement('canvas');
    const handle = createChartJsAdapter().render(canvas, spec);
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
    handle.destroy();
    expect(created[0]?.destroy).toHaveBeenCalledOnce();
  });
});
