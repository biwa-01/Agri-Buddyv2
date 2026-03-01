'use client';

import { useState } from 'react';
import { Check, X, MapPin, Thermometer, Calendar } from 'lucide-react';
import { GLASS } from '@/lib/constants';
import type { ConfirmCard } from '@/lib/types';

interface ConfirmScreenProps {
  cards: ConfirmCard[];
  recordDate: string;
  locationOptions: string[];
  onUpdateCard: (idx: number, field: keyof ConfirmCard, value: string | number | null) => void;
  onDateChange: (date: string) => void;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
}

export function ConfirmScreen({ cards, recordDate, locationOptions, onUpdateCard, onDateChange, onSave, onReset, saving }: ConfirmScreenProps) {
  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-5 rounded-2xl ${GLASS}`}>
        <h2 className="font-display text-2xl tracking-[0.3em] text-stone-900 font-bold mb-2">営 農 日 誌</h2>
        <p className="text-base font-medium text-stone-500 mb-4">内容を確認・修正して「保存」を押してください。</p>

        {/* 日付セレクター */}
        <div className="mb-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200/50">
          <label className="flex items-center gap-2 text-base font-bold text-amber-800 mb-2">
            <Calendar className="w-5 h-5" />実施日
          </label>
          <input
            type="date"
            value={recordDate}
            onChange={e => onDateChange(e.target.value)}
            className="w-full py-3 px-4 text-lg font-bold text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* 場所カード */}
        <div className="space-y-4">
          {cards.map(card => (
            <LocationCard
              key={card.idx}
              card={card}
              locationOptions={locationOptions}
              onUpdate={onUpdateCard}
            />
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

/* ── 場所別カード ── */
function LocationCard({ card, locationOptions, onUpdate }: {
  card: ConfirmCard;
  locationOptions: string[];
  onUpdate: (idx: number, field: keyof ConfirmCard, value: string | number | null) => void;
}) {
  const [showChips, setShowChips] = useState(false);

  const handleTempChange = (field: 'max_temp' | 'min_temp', raw: string) => {
    if (raw === '' || raw === '-') {
      onUpdate(card.idx, field, null);
      return;
    }
    const v = parseFloat(raw);
    if (!isNaN(v)) onUpdate(card.idx, field, v);
  };

  // カードに設定されていない登録済み場所のみチップ表示
  const chipOptions = locationOptions.filter(loc => loc !== card.location);

  return (
    <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-300">
      {/* 場所名ヘッダー */}
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-5 h-5 text-blue-700 shrink-0" />
        <input
          type="text"
          value={card.location}
          onChange={e => onUpdate(card.idx, 'location', e.target.value)}
          placeholder="場所名を入力"
          className="flex-1 py-2 px-3 text-lg font-bold text-blue-900 bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {chipOptions.length > 0 && (
          <button
            onClick={() => setShowChips(v => !v)}
            className={`px-3 py-2 rounded-xl text-sm font-bold btn-press transition-colors ${
              showChips ? 'bg-amber-100 text-amber-800 border border-amber-400' : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            選択
          </button>
        )}
      </div>

      {/* 登録済み場所チップ */}
      {showChips && chipOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {chipOptions.map(loc => (
            <button
              key={loc}
              onClick={() => {
                onUpdate(card.idx, 'location', loc);
                setShowChips(false);
              }}
              className="px-3 py-1.5 rounded-full text-sm font-bold bg-white text-stone-700 border border-stone-200 hover:bg-amber-50 hover:border-amber-300 btn-press transition-colors"
            >
              {loc}
            </button>
          ))}
        </div>
      )}

      {/* 温度入力（2カラム） */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 p-3 rounded-xl bg-orange-50/80 border border-orange-200/50">
          <label className="flex items-center gap-1.5 text-xs font-bold text-orange-700 mb-1">
            <Thermometer className="w-3.5 h-3.5" />最高気温
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={card.max_temp ?? ''}
              onChange={e => handleTempChange('max_temp', e.target.value)}
              placeholder="-"
              className="w-full py-2 px-3 text-lg font-bold text-stone-900 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <span className="text-base font-bold text-stone-500 shrink-0">{'\u2103'}</span>
          </div>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-blue-50/80 border border-blue-200/50">
          <label className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-1">
            <Thermometer className="w-3.5 h-3.5" />最低気温
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={card.min_temp ?? ''}
              onChange={e => handleTempChange('min_temp', e.target.value)}
              placeholder="-"
              className="w-full py-2 px-3 text-lg font-bold text-stone-900 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="text-base font-bold text-stone-500 shrink-0">{'\u2103'}</span>
          </div>
        </div>
      </div>

      {/* 湿度（読み取り専用表示） */}
      {card.humidity != null && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-stone-50 border border-stone-200/50">
          <span className="text-sm font-bold text-stone-500">湿度: {card.humidity}%</span>
        </div>
      )}

      {/* 営農日誌 */}
      <textarea
        value={card.admin_log}
        onChange={e => onUpdate(card.idx, 'admin_log', e.target.value)}
        rows={8}
        className="w-full text-lg font-medium text-stone-900 bg-white border border-stone-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400 font-serif leading-relaxed"
      />
    </div>
  );
}
