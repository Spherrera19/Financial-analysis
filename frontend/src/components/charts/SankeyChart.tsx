import { Chart as ChartJS } from 'chart.js';
// @ts-ignore — chartjs-chart-sankey has limited TypeScript definitions
import { SankeyController, Flow } from 'chartjs-chart-sankey';
import { Chart } from 'react-chartjs-2';
import type { DrawerFilter, SankeyFlow } from '../../types';

ChartJS.register(SankeyController, Flow);

// Nodes whose names map to a transaction type code rather than a category
const TYPE_MAP: Record<string, DrawerFilter['type']> = {
  'Necessities': 'N',
  'Necessary':   'N',
  'Optional':    'O',
  'Discretionary': 'O',
  'Debt':        'D',
  'Debt Payments': 'D',
};

interface SankeyChartProps {
  flows:        SankeyFlow[];
  onDrillDown?: (f: Omit<DrawerFilter, 'period'>) => void;
}

export function SankeyChart({ flows, onDrillDown }: SankeyChartProps) {
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
    ...(onDrillDown && {
      onClick: (_event: unknown, elements: any[], chart: any) => {
        if (elements.length === 0) return;
        const el = elements[0];
        const raw = chart.data.datasets[el.datasetIndex]?.data[el.index] as any;
        const nodeName: string = raw?.to ?? '';
        if (!nodeName) return;

        const mappedType = TYPE_MAP[nodeName];
        if (mappedType) {
          onDrillDown({ type: mappedType, label: nodeName });
        } else {
          onDrillDown({ category: nodeName, label: nodeName });
        }
      },
    }),
  };

  return (
    <div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <div style={{ height: 340, minWidth: 600, cursor: onDrillDown ? 'pointer' : 'default' }}>
        <Chart
          type={'sankey' as any}
          data={chartData as any}
          options={options as any}
        />
      </div>
      {onDrillDown && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Click a flow or node to see underlying transactions
        </p>
      )}
    </div>
  );
}
