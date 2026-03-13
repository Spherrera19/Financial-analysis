import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { DebtSection } from '../../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface DebtTrendLineProps {
  debtSection: DebtSection;
}

export function DebtTrendLine({ debtSection }: DebtTrendLineProps) {
  const data = {
    labels: debtSection.trend.labels,
    datasets: [
      {
        label: 'Debt',
        data: debtSection.trend.values,
        borderColor: 'rgba(248, 113, 113, 0.8)',
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        fill: true,
        tension: 0.4,
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
    <div style={{ height: '280px' }}>
      <Line data={data} options={options} />
    </div>
  );
}
