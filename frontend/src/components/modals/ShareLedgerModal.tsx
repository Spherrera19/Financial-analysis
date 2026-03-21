import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserProfile } from '../../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const INPUT = 'w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const FIELD = 'mb-5';

interface ShareLedgerModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  ledgerId:   number;
  ledgerName: string;
  // profiles prop removed — modal fetches internally
}

async function postShare(ledgerId: number, userId: number, role: string) {
  const res = await fetch(`${API}/api/ledgers/${ledgerId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Server error (${res.status})`);
  }
  return res.json();
}

export function ShareLedgerModal({ isOpen, onClose, ledgerId, ledgerName }: ShareLedgerModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole,   setSelectedRole]   = useState<'viewer' | 'admin'>('viewer');

  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<UserProfile[]>({
    queryKey: ['profiles'],
    queryFn: () =>
      fetch(`${API}/api/profiles`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: isOpen,
  });

  // Use first profile as default when data arrives
  const resolvedUserId = selectedUserId !== '' ? selectedUserId : (profiles[0]?.id ?? '');

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => {
      if (!resolvedUserId) throw new Error('No user selected');
      return postShare(ledgerId, Number(resolvedUserId), selectedRole);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      setSelectedUserId('');
      setSelectedRole('viewer');
      reset();
      onClose();
    },
  });

  const handleClose = () => { reset(); onClose(); };

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
              Share Workspace: <span className="text-blue-600">{ledgerName}</span>
            </h2>

            {/* User Select */}
            <div className={FIELD}>
              <label className={LABEL}>User</label>
              {profilesLoading ? (
                <p className="text-sm text-gray-400 italic">Loading members…</p>
              ) : profiles.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No profiles available.</p>
              ) : (
                <select
                  className={INPUT}
                  value={resolvedUserId}
                  onChange={e => setSelectedUserId(Number(e.target.value))}
                >
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}{profile.is_primary ? ' (Primary)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Role Select */}
            <div className={FIELD}>
              <label className={LABEL}>Role</label>
              <select
                className={INPUT}
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value as 'viewer' | 'admin')}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
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
                disabled={isPending || profiles.length === 0}
                onClick={() => mutate()}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Sharing…' : 'Share Access'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
