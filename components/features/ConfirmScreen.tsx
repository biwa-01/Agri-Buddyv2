'use client';

import { Check, X, Sprout } from 'lucide-react';
import { GLASS } from '@/lib/constants';
import type { ConfirmItem } from '@/lib/types';

interface ConfirmScreenProps {
  confirmItems: ConfirmItem[];
  onUpdate: (key: string, val: string) => void;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
}

export function ConfirmScreen({ confirmItems, onUpdate, onSave, onReset, saving }: ConfirmScreenProps) {
  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-5 rounded-2xl ${GLASS}`}>
        <h2 className="font-display text-2xl tracking-[0.3em] text-stone-900 font-bold mb-2">営 農 日 誌</h2>
        <p className="text-base font-medium text-stone-500 mb-4">内容を確認・修正して「保存」を押してください。</p>
        <div className="space-y-4">
          {confirmItems.map((item, i) => (
            <div key={`${item.key}-${i}`} className="p-3 rounded-xl bg-blue-50 border-2 border-blue-300">
              <p className="text-xs font-black text-blue-800 tracking-wide mb-1 flex items-center gap-1">
                <Sprout className="w-3.5 h-3.5" />{item.label}
              </p>
              <textarea
                value={item.value}
                onChange={e => onUpdate(item.key, e.target.value)}
                rows={10}
                className="w-full text-lg font-medium text-stone-900 bg-white border border-stone-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400 font-serif leading-relaxed"
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={onSave} disabled={saving}
            className={`flex-1 py-5 rounded-3xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-2xl font-black shadow-lg btn-press flex items-center justify-center gap-2 ${saving ? 'opacity-70' : ''}`}>
            {saving ? (
              <><span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin inline-block" /> 日誌生成中...</>
            ) : (
              <><Check className="w-7 h-7" /> 保存する</>
            )}
          </button>
          <button onClick={onReset}
            className="py-5 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
            <X className="w-6 h-6" /> 破棄
          </button>
        </div>
      </div>
    </section>
  );
}
