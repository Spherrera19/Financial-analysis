import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ledger } from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface LedgerContextValue {
  ledgers: Ledger[];
  selectedLedgerId: number | null;
  setSelectedLedgerId: (id: number) => void;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);

  const { data: ledgers = [] } = useQuery<Ledger[]>({
    queryKey: ['ledgers'],
    queryFn: () =>
      fetch(`${API}/api/ledgers?user_id=1`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 5 * 60_000, // ledger list changes rarely
  });

  // Auto-select the Household ledger once data arrives
  useEffect(() => {
    if (ledgers.length > 0 && selectedLedgerId === null) {
      const household = ledgers.find(l => l.name === 'Household');
      setSelectedLedgerId(household?.id ?? ledgers[0].id);
    }
  }, [ledgers, selectedLedgerId]);

  return (
    <LedgerContext.Provider value={{ ledgers, selectedLedgerId, setSelectedLedgerId }}>
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside <LedgerProvider>');
  return ctx;
}
