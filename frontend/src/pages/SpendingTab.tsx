import { CollapsibleCard } from '../components/cards';
import { SpendingDonut, CategoryBar } from '../components/charts';
import type { DashboardPayload, PeriodKey } from '../types';

interface SpendingTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
}

function SpendingTab({ data, activePeriod }: SpendingTabProps) {
  const period = data.periods[activePeriod];
  const [nec, opt, debt, other] = period.nec_opt_donut;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Full-width Donut */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Necessity vs Optional Breakdown">
          <SpendingDonut nec={nec} opt={opt} debt={debt} other={other} />
        </CollapsibleCard>
      </div>

      {/* Category + Source Charts */}
      <div
        className="grid-2"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <CollapsibleCard title="Top Spending Categories">
          <CategoryBar labels={period.cat_labels} values={period.cat_values} />
        </CollapsibleCard>
        <CollapsibleCard title="Income Sources">
          <CategoryBar labels={period.src_labels} values={period.src_values} />
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { SpendingTab };
