import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ledger } from '../types';
import { useUser } from './UserContext';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface LedgerContextValue {
  ledgers: Ledger[];
  selectedLedgerId: number | null;
  setSelectedLedgerId: (id: number) => void;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { activeUserId } = useUser();
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);

  const { data: ledgers = [] } = useQuery<Ledger[]>({
    queryKey: ['ledgers', activeUserId],
    queryFn: () =>
      fetch(`${API}/api/ledgers?user_id=${activeUserId}`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 5 * 60_000,
  });

  // Reset ledger selection when user changes
  useEffect(() => {
    setSelectedLedgerId(null);
  }, [activeUserId]);

  // Auto-select Household (or first) ledger when ledgers load
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
