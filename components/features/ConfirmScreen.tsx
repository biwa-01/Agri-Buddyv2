'use client';

import { useState } from 'react';
import { Check, X, Mic, FileText, Sprout } from 'lucide-react';
import { GLASS } from '@/lib/constants';
import { ConfirmField } from '@/components/ui/ConfirmField';
import type { ConfirmItem } from '@/lib/types';

interface ConfirmScreenProps {
  confirmItems: ConfirmItem[];
  onUpdate: (key: string, val: string) => void;
  onSave: () => void;
  onReset: () => void;
  onVoiceCorrection?: () => void;
  isListeningCorrection?: boolean;
  correctionTranscript?: string;
  saving?: boolean;
  locationOptions: string[];
  isNewLocation?: boolean;
}

export function ConfirmScreen({ confirmItems, onUpdate, onSave, onReset, onVoiceCorrection, isListeningCorrection, correctionTranscript, saving, locationOptions, isNewLocation }: ConfirmScreenProps) {
  // Split items into sections
  const adminItem = confirmItems.find(it => it.key === 'admin_log');
  const locationItem = confirmItems.find(it => it.key === 'location');
  const slotItems = confirmItems.filter(it => it.key !== 'raw_transcript' && it.key !== 'admin_log' && it.key !== 'location');

  const [showCustomLoc, setShowCustomLoc] = useState(false);

  const handleLocationChange = (val: string) => {
    if (val === 'その他') {
      setShowCustomLoc(true);
      onUpdate('location', '');
    } else {
      setShowCustomLoc(false);
      onUpdate('location', val);
    }
  };

  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-5 rounded-2xl ${GLASS}`}>
        <h2 className="font-display text-2xl tracking-[0.3em] text-stone-900 font-bold mb-2">営 農 日 誌</h2>
        <p className="text-base font-medium text-stone-500 mb-4">タップで修正できます。問題なければ「保存」を押してください。</p>
        <div>
          {/* Section: 場所選択 — select + カスタム入力 */}
          {locationItem && (
            <div className="mb-3 p-3 rounded-xl bg-white border border-stone-200">
              <p className="text-xs font-bold text-stone-500 tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />場所
                {isNewLocation && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-100 text-amber-700 border border-amber-300">新しい場所</span>
                )}
              </p>
              <select
                value={showCustomLoc ? 'その他' : (locationOptions.includes(locationItem.value) ? locationItem.value : (locationItem.value === '場所未定' || !locationItem.value) ? '' : 'その他')}
                onChange={e => handleLocationChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-300 bg-stone-50 text-lg font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">場所を選択...</option>
                {locationOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="その他">その他</option>
              </select>
              {showCustomLoc && (
                <input
                  type="text"
                  placeholder="場所を入力..."
                  defaultValue={locationItem.value === '場所未定' ? '' : locationItem.value}
                  onChange={e => onUpdate('location', e.target.value)}
                  className="mt-2 w-full px-3 py-2.5 rounded-xl border border-stone-300 bg-white text-lg font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
              )}
            </div>
          )}

          {/* Section: 抽出データ — 白/石系背景・ゴシック太字 */}
          <div className="mb-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
            <p className="text-xs font-bold text-stone-500 tracking-wide mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />抽出データ
            </p>
            <div className="font-sans font-bold">
              {slotItems.map((item, i) => (
                <ConfirmField key={`${item.key}-${i}`} item={item} onUpdate={onUpdate} />
              ))}
            </div>
          </div>

          {/* Section: AI補正後の日誌 — 青系・明朝体・Botアイコン */}
          {adminItem && (
            <div className="mt-3 p-3 rounded-xl bg-blue-50 border-2 border-blue-300">
              <p className="text-xs font-black text-blue-800 tracking-wide mb-1 flex items-center gap-1">
                <Sprout className="w-3.5 h-3.5" />AI補正後の日誌
              </p>
              <div className="font-serif">
                <ConfirmField item={adminItem} onUpdate={onUpdate} />
              </div>
            </div>
          )}
        </div>
        {/* Voice correction area */}
        {correctionTranscript && isListeningCorrection && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300">
            <p className="text-sm font-bold text-amber-700">{correctionTranscript}</p>
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <button onClick={onSave} disabled={saving}
            className={`flex-1 py-5 rounded-3xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-2xl font-black shadow-lg btn-press flex items-center justify-center gap-2 ${saving ? 'opacity-70' : ''}`}>
            {saving ? (
              <><span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin inline-block" /> 日誌生成中...</>
            ) : (
              <><Check className="w-7 h-7" /> 保存する</>
            )}
          </button>
          {onVoiceCorrection && (
            <button onClick={onVoiceCorrection}
              className={`py-5 px-5 rounded-2xl btn-press flex items-center justify-center ${
                isListeningCorrection
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-stone-200/80 text-stone-600'
              }`}>
              <Mic className="w-6 h-6" />
            </button>
          )}
          <button onClick={onReset}
            className="py-5 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
            <X className="w-6 h-6" /> 破棄
          </button>
        </div>
      </div>
    </section>
  );
}
