import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';

interface PendingTransaction {
  id: number;
  date: string;
  original_merchant: string;
  amount: number;
  account: string;
}

interface TriageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
}

export const TriageModal: React.FC<TriageModalProps> = ({ isOpen, onClose, onResolved }) => {
  const { ledgers } = useLedger();
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [resolutions, setResolutions] = useState<Record<number, { category: string; ledger_id: number }>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPending();
      fetchCategories();
    }
  }, [isOpen]);

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/transactions/review');
      if (res.ok) {
        const data = await res.json();
        setPending(data);

        // Auto-initialize resolutions with defaults
        const initial: Record<number, { category: string; ledger_id: number }> = {};
        data.forEach((tx: PendingTransaction) => {
          initial[tx.id] = { category: 'Uncategorized', ledger_id: ledgers[0]?.id || 1 };
        });
        setResolutions(initial);
      }
    } catch (err) {
      console.error("Failed to fetch pending transactions", err);
    }
  };

  const fetchCategories = async () => {
    try {
      // Fallback to fetch distinct categories from the DB
      const res = await fetch('/api/categories?ledger_id=1');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.map((c: any) => c.name));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async () => {
    setLoading(true);
    const payload = {
      resolutions: Object.entries(resolutions).map(([txId, res]) => ({
        transaction_id: parseInt(txId),
        category: res.category,
        ledger_id: res.ledger_id
      }))
    };

    try {
      const res = await fetch('/api/transactions/review/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        onResolved();
        onClose();
      }
    } catch (err) {
      console.error("Resolution failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Triage Inbox</h2>
            <p className="text-sm text-gray-500">Categorize and route new transactions. The AI engine will remember your choices.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 flex-1 bg-gray-50">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No transactions need review!</div>
          ) : (
            <div className="space-y-3">
              {pending.map(tx => (
                <div key={tx.id} className="bg-white p-4 rounded-lg shadow-sm border flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{tx.original_merchant || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{tx.date} • {tx.account}</p>
                  </div>
                  <div className="font-medium text-gray-900 w-24">${tx.amount.toFixed(2)}</div>

                  <select
                    className="border rounded-md px-3 py-1.5 text-sm bg-gray-50"
                    value={resolutions[tx.id]?.category || 'Uncategorized'}
                    onChange={(e) => setResolutions(prev => ({ ...prev, [tx.id]: { ...prev[tx.id], category: e.target.value } }))}
                  >
                    <option value="Uncategorized">Uncategorized</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select
                    className="border rounded-md px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 font-medium"
                    value={resolutions[tx.id]?.ledger_id || ''}
                    onChange={(e) => setResolutions(prev => ({ ...prev, [tx.id]: { ...prev[tx.id], ledger_id: parseInt(e.target.value) } }))}
                  >
                    {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={handleResolve}
            disabled={loading || pending.length === 0}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Learning...' : `Resolve ${pending.length} Transactions`}
          </button>
        </div>
      </div>
    </div>
  );
};
