import { CollapsibleCard } from '../components/cards';
import { SpendingDonut, CategoryBar } from '../components/charts';
import type { DashboardPayload, DrawerFilter, PeriodKey } from '../types';

interface SpendingTabProps {
  data:         DashboardPayload;
  activePeriod: PeriodKey;
  onDrillDown:  (f: Omit<DrawerFilter, 'period'>) => void;
}

function SpendingTab({ data, activePeriod, onDrillDown }: SpendingTabProps) {
  const period = data.periods[activePeriod];
  const [nec, opt, debt, other] = period.nec_opt_donut;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Full-width Donut */}
      <div id="tour-spending-donut" style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Necessity vs Optional Breakdown" helpText="Breaks down your expenses into core survival necessities versus discretionary lifestyle spending.">
          <SpendingDonut nec={nec} opt={opt} debt={debt} other={other} onDrillDown={onDrillDown} />
        </CollapsibleCard>
      </div>

      {/* Category + Source Charts */}
      <div
        id="tour-category-bars"
        className="grid-2"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <CollapsibleCard title="Top Spending Categories" helpText="Compares your current period spending against your historical 6-month averages per category.">
          <CategoryBar labels={period.cat_labels} values={period.cat_values} onDrillDown={onDrillDown} />
        </CollapsibleCard>
        <CollapsibleCard title="Income Sources" helpText="The distribution and concentration of your gross income streams.">
          {/* Income source labels are employer names, not transaction categories — no drill-down */}
          <CategoryBar labels={period.src_labels} values={period.src_values} />
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { SpendingTab };
