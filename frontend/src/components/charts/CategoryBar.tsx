import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { DrawerFilter } from '../../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface CategoryBarProps {
  labels:       string[]
  values:       number[]
  onDrillDown?: (f: Omit<DrawerFilter, 'period'>) => void
}

export function CategoryBar({ labels, values, onDrillDown }: CategoryBarProps) {
  const data = {
    labels,
    datasets: [{ data: values, backgroundColor: 'rgba(192, 132, 252, 0.7)' }],
  }

  const options = {
    indexAxis:           'y' as const,
    responsive:          true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (!elements.length || !onDrillDown) return
      const category = labels[elements[0].index]
      onDrillDown({ category, label: category })
    },
    onHover: (_event: unknown, elements: unknown[], chart: { canvas: HTMLCanvasElement }) => {
      // Only show pointer cursor when drill-down is wired (not on income sources bar)
      chart.canvas.style.cursor = (onDrillDown && (elements as unknown[]).length) ? 'pointer' : 'default'
    },
  }

  return (
    <div style={{ height: Math.max(200, labels.length * 28) + 'px' }}>
      <Bar data={data} options={options} />
    </div>
  )
}
