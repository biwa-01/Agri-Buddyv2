'use client';

import { SkipForward } from 'lucide-react';
import type { Phase } from '@/lib/types';

interface FollowUpBarProps {
  phase: Phase;
  onConfirm: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
}

export function FollowUpBar({ onConfirm, onSkipAll }: FollowUpBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-3 bg-gradient-to-t from-stone-900/95 via-stone-900/80 to-transparent">
      <div className="max-w-lg mx-auto flex gap-3">
        <button onClick={onConfirm}
          className="flex-[2] rounded-2xl bg-white/70 backdrop-blur-xl border border-stone-200/40 flex items-center justify-center gap-2 text-xl font-black text-stone-700 shadow-lg btn-press min-h-[72px]">
          <SkipForward className="w-6 h-6" /> スキップ
        </button>
        <button onClick={onSkipAll}
          className="flex-1 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] flex items-center justify-center px-4 text-xl font-bold text-white shadow-lg btn-press min-h-[72px]">
          記録終了
        </button>
      </div>
    </div>
  );
}
