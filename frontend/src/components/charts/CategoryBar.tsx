import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface CategoryBarProps {
  labels: string[];
  values: number[];
}

export function CategoryBar({ labels, values }: CategoryBarProps) {
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: 'rgba(192, 132, 252, 0.7)',
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
  };

  return (
    <div style={{ height: Math.max(200, labels.length * 28) + 'px' }}>
      <Bar data={data} options={options} />
    </div>
  );
}
