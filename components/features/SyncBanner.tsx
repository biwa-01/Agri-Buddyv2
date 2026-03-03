'use client';

import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/client/auth';
import { getUnsynced, loadRecs } from '@/lib/client/storage';
import { useState, useEffect } from 'react';
import { CARD_ACCENT } from '@/lib/constants';

interface Props {
  onSync: () => Promise<void> | void;
}

export function SyncBanner({ onSync }: Props) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) { setShow(false); return; }
    const hasRecords = loadRecs().length > 0;
    const hasUnsynced = getUnsynced().length > 0;
    setShow(hasRecords && hasUnsynced);
  }, [user]);

  if (!show) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
      setShow(false);
    }
  };

  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-4 rounded-2xl ${CARD_ACCENT}`}>
        <p className="text-base font-bold text-amber-800 mb-2">
          未同期データがあります
        </p>
        <p className="text-sm text-amber-700 mb-3">
          他の端末と共有するにはクラウド同期してください
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-sm btn-press disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '同期中...' : '今すぐ同期'}
        </button>
      </div>
    </section>
  );
}
