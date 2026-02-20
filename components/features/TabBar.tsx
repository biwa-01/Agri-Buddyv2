'use client';

import { Mic, CalendarDays } from 'lucide-react';
import type { View } from '@/lib/types';

interface TabBarProps {
  view: View;
  setView: (v: View) => void;
}

export function TabBar({ view, setView }: TabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-stone-900/90 backdrop-blur-xl border-t border-white/10">
      <div className="max-w-lg mx-auto flex">
        <button
          onClick={() => setView('record')}
          className={`relative flex-1 flex flex-col items-center gap-1 py-5 transition-colors ${view === 'record' ? 'text-amber-400' : 'text-white/40'}`}
        >
          <Mic className="w-7 h-7" />
          <span className="text-base font-bold">記録</span>
          {view === 'record' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-amber-400 rounded-full tab-indicator" />}
        </button>
        <button
          onClick={() => setView('history')}
          className={`relative flex-1 flex flex-col items-center gap-1 py-5 transition-colors ${view === 'history' ? 'text-amber-400' : 'text-white/40'}`}
        >
          <CalendarDays className="w-7 h-7" />
          <span className="text-base font-bold">履歴</span>
          {view === 'history' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-amber-400 rounded-full tab-indicator" />}
        </button>
      </div>
    </nav>
  );
}
