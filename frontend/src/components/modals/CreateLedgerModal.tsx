import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../context/UserContext';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const INPUT = 'w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const FIELD = 'mb-5';

export interface CreateLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

async function postCreateLedger(name: string, type: string, creatorUserId: number) {
  const res = await fetch(`${API}/api/ledgers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, creator_user_id: creatorUserId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Server error (${res.status})`);
  }
  return res.json();
}

export function CreateLedgerModal({ isOpen, onClose }: CreateLedgerModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'personal' | 'joint' | 'business'>('personal');

  const { activeUserId } = useUser();
  const queryClient = useQueryClient();

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Ledger name is required');
      return postCreateLedger(name.trim(), type, activeUserId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      handleClose();
    },
  });

  const handleClose = () => {
    reset();
    setName('');
    setType('personal');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            exit={{    scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.25 }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              Create New Workspace
            </h2>

            {/* Ledger Name */}
            <div className={FIELD}>
              <label className={LABEL}>Ledger Name</label>
              <input
                type="text"
                className={INPUT}
                placeholder="e.g. Household, Steven Business"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') mutate(); }}
                autoFocus
              />
            </div>

            {/* Type Select */}
            <div className={FIELD}>
              <label className={LABEL}>Type</label>
              <select
                className={INPUT}
                value={type}
                onChange={e => setType(e.target.value as 'personal' | 'joint' | 'business')}
              >
                <option value="personal">Personal</option>
                <option value="joint">Joint</option>
                <option value="business">Business</option>
              </select>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-600 mb-4 p-2 bg-red-50 rounded-md">
                {(error as Error).message}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !name.trim()}
                onClick={() => mutate()}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Creating…' : 'Create Workspace'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
