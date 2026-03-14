'use client';

import { useState } from 'react';
import { Check, X, MapPin, Thermometer, Calendar, Trash2, List, Pencil, Camera, Plus, Video } from 'lucide-react';
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
  onDeleteCard: (idx: number) => void;
  saving?: boolean;
  isEditMode?: boolean;
  narrative?: string;
  onNarrativeChange?: (value: string) => void;
  plantVariety?: string;
  onPlantVarietyChange?: (value: string) => void;
  mediaPreview?: { url: string; type: string }[];
  photoCount?: number;
  onAddMedia?: () => void;
  onRemoveMedia?: (index: number) => void;
  onMediaTap?: (media: { url: string; type: string }) => void;
}

export function ConfirmScreen({ cards, recordDate, locationOptions, onUpdateCard, onDateChange, onSave, onReset, onDeleteCard, saving, isEditMode, narrative, onNarrativeChange, plantVariety, onPlantVarietyChange, mediaPreview, photoCount, onAddMedia, onRemoveMedia, onMediaTap }: ConfirmScreenProps) {
  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-5 rounded-2xl ${GLASS}`}>
        <h2 className="font-display text-2xl tracking-[0.3em] text-stone-900 font-bold mb-2">
          {isEditMode ? '記録の編集' : '営 農 日 誌'}
        </h2>
        <p className="text-base font-medium text-stone-500 mb-4">
          {isEditMode ? '内容を修正して「更新する」を押してください。' : '内容を確認・修正して「保存」を押してください。'}
        </p>

        {/* 今日の振り返り */}
        {narrative != null && narrative !== '' && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200/50">
            <label className="block text-xs font-bold text-amber-700 mb-1.5">今日の振り返り</label>
            <textarea
              value={narrative}
              onChange={e => onNarrativeChange?.(e.target.value)}
              rows={3}
              className="w-full text-lg font-medium text-stone-900 bg-white border border-stone-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400 font-serif leading-relaxed"
            />
          </div>
        )}

        {/* 品種 */}
        {plantVariety != null && plantVariety !== '' && (
          <div className="mb-4 p-3 rounded-xl bg-green-50/80 border border-green-200/50">
            <label className="block text-xs font-bold text-green-700 mb-1">品種</label>
            <input
              type="text" value={plantVariety}
              onChange={e => onPlantVarietyChange?.(e.target.value)}
              className="w-full bg-transparent text-base text-green-900 outline-none"
              placeholder="品種名"
            />
          </div>
        )}

        {/* 場所カード */}
        <div className="space-y-4">
          {cards.map((card, i) => (
            <div key={card.idx} className="card-bounce" style={{ animationDelay: `${i * 80}ms` }}>
              <LocationCard
                card={card}
                locationOptions={locationOptions}
                onUpdate={onUpdateCard}
                onDateChange={onDateChange}
                onDeleteCard={onDeleteCard}
                totalCards={cards.length}
                isEditMode={isEditMode}
              />
            </div>
          ))}
        </div>

        {/* 写真・動画 */}
        <div className="mt-4 p-4 rounded-xl bg-stone-50/80 border border-stone-200/50">
          <label className="flex items-center gap-1.5 text-xs font-bold text-stone-600 mb-3">
            <Camera className="w-3.5 h-3.5" />写真・動画
            {(photoCount ?? 0) > 0 && <span className="text-amber-700">（{photoCount}件添付）</span>}
          </label>
          {mediaPreview && mediaPreview.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {mediaPreview.map((m, i) => (
                <div key={i} className="relative group">
                  {m.type === 'video' ? (
                    <div
                      className="w-20 h-20 rounded-lg border border-stone-200 overflow-hidden cursor-pointer relative"
                      onClick={() => onMediaTap?.(m)}
                    >
                      <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Video className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={m.url} alt=""
                      className="w-20 h-20 object-cover rounded-lg border border-stone-200 cursor-pointer"
                      onClick={() => onMediaTap?.(m)}
                    />
                  )}
                  {onRemoveMedia && (
                    <button
                      onClick={() => onRemoveMedia(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: 1 }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {onAddMedia && (
            <button
              onClick={onAddMedia}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-dashed border-stone-300 text-stone-600 text-sm font-bold btn-press hover:border-amber-400 hover:text-amber-700 transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" /> 写真・動画を追加
            </button>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onSave} disabled={saving}
            className={`flex-1 py-5 rounded-3xl bg-gradient-to-r from-terra to-terra-dark text-white text-2xl font-black shadow-lg btn-press flex items-center justify-center gap-2 ${saving ? 'opacity-70' : ''}`}>
            {saving ? (
              <><span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin inline-block" /> 日誌生成中...</>
            ) : (
              <><Check className="w-7 h-7" /> {isEditMode ? '更新する' : '保存する'}</>
            )}
          </button>
          <button onClick={onReset}
            className="py-5 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
            <X className="w-6 h-6" /> {isEditMode ? 'キャンセル' : '破棄'}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── 場所編集ダイアログ ── */
function LocationDialog({ card, locationOptions, onUpdate, onDeleteCard, totalCards, onClose }: {
  card: ConfirmCard;
  locationOptions: string[];
  onUpdate: (idx: number, field: keyof ConfirmCard, value: string | number | null) => void;
  onDeleteCard: (idx: number) => void;
  totalCards: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'menu' | 'select' | 'edit'>('menu');
  const [editValue, setEditValue] = useState(card.location);
  const chipOptions = locationOptions.filter(loc => loc !== card.location);

  if (mode === 'select') {
    return (
      <div className="p-4 rounded-xl bg-white border border-blue-200 shadow-lg">
        <p className="text-base font-bold text-stone-700 mb-3">登録済みの場所から選択</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {chipOptions.map(loc => (
            <button
              key={loc}
              onClick={() => { onUpdate(card.idx, 'location', loc); onClose(); }}
              className="px-3 py-1.5 rounded-full text-sm font-bold bg-stone-50 text-stone-700 border border-stone-200 hover:bg-amber-50 hover:border-amber-300 btn-press transition-colors"
            >
              {loc}
            </button>
          ))}
        </div>
        <button onClick={() => setMode('menu')} className="text-sm font-bold text-stone-500 hover:text-stone-700 btn-press">
          戻る
        </button>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className="p-4 rounded-xl bg-white border border-blue-200 shadow-lg">
        <p className="text-base font-bold text-stone-700 mb-3">場所名を編集</p>
        <input
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          autoFocus
          placeholder="場所名を入力"
          className="w-full py-2 px-3 text-lg font-bold text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { onUpdate(card.idx, 'location', editValue); onClose(); }}
            className="flex-1 py-2 rounded-xl bg-gradient-to-r from-terra to-terra-dark text-white text-base font-bold btn-press"
          >
            決定
          </button>
          <button onClick={() => setMode('menu')} className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 text-base font-bold btn-press">
            戻る
          </button>
        </div>
      </div>
    );
  }

  // menu mode
  return (
    <div className="p-4 rounded-xl bg-white border border-blue-200 shadow-lg">
      <p className="text-base font-bold text-stone-700 mb-3">場所の変更</p>
      <div className="space-y-2">
        {chipOptions.length > 0 && (
          <button
            onClick={() => setMode('select')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-left hover:bg-amber-50 hover:border-amber-300 btn-press transition-colors"
          >
            <List className="w-5 h-5 text-stone-500 shrink-0" />
            <span className="text-base font-bold text-stone-700">登録済みから選択</span>
          </button>
        )}
        <button
          onClick={() => setMode('edit')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-left hover:bg-amber-50 hover:border-amber-300 btn-press transition-colors"
        >
          <Pencil className="w-5 h-5 text-stone-500 shrink-0" />
          <span className="text-base font-bold text-stone-700">名前を直接編集</span>
        </button>
        {totalCards > 1 && (
          <button
            onClick={() => { onDeleteCard(card.idx); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-left hover:bg-red-100 btn-press transition-colors"
          >
            <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
            <span className="text-base font-bold text-red-700">この場所を削除</span>
          </button>
        )}
      </div>
      <button onClick={onClose} className="mt-3 text-sm font-bold text-stone-500 hover:text-stone-700 btn-press">
        閉じる
      </button>
    </div>
  );
}

/* ── 場所別カード ── */
function LocationCard({ card, locationOptions, onUpdate, onDateChange, onDeleteCard, totalCards, isEditMode }: {
  card: ConfirmCard;
  locationOptions: string[];
  onUpdate: (idx: number, field: keyof ConfirmCard, value: string | number | null) => void;
  onDateChange: (date: string) => void;
  onDeleteCard: (idx: number) => void;
  totalCards: number;
  isEditMode?: boolean;
}) {
  const [showDialog, setShowDialog] = useState(false);

  const handleTempChange = (field: 'max_temp' | 'min_temp', raw: string) => {
    if (raw === '' || raw === '-') {
      onUpdate(card.idx, field, null);
      return;
    }
    const v = parseFloat(raw);
    if (!isNaN(v)) onUpdate(card.idx, field, v);
  };

  return (
    <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-300">
      {/* 実施日 */}
      <div className="mb-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200/50">
        <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
          <Calendar className="w-3.5 h-3.5" />実施日
        </label>
        <input type="date"
          value={card.date}
          onChange={e => {
            onUpdate(card.idx, 'date', e.target.value);
            if (!isEditMode) onDateChange(e.target.value);
          }}
          className="w-full py-2 px-3 text-lg font-bold text-stone-900 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {/* 場所名ヘッダー（タップでダイアログ） */}
      <div className="mb-3">
        <button
          onClick={() => setShowDialog(v => !v)}
          className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-white border border-blue-200 hover:bg-blue-50 btn-press transition-colors text-left"
        >
          <MapPin className="w-5 h-5 text-blue-700 shrink-0" />
          <span className="flex-1 text-lg font-bold text-blue-900">
            {card.location || '場所名を設定'}
          </span>
          <Pencil className="w-4 h-4 text-stone-400 shrink-0" />
        </button>
      </div>

      {/* 場所編集ダイアログ */}
      {showDialog && (
        <div className="mb-3">
          <LocationDialog
            card={card}
            locationOptions={locationOptions}
            onUpdate={onUpdate}
            onDeleteCard={onDeleteCard}
            totalCards={totalCards}
            onClose={() => setShowDialog(false)}
          />
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
