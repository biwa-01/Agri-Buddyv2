'use client';

import { useState, useMemo, useEffect } from 'react';
import type { LocalRecord } from '@/lib/types';
import { DAY_NAMES } from '@/lib/constants';
import { loadRecs, getCalDays, loadMediaForRecord } from '@/lib/client/storage';

export function useCalendar(mounted: boolean, histVer: number) {
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calDate, setCalDate] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: string }[]>([]);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: string } | null>(null);

  const calDays = useMemo(() => getCalDays(calMonth.getFullYear(), calMonth.getMonth()), [calMonth]);

  const recordMap = useMemo(() => {
    if (!mounted) return new Map<string, LocalRecord[]>();
    void histVer;
    const m = new Map<string, LocalRecord[]>();
    loadRecs().forEach(r => {
      try {
        if (!r.date) return;
        const arr = m.get(r.date) || [];
        arr.push(r);
        m.set(r.date, arr);
      } catch { /* skip bad record */ }
    });
    for (const arr of m.values()) arr.sort((a, b) => b.timestamp - a.timestamp);
    return m;
  }, [mounted, histVer]);

  const calSelected = useMemo(() => calDate ? recordMap.get(calDate) ?? null : null, [calDate, recordMap]) as LocalRecord[] | null;

  /* ── Load media for selected record ── */
  useEffect(() => {
    if (!calSelected || calSelected.length === 0) { setSelectedMedia([]); return; }
    let cancelled = false;
    loadMediaForRecord(calSelected[0].id).then(items => {
      if (cancelled) return;
      setSelectedMedia(items.map(m => ({ url: URL.createObjectURL(m.blob), type: m.type })));
    }).catch(() => { if (!cancelled) setSelectedMedia([]); });
    return () => { cancelled = true; selectedMedia.forEach(m => URL.revokeObjectURL(m.url)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calSelected?.[0]?.id]);

  const weeklyCount = useMemo(() => {
    if (!mounted) return 0;
    void histVer;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return loadRecs().filter(r => new Date(r.date) >= weekAgo).length;
  }, [mounted, histVer]);

  const streak = useMemo(() => {
    if (!mounted) return 0;
    void histVer;
    const dates = new Set(loadRecs().map(r => r.date));
    let count = 0;
    const d = new Date();
    while (true) {
      const iso = d.toISOString().split('T')[0];
      if (dates.has(iso)) {
        count++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [mounted, histVer]);

  const trendData = useMemo(() => {
    if (!mounted) return [];
    const data: { date: string; max_temp: number | null; min_temp: number | null }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const rec = recordMap.get(iso)?.[0];
      data.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        max_temp: rec?.house_data?.max_temp ?? null,
        min_temp: rec?.house_data?.min_temp ?? null,
      });
    }
    return data;
  }, [mounted, recordMap]);

  const hasChartData = useMemo(() => trendData.some(d => d.max_temp !== null || d.min_temp !== null), [trendData]);

  const isFirstTime = useMemo(() => {
    if (!mounted) return false;
    void histVer;
    return loadRecs().length === 0;
  }, [mounted, histVer]);

  const streakColor = streak >= 30
    ? 'text-red-600 bg-red-50' : streak >= 14
    ? 'text-orange-600 bg-orange-50' : streak >= 7
    ? 'text-amber-600 bg-amber-50' : streak >= 3
    ? 'text-amber-500 bg-amber-50/60' : 'text-stone-400 bg-stone-100/60';

  const dateStr = mounted ? (() => {
    const t = new Date();
    return `${t.getMonth() + 1}月${t.getDate()}日（${DAY_NAMES[t.getDay()]}）`;
  })() : '';

  const todayISO = mounted ? new Date().toISOString().split('T')[0] : '';

  return {
    calMonth, setCalMonth, calDate, setCalDate,
    recordMap, calSelected, weeklyCount, streak, trendData, hasChartData,
    isFirstTime, streakColor, calDays, dateStr, todayISO,
    selectedMedia, setSelectedMedia, fullscreenMedia, setFullscreenMedia,
  };
}
