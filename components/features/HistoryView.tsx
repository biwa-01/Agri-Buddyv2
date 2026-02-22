'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Mic, Sprout, TrendingUp, Search, X, MapPin } from 'lucide-react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

import type { LocalRecord, View } from '@/lib/types';
import { GLASS, CARD_FLAT, DAY_NAMES, GENERIC_ADVICE_RE } from '@/lib/constants';
import { fmtVal, extractNextActions, sanitizeLocation, extractCorrections, buildRecordChips } from '@/lib/logic/extraction';
import { generateOfficialReport } from '@/lib/logic/report';
import { loadRecs } from '@/lib/client/storage';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { Linkify } from '@/components/ui/Linkify';

/* ── Filter chip definitions ── */
const FILTER_CHIPS = [
  { key: 'harvest',    label: '収穫', match: (r: LocalRecord) => !!r.harvest_amount },
  { key: 'fertilizer', label: '施肥', match: (r: LocalRecord) => !!r.fertilizer },
  { key: 'pest',       label: '防除', match: (r: LocalRecord) => !!r.pest_status },
  { key: 'irrigation', label: '灌水', match: (r: LocalRecord) => /灌水|水やり|かんすい/.test(r.work_log) },
  { key: 'work',       label: '作業', match: (r: LocalRecord) => !!r.work_log },
] as const;

/* ── Full-text search target fields ── */
const SEARCH_FIELDS: (keyof LocalRecord)[] = [
  'work_log', 'fertilizer', 'pest_status', 'harvest_amount',
  'material_cost', 'fuel_cost', 'work_duration', 'plant_status',
  'location', 'admin_log', 'raw_transcript', 'advice', 'strategic_advice',
];

interface HistoryViewProps {
  hasChartData: boolean;
  trendData: { date: string; max_temp: number | null; min_temp: number | null }[];
  calMonth: Date;
  setCalMonth: React.Dispatch<React.SetStateAction<Date>>;
  calDays: (number | null)[];
  calDate: string | null;
  setCalDate: React.Dispatch<React.SetStateAction<string | null>>;
  todayISO: string;
  recordMap: Map<string, LocalRecord>;
  calSelected: LocalRecord | null;
  selectedMedia: { url: string; type: string }[];
  setFullscreenMedia: (m: { url: string; type: string } | null) => void;
  setView: (v: View) => void;
  onShowReport: (text: string, type: 'month' | 'half') => void;
  onResetData: () => void;
}

