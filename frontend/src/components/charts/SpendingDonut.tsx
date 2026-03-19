import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import type { DrawerFilter } from '../../types'

ChartJS.register(ArcElement, Tooltip, Legend)

// Map donut slice label → transaction type code
const SLICE_TYPE: Record<string, string> = {
  Necessities: 'N',
  Optional:    'O',
  Debt:        'D',
  Other:       'T',
}

interface SpendingDonutProps {
  nec:         number
  opt:         number
  debt:        number
  other:       number
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}

export function SpendingDonut({ nec, opt, debt, other, onDrillDown }: SpendingDonutProps) {
  const chartData = {
    labels: ['Necessities', 'Optional', 'Debt', 'Other'],
    datasets: [{
      data: [nec, opt, debt, other],
      backgroundColor: [
        'rgba(96, 165, 250, 0.8)',
        'rgba(192, 132, 252, 0.8)',
        'rgba(248, 113, 113, 0.8)',
        'rgba(251, 191, 36, 0.8)',
      ],
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' as const } },
    // options.onClick is the Chart.js native handler (not a React event prop).
    // It receives (event, elements[]) with clicked element indices — the only
    // way to identify which arc was clicked in react-chartjs-2 v5 / Chart.js v4.
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (!elements.length) return
      // chartData is closed over — it is the local object defined above, not a callback param
      const label    = chartData.labels[elements[0].index]
      const typeCode = SLICE_TYPE[label]
      // Guard: if label is somehow not in the map, skip rather than send undefined type
      if (typeCode === undefined) return
      onDrillDown({ type: typeCode, label })
    },
    onHover: (_event: unknown, elements: unknown[], chart: { canvas: HTMLCanvasElement }) => {
      chart.canvas.style.cursor = (elements as unknown[]).length ? 'pointer' : 'default'
    },
  }

  return (
    <div style={{ height: '280px' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  )
}
