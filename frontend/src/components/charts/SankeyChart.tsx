import { Chart as ChartJS } from 'chart.js';
// @ts-ignore — chartjs-chart-sankey has limited TypeScript definitions
import { SankeyController, Flow } from 'chartjs-chart-sankey';
import { Chart } from 'react-chartjs-2';
import type { SankeyFlow } from '../../types';

ChartJS.register(SankeyController, Flow);

interface SankeyChartProps {
  flows: SankeyFlow[];
}

export function SankeyChart({ flows }: SankeyChartProps) {
  if (flows.length === 0) {
    return (
      <div
        style={{ height: '340px' }}
        className="flex items-center justify-center text-[var(--text-muted)]"
      >
        No flow data
      </div>
    );
  }

  const chartData = {
    datasets: [
      {
        data: flows.map((f) => ({ from: f.from, to: f.to, flow: f.flow })),
        colorFrom: () => 'rgba(96, 165, 250, 0.8)',
        colorTo: () => 'rgba(74, 222, 128, 0.8)',
        colorMode: 'gradient',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
  };

  return (
    <div style={{ height: '340px' }}>
      <Chart
        type={'sankey' as any}
        data={chartData as any}
        options={options}
      />
    </div>
  );
}
