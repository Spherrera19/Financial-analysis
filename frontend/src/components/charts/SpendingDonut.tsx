import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface SpendingDonutProps {
  nec: number;
  opt: number;
  debt: number;
  other: number;
}

export function SpendingDonut({ nec, opt, debt, other }: SpendingDonutProps) {
  const data = {
    labels: ['Necessities', 'Optional', 'Debt', 'Other'],
    datasets: [
      {
        data: [nec, opt, debt, other],
        backgroundColor: [
          'rgba(96, 165, 250, 0.8)',
          'rgba(192, 132, 252, 0.8)',
          'rgba(248, 113, 113, 0.8)',
          'rgba(251, 191, 36, 0.8)',
        ],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
    },
  };

  return (
    <div style={{ height: '280px' }}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
