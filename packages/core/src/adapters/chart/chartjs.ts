import {
  Chart,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import type { ChartAdapter, ChartHandle, ChartSpec } from './types.js';

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  Chart.register(
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    PieController,
    DoughnutController,
    ArcElement,
    CategoryScale,
    LinearScale,
    Legend,
    Title,
    Tooltip,
  );
  registered = true;
}

const DEFAULT_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#65a30d',
  '#c026d3',
];

export function createChartJsAdapter(): ChartAdapter {
  return {
    id: 'chartjs',
    render(host: HTMLCanvasElement, spec: ChartSpec): ChartHandle {
      ensureRegistered();
      Chart.getChart(host)?.destroy();
      const isCircular = spec.type === 'pie' || spec.type === 'doughnut';
      const backgroundColor = isCircular
        ? spec.values.map((_, i) => DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] as string)
        : (DEFAULT_PALETTE[0] as string);
      const chart = new Chart(host, {
        type: spec.type,
        data: {
          labels: spec.labels.map((l) => String(l ?? '')),
          datasets: [
            {
              label: spec.title ?? '',
              data: [...spec.values],
              backgroundColor,
              borderColor: isCircular ? undefined : (DEFAULT_PALETTE[0] as string),
              borderWidth: 1,
              tension: spec.type === 'line' ? 0.25 : 0,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: isCircular },
            title: { display: !!spec.title, text: spec.title ?? '' },
          },
          scales: isCircular
            ? undefined
            : {
                x: { ticks: { autoSkip: true, maxRotation: 0 } },
                y: { beginAtZero: true },
              },
        },
      });
      return { destroy: () => chart.destroy() };
    },
  };
}
