import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { PeriodData } from '../../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface FlowChartProps {
  periodData: PeriodData;
}

export function FlowChart({ periodData }: FlowChartProps) {
  const data = {
    labels: periodData.labels,
    datasets: [
      {
        label: 'Income',
        data: periodData.income,
        backgroundColor: 'rgba(74, 222, 128, 0.8)',
      },
      {
        label: 'Spending',
        data: periodData.spending,
        backgroundColor: 'rgba(248, 113, 113, 0.8)',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
    },
  };

  return (
    <div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <div style={{ height: 280, minWidth: 560 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
