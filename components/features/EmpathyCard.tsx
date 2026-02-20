'use client';

import { useEffect, useState } from 'react';
import { HandHeart, X } from 'lucide-react';
import type { EmotionAnalysis, OutdoorWeather } from '@/lib/types';
import { getComfort, getWeatherCare } from '@/lib/logic/empathyResponses';
import { GLASS } from '@/lib/constants';

interface Props {
  emotion: EmotionAnalysis;
  outdoor: OutdoorWeather | null;
  onDismiss: () => void;
}

export function EmpathyCard({ emotion, outdoor, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(false); onDismiss(); }, 15000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  const category = emotion.primaryCategory || 'physical';
  const content = getComfort(category);
  const weatherTip = outdoor ? getWeatherCare(outdoor.temperature) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pb-8 px-4" onClick={onDismiss}>
      <div
        className={`w-full max-w-lg rounded-2xl p-6 ${GLASS} bg-amber-50/85 border-amber-200/40 empathy-glow fade-up`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <HandHeart className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-stone-800">{content.title}</h3>
          </div>
          <button onClick={onDismiss} className="p-1.5 rounded-full hover:bg-stone-200/50 btn-press">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <p className="text-lg font-medium text-stone-700 leading-relaxed mb-3">
          {content.message}
        </p>

        <div className="p-3 rounded-xl bg-amber-100/60 border border-amber-200/40 mb-3">
          <p className="text-base font-bold text-amber-800">{content.suggestion}</p>
        </div>

        {weatherTip && (
          <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200/40 mb-3">
            <p className="text-sm font-medium text-sky-800">{weatherTip}</p>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-xl bg-amber-500/90 text-white text-lg font-bold btn-press hover:bg-amber-600/90 transition-colors"
        >
          分かった
        </button>
      </div>
    </div>
  );
}
