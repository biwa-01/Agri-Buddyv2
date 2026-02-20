'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';

const NAGASAKI_MESSAGES = [
  'ばさろ頑張ったばい！',
  'よう頑張ったたい！',
  '今日もよかばい！',
  'お疲れさん、よか仕事たい！',
  'きつかったろ？よう頑張った！',
  '今日も一日、よかったばい！',
] as const;

interface CelebrationOverlayProps {
  celebrationProfit: number;
}

export function CelebrationOverlay({ celebrationProfit }: CelebrationOverlayProps) {
  const message = useMemo(
    () => NAGASAKI_MESSAGES[Math.floor(Math.random() * NAGASAKI_MESSAGES.length)],
    []
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm">
      {Array.from({ length: 15 }, (_, i) => <span key={i} className="confetti-piece" />)}
      <div className="celebration-pop flex flex-col items-center gap-4 p-8">
        <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.5)]">
          <Check className="w-12 h-12 text-white" />
        </div>
        <p className="text-3xl font-black text-white">保存完了</p>
        <p className="text-xl font-bold text-amber-200/90">{message}</p>
        {celebrationProfit > 0 && (<>
          <p className="text-lg font-bold text-green-200/80">本日の推定収益</p>
          <p className="text-5xl font-black text-green-300">
            +{celebrationProfit >= 10000 ? `${(celebrationProfit / 10000).toFixed(1)}万円` : `${celebrationProfit.toLocaleString()}円`}
          </p>
        </>)}
      </div>
    </div>
  );
}
