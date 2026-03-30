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

/** Reads the active theme and returns a high-contrast label color for canvas rendering. */
function getSankeyLabelColor(): string {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark' || theme === 'high-contrast') return '#F3F4F6';
  if (theme === 'light' || theme === 'pastel') return '#1F2937';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? '#F3F4F6' : '#1F2937';
}

/** Compact dollar formatter: $850 → "$850", $1450 → "$1.5k", $12000 → "$12k" */
function fmtCompact(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000)  return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// Column order determines the left-to-right layout in chartjs-chart-sankey.
// Flows from these sources are emitted first so the chart respects tier order.
const BUCKET_ORDER = ['Income', 'Savings Drawn', 'Necessities', 'Optional', 'Debt'];

export function SankeyChart({ flows, onDrillDown }: SankeyChartProps) {
  if (flows.length === 0) {
    return (
      <div
        style={{ height: '500px' }}
        className="flex items-center justify-center text-[var(--text-muted)]"
      >
        No flow data
      </div>
    );
  }

  const labelColor = getSankeyLabelColor();

  // ── Sort flows so that within each source group, largest flow comes first.
  // chartjs-chart-sankey stacks nodes top-to-bottom by insertion order, so
  // this makes the biggest categories appear at the top of each column.
  const grouped = new Map<string, SankeyFlow[]>();
  for (const f of flows) {
    if (!grouped.has(f.from)) grouped.set(f.from, []);
    grouped.get(f.from)!.push(f);
  }
  for (const group of grouped.values()) {
    group.sort((a, b) => b.flow - a.flow);
  }
  const sortedFlows: SankeyFlow[] = [];
  for (const src of BUCKET_ORDER) {
    if (grouped.has(src)) {
      sortedFlows.push(...grouped.get(src)!);
      grouped.delete(src);
    }
  }
  for (const group of grouped.values()) sortedFlows.push(...group);

  // ── Build label map: "Groceries" → "Groceries  $452"
  // For most nodes use inflow total; for pure sources (Income, Savings Drawn)
  // use outflow total since they have no inbound edges.
  const nodeInflow  = new Map<string, number>();
  const nodeOutflow = new Map<string, number>();
  for (const f of flows) {
    nodeInflow.set(f.to,   (nodeInflow.get(f.to)    ?? 0) + f.flow);
    nodeOutflow.set(f.from,(nodeOutflow.get(f.from)  ?? 0) + f.flow);
  }
  const sankeyLabels: Record<string, string> = {};
  const allNodes = new Set([...flows.map(f => f.from), ...flows.map(f => f.to)]);
  for (const node of allNodes) {
    const amt = nodeInflow.get(node) ?? nodeOutflow.get(node) ?? 0;
    sankeyLabels[node] = `${node}  ${fmtCompact(amt)}`;
  }

  const isDark = labelColor === '#F3F4F6';

  const chartData = {
    datasets: [
      {
        data: sortedFlows.map((f) => ({ from: f.from, to: f.to, flow: f.flow })),
        colorFrom: () => isDark ? 'rgba(96, 165, 250, 0.95)' : 'rgba(96, 165, 250, 0.7)',
        colorTo:   () => isDark ? 'rgba(74, 222, 128, 0.95)' : 'rgba(74, 222, 128, 0.7)',
        colorMode: 'gradient',
        nodePadding: 40,
        nodeWidth: 40,
        labels: sankeyLabels,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    color: labelColor,
    font: {
      family: "'Inter', sans-serif",
      size: 13,
      weight: '500',
    },
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
      <div style={{ height: 500, minWidth: 600, cursor: onDrillDown ? 'pointer' : 'default' }}>
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