export function HistoryView({
  hasChartData, trendData,
  calMonth, setCalMonth, calDays, calDate, setCalDate, todayISO,
  recordMap, calSelected, selectedMedia, setFullscreenMedia,
  setView, onShowReport, onResetData,
}: HistoryViewProps) {

  /* ── Filter state ── */
  const [activeChips, setActiveChips] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [showLocationChips, setShowLocationChips] = useState(false);
  const [activeLocations, setActiveLocations] = useState<Set<string>>(new Set());
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const fmtCalDate = (day: number) => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  /* ── Derived: all records as flat array ── */
  const allRecords = useMemo(() => Array.from(recordMap.values()), [recordMap]);

  /* ── Available chips (only categories with data) ── */
  const availableChips = useMemo(() =>
    FILTER_CHIPS.filter(chip => allRecords.some(r => chip.match(r))),
    [allRecords],
  );

  /* ── Available locations ── */
  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    for (const r of allRecords) {
      const loc = r.location;
      if (!loc || !sanitizeLocation(loc)) continue;
      if (loc === '場所未定') continue;
      if (loc.length >= 5 && !/ハウス|畑|園|圃場|露地|山/.test(loc)) continue;
      locs.add(loc);
    }
    return Array.from(locs).sort();
  }, [allRecords]);

  /* ── Filter active? ── */
  const filterActive = activeChips.size > 0 || activeLocations.size > 0 || searchText.trim().length > 0;

  /* ── Filtered records ── */
  const filteredRecords = useMemo(() => {
    if (!filterActive) return null;

    const terms = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return allRecords
      .filter(r => {
        // Category chips: OR
        if (activeChips.size > 0) {
          const chipMatch = FILTER_CHIPS.some(c => activeChips.has(c.key) && c.match(r));
          if (!chipMatch) return false;
        }
        // Location: OR
        if (activeLocations.size > 0) {
          if (!activeLocations.has(r.location)) return false;
        }
        // Text search: AND (all terms must match)
        if (terms.length > 0) {
          const blob = SEARCH_FIELDS.map(f => {
            const v = r[f];
            return typeof v === 'string' ? v : '';
          }).join(' ').toLowerCase();
          if (!terms.every(t => blob.includes(t))) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, activeChips, activeLocations, searchText, filterActive]);

  /* ── Matched dates set (for calendar highlighting) ── */
  const matchedDatesSet = useMemo(() => {
    if (!filteredRecords) return null;
    return new Set(filteredRecords.map(r => r.date));
  }, [filteredRecords]);

  /* ── Chip toggle ── */
  const toggleChip = useCallback((key: string) => {
    setActiveChips(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  /* ── Location toggle ── */
  const toggleLocation = useCallback((loc: string) => {
    setActiveLocations(prev => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc); else next.add(loc);
      return next;
    });
  }, []);

  /* ── Clear all filters ── */
  const clearFilters = useCallback(() => {
    setActiveChips(new Set());
    setSearchText('');
    setShowLocationChips(false);
    setActiveLocations(new Set());
  }, []);

  /* ── Voice search ── */
  const startVoiceSearch = useCallback(() => {
    // シングルトンを使わず独立インスタンスを生成（メインrecogの設定を破壊しない）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any; const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.lang = 'ja-JP';
    recog.continuous = false;
    recog.interimResults = false;
    setIsVoiceSearching(true);
    recog.onresult = (e: { results: { transcript: string }[][] }) => {
      const text = e.results[0]?.[0]?.transcript || '';
      if (text) setSearchText(text);
      setIsVoiceSearching(false);
    };
    recog.onerror = () => setIsVoiceSearching(false);
    recog.onend = () => setIsVoiceSearching(false);
    recog.start();
    setTimeout(() => { try { recog.stop(); } catch { /* already stopped */ } }, 5000);
  }, []);

  /* ── Result card tap → navigate to date ── */
  const navigateToRecord = useCallback((rec: LocalRecord) => {
    const d = new Date(rec.date + 'T00:00:00');
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setCalDate(rec.date);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [setCalMonth, setCalDate]);

  /* ── Record summary for result cards ── */
  const summarize = (r: LocalRecord) => {
    const parts: string[] = [];
    if (r.work_log) parts.push(r.work_log.slice(0, 30));
    if (r.fertilizer) parts.push(`施肥: ${r.fertilizer.slice(0, 20)}`);
    if (r.harvest_amount) parts.push(`収穫: ${r.harvest_amount.slice(0, 20)}`);
    if (r.pest_status) parts.push(`防除: ${r.pest_status.slice(0, 20)}`);
    return parts.join(' / ') || '記録あり';
  };

  return (
    <div className="view-enter">

      <section className="mx-5 mb-4">
        <button onClick={() => setView('record')}
          className={`w-full py-4 rounded-2xl ${GLASS} flex items-center justify-center gap-2 text-xl font-bold text-stone-700 hover:bg-white/80 btn-press`}>
          <ChevronLeft className="w-6 h-6" /> 記録に戻る
        </button>
      </section>

      {hasChartData && (
        <section className="mx-5 mb-4 view-enter">
          <div className={`p-4 rounded-2xl ${CARD_FLAT}`}>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-sm font-bold text-stone-600">直近14日の気温推移</p>
              <div className="flex items-center gap-3 ml-auto text-xs font-medium">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#FF8C00] rounded" />最高</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-500 rounded" />最低</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="max_temp" stroke="#FF8C00" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="min_temp" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Search & Filter Section ── */}
      <section className="mx-5 mb-4 fade-up">
        {/* Search bar */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${CARD_FLAT} mb-3`}>
          <Search className="w-5 h-5 text-stone-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="キーワード検索..."
            className="flex-1 bg-transparent text-lg text-stone-800 placeholder:text-stone-400 outline-none"
          />
          {searchText && (
            <button onClick={() => setSearchText('')} className="p-1 rounded-full hover:bg-stone-100 btn-press">
              <X className="w-5 h-5 text-stone-400" />
            </button>
          )}
          <button
            onClick={startVoiceSearch}
            className={`p-2 rounded-full btn-press transition-colors ${isVoiceSearching ? 'bg-red-100 text-red-600' : 'hover:bg-stone-100 text-stone-400'}`}
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        {/* Smart chips */}
        {availableChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {availableChips.map(chip => (
              <button
                key={chip.key}
                onClick={() => toggleChip(chip.key)}
                className={`px-4 py-2 rounded-full text-base font-bold transition-all btn-press ${
                  activeChips.has(chip.key)
                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-400'
                    : 'bg-white/80 text-stone-600 border border-stone-200/50 hover:bg-stone-50'
                }`}
              >
                {chip.label}
              </button>
            ))}
            {availableLocations.length > 0 && (
              <button
                onClick={() => setShowLocationChips(v => !v)}
                className={`px-4 py-2 rounded-full text-base font-bold transition-all btn-press flex items-center gap-1.5 ${
                  showLocationChips || activeLocations.size > 0
                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-400'
                    : 'bg-white/80 text-stone-600 border border-stone-200/50 hover:bg-stone-50'
                }`}
              >
                <MapPin className="w-4 h-4" />場所
              </button>
            )}
            {filterActive && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-full text-base font-bold text-stone-500 bg-stone-100 border border-stone-200/50 hover:bg-stone-200/70 btn-press"
              >
                解除
              </button>
            )}
          </div>
        )}

        {/* Location sub-chips */}
        {showLocationChips && availableLocations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 filter-slide-down">
            {availableLocations.map(loc => (
              <button
                key={loc}
                onClick={() => toggleLocation(loc)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all btn-press flex items-center gap-1 ${
                  activeLocations.has(loc)
                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-400'
                    : 'bg-white/80 text-stone-500 border border-stone-200/50 hover:bg-stone-50'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />{loc}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Calendar ── */}
      <section className="mx-5 mb-4 fade-up">
        <div className={`p-5 rounded-2xl ${GLASS}`}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="p-2 rounded-full hover:bg-white/50 btn-press">
              <ChevronLeft className="w-6 h-6 text-stone-600" />
            </button>
            <h2 className="text-xl font-bold text-stone-900">
              {calMonth.getFullYear()}年{calMonth.getMonth() + 1}月
            </h2>
            <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="p-2 rounded-full hover:bg-white/50 btn-press">
              <ChevronRight className="w-6 h-6 text-stone-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className={`text-center text-sm font-medium py-1 ${d === '日' ? 'text-red-400' : d === '土' ? 'text-blue-400' : 'text-stone-400'}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calDays.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} />;
              const iso = fmtCalDate(day);
              const hasRec = recordMap.has(iso);
              const isToday = iso === todayISO;
              const isSel = iso === calDate;
              const isMatch = matchedDatesSet?.has(iso) ?? false;
              const isFilterDimmed = filterActive && hasRec && !isMatch;

              return (
                <button key={iso} onClick={() => setCalDate(isSel ? null : iso)}
                  className={`
                    relative aspect-square flex flex-col items-center justify-center rounded-xl text-2xl font-bold transition-all btn-press
                    ${isToday
                      ? 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] text-white shadow-md'
                      : isSel
                        ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-400'
                        : filterActive && isMatch
                          ? 'bg-green-100 text-green-800 ring-2 ring-green-400'
                          : isFilterDimmed
                            ? 'bg-stone-100/50 text-stone-400'
                            : hasRec
                              ? 'bg-green-50 text-stone-700 hover:bg-green-100/70'
                              : 'text-stone-700 hover:bg-white/50'
                    }
                  `}>
                  {day}
                  {hasRec && !isToday && (
                    <span className={`absolute bottom-0.5 text-[11px] font-bold ${isFilterDimmed ? 'text-stone-300' : 'text-green-600'}`}>済</span>
                  )}
                </button>
              );
            })}
          </div>

          {calDate && (
            <div className="flex items-center justify-center gap-2 py-3 text-stone-400 scroll-hint-bounce">
              <ChevronDown className="w-5 h-5" />
              <span className="text-sm font-medium">下にスクロールで詳細</span>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={() => {
              const rpt = generateOfficialReport(loadRecs(), calMonth.getFullYear(), calMonth.getMonth(), 1);
              onShowReport(rpt, 'month');
            }} className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-stone-900/80 text-white text-base font-bold hover:bg-stone-900 btn-press">
              {calMonth.getMonth() + 1}月レポート
            </button>
            <button onClick={() => {
              const startMonth = calMonth.getMonth() < 6 ? 0 : 6;
              const rpt = generateOfficialReport(loadRecs(), calMonth.getFullYear(), startMonth, 6);
              onShowReport(rpt, 'half');
            }} className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-base font-bold btn-press">
              半期報告書
            </button>
          </div>

          <div className="mt-4 text-center">
            <button onClick={onResetData} className="text-xs text-stone-400 hover:text-red-400 transition-colors">
              データをすべてリセット
            </button>
          </div>
        </div>
      </section>

      {/* ── Search Results List ── */}
      {filterActive && (
        <section className="mx-5 mb-4 fade-up">
          <div className={`p-4 rounded-2xl ${GLASS}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-bold text-stone-700">
                {filteredRecords ? `${filteredRecords.length}件の記録` : '検索中...'}
              </p>
              <button onClick={clearFilters} className="text-sm font-bold text-stone-500 hover:text-stone-700 btn-press">
                フィルター解除
              </button>
            </div>
            {filteredRecords && filteredRecords.length > 0 ? (
              <div className="max-h-[40vh] overflow-y-auto no-scrollbar space-y-2">
                {filteredRecords.map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => navigateToRecord(rec)}
                    className={`w-full text-left p-3 rounded-xl ${CARD_FLAT} hover:bg-white/80 btn-press transition-colors`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-base font-bold text-stone-800">{rec.date}</span>
                      {rec.location && (
                        <span className="text-xs font-medium text-stone-500 flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />{rec.location}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-stone-600 line-clamp-1">{summarize(rec)}</p>
                    <div className="flex gap-1.5 mt-1.5">
                      {rec.harvest_amount && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">収穫</span>}
                      {rec.fertilizer && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">施肥</span>}
                      {rec.pest_status && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">防除</span>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-base text-stone-400 mb-3">該当する記録はありません</p>
                <button onClick={clearFilters} className="px-4 py-2 rounded-full bg-stone-100 text-stone-600 text-sm font-bold hover:bg-stone-200 btn-press">
                  フィルター解除
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Record Detail ── */}
      {calSelected && (
        <>
        <section ref={detailRef} className="mx-2 mb-4 fade-up">
          <div className={`p-5 rounded-2xl ${GLASS}`}>
            <p className="text-4xl font-black text-amber-700 mb-3">{calDate}</p>
            {/* ── チップ帯 ── */}
            {(() => {
              const chips = buildRecordChips(calSelected);
              if (chips.length === 0) return null;
              const colorMap: Record<string, string> = {
                amber: 'bg-amber-100 text-amber-800 border-amber-200',
                blue: 'bg-blue-100 text-blue-800 border-blue-200',
                green: 'bg-green-100 text-green-800 border-green-200',
                orange: 'bg-orange-100 text-orange-800 border-orange-200',
                red: 'bg-red-100 text-red-800 border-red-200',
                purple: 'bg-purple-100 text-purple-800 border-purple-200',
              };
              return (
                <div className="flex flex-wrap gap-1.5 my-3">
                  {chips.map((c, i) => (
                    <span key={i} className={`text-sm font-bold px-2.5 py-1 rounded-full border ${colorMap[c.color] || 'bg-stone-100 text-stone-700'}`}>
                      {c.label}
                    </span>
                  ))}
                </div>
              );
            })()}
            {/* ── admin_log: 青系カード — 位置昇格 ── */}
            {calSelected.admin_log && (
              <div className="mt-3 p-4 rounded-xl bg-blue-50 border-2 border-blue-300">
                <p className="text-xl font-black text-blue-800 mb-1 flex items-center gap-1.5">
                  <Sprout className="w-5 h-5" />AI補正後の日誌
                </p>
                <pre className="text-xl font-medium text-blue-900 whitespace-pre-wrap leading-relaxed font-serif">{calSelected.admin_log}</pre>
              </div>
            )}
            {/* ── AI補正バッジ ── */}
            {calSelected.raw_transcript && (() => {
              const corrections = extractCorrections(calSelected.raw_transcript);
              if (corrections.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                  {corrections.map((c, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                      <span className="line-through opacity-60">{c.original}</span>
                      <span className="mx-0.5">{'\u2192'}</span>
                      <span className="font-bold">{c.corrected}</span>
                    </span>
                  ))}
                </div>
              );
            })()}
            {calSelected.house_data && (
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.max_temp, '℃')}</p><p className="text-xl font-bold text-stone-600">最高</p></div>
                <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.min_temp, '℃')}</p><p className="text-xl font-bold text-stone-600">最低</p></div>
                <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.humidity, '%')}</p><p className="text-xl font-bold text-stone-600">湿度</p></div>
              </div>
            )}
            <div className="space-y-3 text-2xl">
              {calSelected.work_log && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">作業:</b> {calSelected.work_log}</span></div>}
              {calSelected.work_duration && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">時間:</b> {calSelected.work_duration}</span></div>}
              {calSelected.fertilizer && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">施肥:</b> {calSelected.fertilizer}</span></div>}
              {calSelected.pest_status && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">病害虫:</b> {calSelected.pest_status}</span></div>}
              {calSelected.harvest_amount && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">収穫:</b> {calSelected.harvest_amount}</span></div>}
              {calSelected.material_cost && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">資材費:</b> {calSelected.material_cost}</span></div>}
              {calSelected.fuel_cost && <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">燃料費:</b> {calSelected.fuel_cost}</span></div>}
              {calSelected.plant_status && calSelected.plant_status !== '良好' && (
                <div><span className="text-stone-900"><b className="text-xl font-bold text-stone-600">所見:</b> {calSelected.plant_status}</span></div>
              )}
            </div>
            {selectedMedia.length > 0 && (
              <div className="grid grid-cols-2 gap-2 my-3">
                {selectedMedia.map((m, i) => (
                  <button key={i} onClick={() => setFullscreenMedia(m)} className="relative rounded-xl overflow-hidden border border-stone-200/50 btn-press">
                    {m.type === 'video' ? (
                      <>
                        <video src={m.url} playsInline muted className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-stone-700 ml-1" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {calSelected.estimated_profit != null && calSelected.estimated_profit > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-green-50/70 border border-green-200/50">
                <p className="text-sm font-bold text-green-700 mb-1">見込み増益</p>
                <p className="text-lg font-black text-green-800">推定 +{calSelected.estimated_profit >= 10000 ? `${(calSelected.estimated_profit / 10000).toFixed(1)}万円` : `${calSelected.estimated_profit.toLocaleString()}円`}</p>
              </div>
            )}
            {(calSelected.strategic_advice || calSelected.advice) && (() => {
              const isGeneric = GENERIC_ADVICE_RE.test(calSelected.advice || '') && GENERIC_ADVICE_RE.test(calSelected.strategic_advice || '');
              if (isGeneric) return (
                <div className="mt-3 p-3 rounded-xl bg-stone-50/50 border border-stone-200/30">
                  <p className="text-base font-medium text-stone-400">詳細を入力すると分析が表示されます</p>
                </div>
              );
              const { analysisOnly, actions } = extractNextActions(calSelected.advice || '', calSelected.strategic_advice || '');
              const strategicLines = (calSelected.strategic_advice || '').split('\n').filter(l => !/^次回:\s*/.test(l)).join('\n').trim();

              const REF_RE = /^【参考】/;
              const allLines = (analysisOnly || '').split('\n').filter(l => l.trim() && !REF_RE.test(l));
              const adviceLines = allLines.filter(l => !GENERIC_ADVICE_RE.test(l));

              return (<>
                {/* ── Advice block: Blue-50 / serif ── */}
                {(adviceLines.length > 0 || (strategicLines && !GENERIC_ADVICE_RE.test(strategicLines))) && (
                  <div className="mt-3 p-4 rounded-xl bg-blue-50/70 border border-blue-200/50">
                    <p className="text-xl font-bold text-blue-700 mb-1 flex items-center gap-1.5">
                      <Sprout className="w-5 h-5" />AIからのコメント
                    </p>
                    {strategicLines && !GENERIC_ADVICE_RE.test(strategicLines) && (
                      <p className="text-xl font-medium text-blue-800 whitespace-pre-line mb-2 font-serif"><Linkify text={strategicLines} /></p>
                    )}
                    {adviceLines.length > 0 && (
                      <div className="space-y-1">
                        {adviceLines.map((a, i) => (
                          <p key={i} className="text-xl font-medium text-stone-600 leading-relaxed font-serif">{a}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* ── Next actions: only when NO strategicLines ── */}
                {actions.length > 0 && !strategicLines ? (
                  <div className="mt-3 p-4 rounded-xl bg-orange-50/70 border border-orange-200/50">
                    <p className="text-xl font-bold text-orange-700 mb-1 flex items-center gap-1.5">
                      <TrendingUp className="w-5 h-5" />ネクストアクション
                    </p>
                    <ul className="space-y-1">
                      {actions.map((a, i) => (
                        <li key={i} className="text-xl font-medium text-orange-900 flex items-start gap-2">
                          <span className="text-orange-500 mt-1 shrink-0">▸</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>);
            })()}
            {/* ── raw_transcript: 最下部に降格 ── */}
            {calSelected.raw_transcript && (
              <details className="mt-3">
                <summary className="text-sm font-bold text-stone-500 cursor-pointer flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />音声入力（原文）を表示
                </summary>
                <div className="mt-2 p-4 rounded-xl bg-white border-2 border-stone-300">
                  <pre className="text-xl font-bold text-stone-800 whitespace-pre-wrap leading-relaxed font-sans">{calSelected.raw_transcript}</pre>
                </div>
              </details>
            )}
          </div>
        </section>
        <section className="mx-5 mb-4">
          <button onClick={() => setView('record')}
            className={`w-full py-4 rounded-2xl ${GLASS} flex items-center justify-center gap-2 text-xl font-bold text-stone-700 hover:bg-white/80 btn-press`}>
            <ChevronLeft className="w-6 h-6" /> 記録に戻る
          </button>
        </section>
        </>
      )}

    </div>
  );
}
