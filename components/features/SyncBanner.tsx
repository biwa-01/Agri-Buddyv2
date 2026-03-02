'use client';

import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/client/auth';
import { getUnsynced } from '@/lib/client/storage';
import { useState, useEffect } from 'react';
import { CARD_ACCENT } from '@/lib/constants';

interface Props {
  onSync: () => void;
}

export function SyncBanner({ onSync }: Props) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) { setShow(false); return; }
    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isPwa = matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const hasUnsynced = getUnsynced().length > 0;
    setShow(isSafari && !isPwa && hasUnsynced);
  }, [user]);

  if (!show) return null;

  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-4 rounded-2xl ${CARD_ACCENT}`}>
        <p className="text-base font-bold text-amber-800 mb-2">
          Safariの未同期データがあります
        </p>
        <p className="text-sm text-amber-700 mb-3">
          PWA（ホーム画面版）と共有するにはクラウド同期してください
        </p>
        <button
          onClick={() => { onSync(); setShow(false); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-sm btn-press"
        >
          <RefreshCw className="w-4 h-4" />
          今すぐ同期
        </button>
      </div>
    </section>
  );
}
