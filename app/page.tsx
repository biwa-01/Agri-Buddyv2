'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Mic, Camera, RotateCcw, Download, Check, X,
  CalendarDays, FileScan,
} from 'lucide-react';

import type {
  ConvMessage, HouseData, ApiResponse,
  Phase, View, OutdoorWeather, LocalRecord, LastSession,
  FollowUpStep, ConfirmItem, EmotionAnalysis,
} from '@/lib/types';
import {
  APP_NAME, MAX_LISTEN_MS, BREATHING_MS,
  SK_RECORDS, SK_SESSION, SK_DEEP_CLEANED,
  DAY_NAMES,
  GLASS, CARD_FLAT, CARD_ACCENT,
  FOLLOW_UP_QUESTIONS,
  MAX_MEDIA_PER_RECORD,
  NAV_NOISE_RE,
} from '@/lib/constants';
import { isValidTemp } from '@/lib/logic/validation';
import { calcConfidence, generateAdvice, generateStrategicAdvice, generateAdminLog } from '@/lib/logic/advice';
import { correctAgriTerms, extractChips, detectLocationOverride, calculateProfitPreview, sanitizeLocation, buildSlotsFromPending, buildSlotsFromConfirmItems, normalizeLocationName } from '@/lib/logic/extraction';
import { fetchWeather, fetchTomorrowWeather } from '@/lib/logic/weather';
import { buildConsultationSheet } from '@/lib/logic/report';
import { speak, createRecog, invalidateRecogCache, isIOS } from '@/lib/client/speech';
import {
  loadRecs, saveRecLS, markSync, getUnsynced,
  loadSession, saveSession, sanitizeRecords, deepClean,
  saveMediaBlob, loadMediaForRecord, updateMediaRecordId,
  getCalDays, saveMoodEntry,
  migrateLocations, addLocation, getLocationNames, findLocationByName,
} from '@/lib/client/storage';
import { analyzeEmotion } from '@/lib/logic/empathy';
import { pickNudge } from '@/lib/logic/empathyResponses';
import { MentorMode } from '@/components/features/MentorMode';
import { ConfirmScreen } from '@/components/features/ConfirmScreen';
import { HistoryView } from '@/components/features/HistoryView';
import { CelebrationOverlay } from '@/components/features/CelebrationOverlay';
import { FollowUpBar } from '@/components/features/FollowUpBar';
import { TabBar } from '@/components/features/TabBar';
import { EmpathyCard } from '@/components/features/EmpathyCard';

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */
export default function AgriBuddy() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [view, setView] = useState<View>('record');
  const [outdoor, setOutdoor] = useState<OutdoorWeather | null>(null);
  const [conv, setConv] = useState<ConvMessage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [todayHouse, setTodayHouse] = useState<HouseData | null>(null);
  const [todayAdvice, setTodayAdvice] = useState('');
  const [todayLog, setTodayLog] = useState('');
  const [bump, setBump] = useState<string[] | null>(null);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high' | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendSync, setPendSync] = useState(0);
  const [lastSess, setLastSess] = useState<LastSession | null>(null);
  const [curLoc, setCurLoc] = useState('');
  const [photoCount, setPhotoCount] = useState(0);

  // Dynamic location master
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [isNewLocation, setIsNewLocation] = useState(false);

  // HTTPS誘導
  const [httpsRedirectUrl, setHttpsRedirectUrl] = useState<string | null>(null);

  // Calendar
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calDate, setCalDate] = useState<string | null>(null);
  const [histVer, setHistVer] = useState(0);

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportType, setReportType] = useState<'month' | 'half'>('month');
  const [reportFullscreen, setReportFullscreen] = useState(false);

  // Follow-up state machine
  const [followUpInfo, setFollowUpInfo] = useState<{ label: string; current: number; total: number } | null>(null);

  // Confirm screen state
  const [confirmItems, setConfirmItems] = useState<ConfirmItem[]>([]);

  // Save-time Gemini wait
  const [saving, setSaving] = useState(false);

  // Voice correction on CONFIRM screen
  const [correctionListening, setCorrectionListening] = useState(false);
  const [correctionTranscript, setCorrectionTranscript] = useState('');

  // Mentor mode
  const [mentorDraft, setMentorDraft] = useState('');
  const [mentorCopied, setMentorCopied] = useState(false);
  const [mentorStep, setMentorStep] = useState<'comfort' | 'ask' | 'sheet'>('comfort');
  const [consultSheet, setConsultSheet] = useState('');

  // Profit preview
  const [profitPreview, setProfitPreview] = useState<{ total: number; details: string[]; message: string; praise: string; marketTip: string } | null>(null);

  // Media
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: string }[]>([]);
  const [pendingMediaId] = useState(() => `pending-${Date.now()}`);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: string }[]>([]);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // Fullscreen media viewer
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string; type: string} | null>(null);

  // Celebration
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProfit, setCelebrationProfit] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);
  const chunksRef = useRef('');
  const convRef = useRef<ConvMessage[]>([]);
  const silRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ptrRef = useRef(0);
  const lpRef = useRef(false);
  const sasRef = useRef<() => void>(() => {});
  const locRef = useRef('');
  const photoRef = useRef<HTMLInputElement>(null);
  const photoTriggeredRef = useRef(false);
  const photoWaitingRef = useRef(false);

  // Raw transcript accumulation
  const rawTranscriptRef = useRef<string[]>([]);

  // Follow-up refs
  const followUpActiveRef = useRef(false);
  const followUpIndexRef = useRef(0);
  const followUpQueueRef = useRef<FollowUpStep[]>([]);
  const isFirstQuestionRef = useRef(false);
  const sosDetectedRef = useRef(false);
  const tier2DetectedRef = useRef<EmotionAnalysis | null>(null);
  const normalEmotionRef = useRef<EmotionAnalysis | null>(null);
  const [empathyCard, setEmpathyCard] = useState<EmotionAnalysis | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingDataRef = useRef<Record<string, any>>({});
  const advanceFollowUpRef = useRef<() => void>(() => {});
  const emptyRetryRef = useRef(0);
  // Persistent SpeechRecognition refs (iOS Safari mic banner suppression)
  const resultOffsetRef = useRef(0);        // onresultでの読み取り開始位置
  const mutedRef = useRef(false);           // TTS中にtrue→結果無視+オフセット前進
  const persistentRecogRef = useRef(false); // follow-up中のpersistentモードフラグ
  const userStoppedRef = useRef(false);      // ユーザーが明示的に停止したか
  const textPrefixRef = useRef('');           // 自動再起動時のテキスト蓄積用

  const phaseRef = useRef<Phase>('IDLE');

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { convRef.current = conv; }, [conv]);
  useEffect(() => { locRef.current = curLoc; }, [curLoc]);

  const liveChips = useMemo(() => extractChips(transcript), [transcript]);

  const calDays = useMemo(() => getCalDays(calMonth.getFullYear(), calMonth.getMonth()), [calMonth]);
  const recordMap = useMemo(() => {
    if (!mounted) return new Map<string, LocalRecord>();
    void histVer;
    const m = new Map<string, LocalRecord>();
    loadRecs().forEach(r => { if (!m.has(r.date) || r.timestamp > m.get(r.date)!.timestamp) m.set(r.date, r); });
    return m;
  }, [mounted, histVer]);

  const calSelected = useMemo(() => calDate ? recordMap.get(calDate) ?? null : null, [calDate, recordMap]);

  /* ── Load media for selected record ── */
  useEffect(() => {
    if (!calSelected) { setSelectedMedia([]); return; }
    let cancelled = false;
    loadMediaForRecord(calSelected.id).then(items => {
      if (cancelled) return;
      setSelectedMedia(items.map(m => ({ url: URL.createObjectURL(m.blob), type: m.type })));
    }).catch(() => { if (!cancelled) setSelectedMedia([]); });
    return () => { cancelled = true; selectedMedia.forEach(m => URL.revokeObjectURL(m.url)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calSelected?.id]);

  const weeklyCount = useMemo(() => {
    if (!mounted) return 0;
    void histVer;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return loadRecs().filter(r => new Date(r.date) >= weekAgo).length;
  }, [mounted, histVer]);

  /* ── Streak: consecutive days ending with today ── */
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

  /* ── Trend: last 14 days temp data for chart ── */
  const trendData = useMemo(() => {
    if (!mounted) return [];
    const data: { date: string; max_temp: number | null; min_temp: number | null }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const rec = recordMap.get(iso);
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

  const isActivePhase = phase === 'LISTENING' || phase === 'REVIEWING' || phase === 'THINKING' || phase === 'FOLLOW_UP' || phase === 'BREATHING' || phase === 'CONFIRM' || phase === 'MENTOR';

  /* ── Streak color ── */
  const streakColor = streak >= 30
    ? 'text-red-600 bg-red-50' : streak >= 14
    ? 'text-orange-600 bg-orange-50' : streak >= 7
    ? 'text-amber-600 bg-amber-50' : streak >= 3
    ? 'text-amber-500 bg-amber-50/60' : 'text-stone-400 bg-stone-100/60';

  /* ── Init ── */
  useEffect(() => {
    setMounted(true);
    sanitizeRecords();
    deepClean();
    migrateLocations();
    setLocationOptions(getLocationNames());
    fetchWeather().then(setOutdoor);
    setIsOnline(navigator.onLine);
    setPendSync(getUnsynced().length);
    // HTTPS誘導: 非localhostかつ非secureの場合、HTTPS URLを案内
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setHttpsRedirectUrl(`https://${location.hostname}:3001${location.pathname}`);
    }
    const prev = loadSession();
    if (prev) {
      prev.location = sanitizeLocation(prev.location);
      setLastSess(prev); setCurLoc(prev.location || '');
    }
    const on = () => { setIsOnline(true); syncRecs(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncRecs = useCallback(() => {
    const u = getUnsynced(); if (u.length === 0) return;
    u.forEach(r => markSync(r.id)); setPendSync(0);
  }, []);

  useEffect(() => { if (isOnline && mounted) syncRecs(); }, [isOnline, mounted, syncRecs]);

  const clr = useCallback(() => {
    if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
    if (maxRef.current) { clearTimeout(maxRef.current); maxRef.current = null; }
  }, []);

  useEffect(() => () => { persistentRecogRef.current = false; try { recogRef.current?.stop(); } catch {} recogRef.current = null; invalidateRecogCache(); clr(); window.speechSynthesis?.cancel(); }, [clr]);

  /* ── Build confirm items ── */
  const buildConfirmItems = useCallback((): ConfirmItem[] => {
    const d = pendingDataRef.current;
    const items: ConfirmItem[] = [];

    // 場所（常に表示、空なら「場所未定」）
    const loc = normalizeLocationName(locRef.current) || locRef.current;
    items.push({ key: 'location', label: '場所', value: loc || '場所未定' });

    if (d.ocr_date) items.push({ key: 'ocr_date', label: '日付', value: d.ocr_date });
    items.push({ key: 'work_log', label: '作業内容', value: d.work_log || '' });
    const hd = d.house_data as HouseData | null | undefined;
    items.push({ key: 'max_temp', label: '最高気温', value: hd?.max_temp != null ? `${hd.max_temp}℃` : '' });
    items.push({ key: 'min_temp', label: '最低気温', value: hd?.min_temp != null ? `${hd.min_temp}℃` : '' });
    items.push({ key: 'humidity', label: '湿度', value: hd?.humidity != null ? `${hd.humidity}%` : '' });
    items.push({ key: 'fertilizer', label: '肥料', value: d.fertilizer || '' });
    items.push({ key: 'pest_status', label: '病害虫', value: d.pest_status || '' });
    items.push({ key: 'harvest_amount', label: '収穫', value: d.harvest_amount || '' });
    items.push({ key: 'material_cost', label: '資材費', value: d.material_cost || '' });
    items.push({ key: 'fuel_cost', label: '燃料費', value: d.fuel_cost || '' });
    items.push({ key: 'work_duration', label: '作業時間', value: d.work_duration || '' });
    if (d.plant_status && d.plant_status !== '良好') items.push({ key: 'plant_status', label: '所見', value: d.plant_status });

    // 末尾: 日誌テキスト (admin_log)
    const slots = buildSlotsFromPending(d);
    const adminText = d.admin_log || generateAdminLog(slots, loc);
    items.push({ key: 'admin_log', label: '日誌テキスト', value: adminText });

    return items;
  }, []);

  /* ── Show Confirm Screen ── */
  const showConfirmScreen = useCallback(() => {
    try {
      persistentRecogRef.current = false;
      mutedRef.current = false;
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
      chunksRef.current = '';
      followUpActiveRef.current = false;
      followUpIndexRef.current = 0;
      followUpQueueRef.current = [];
      setFollowUpInfo(null);

      // Inject raw_transcript
      if (rawTranscriptRef.current.length > 0) {
        pendingDataRef.current.raw_transcript = rawTranscriptRef.current.join(' / ');
      }

      const items = buildConfirmItems();

      // 空チェック強化: admin_log/raw_transcriptのみで実データなしの場合もIDLEへ
      const hasRealData = items.some(it =>
        it.key !== 'admin_log' && it.key !== 'raw_transcript' && it.value
      );
      if (items.length === 0 || !hasRealData) {
        setPhase('IDLE');
        speak('きろくするデータがありませんでした。もういちどはじめてください。');
        return;
      }

      setConfirmItems(items);
      setPhase('CONFIRM');

      const dur = pendingDataRef.current.work_duration;
      if (dur) {
        const hm = dur.match(/(\d+)/);
        if (hm && parseInt(hm[1]) >= 4) {
          speak('ながい作業、おつかれさま。むりは禁物。15分やすみませんか？');
        }
      }
    } catch (err) {
      console.error('showConfirmScreen error:', err);
      setPhase('IDLE');
      speak('エラーが発生しました。もういちどはじめてください。');
    }
  }, [buildConfirmItems]);

  /* ── OCR Handler ── */
  const handleOcr = useCallback(async (file: File) => {
    // 完全データ初期化（前回の音声セッション残留を防止）
    persistentRecogRef.current = false; mutedRef.current = false;
    const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    clr(); window.speechSynthesis?.cancel();
    rawTranscriptRef.current = [];
    chunksRef.current = '';
    pendingDataRef.current = {};
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    setFollowUpInfo(null);
    setConv([]); setTranscript('');

    setOcrLoading(true);
    setPhase('THINKING');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) {
        setAiReply(data.error);
        setPhase('IDLE');
        setOcrLoading(false);
        return;
      }
      const slots = data.slots || {};
      pendingDataRef.current = {};
      if (slots.work_log) pendingDataRef.current.work_log = slots.work_log;
      if (slots.fertilizer) pendingDataRef.current.fertilizer = slots.fertilizer;
      if (slots.material_cost) pendingDataRef.current.material_cost = slots.material_cost;
      if (slots.harvest_amount) pendingDataRef.current.harvest_amount = slots.harvest_amount;
      if (slots.work_duration) pendingDataRef.current.work_duration = slots.work_duration;
      if (slots.date) pendingDataRef.current.ocr_date = slots.date;
      if (data.raw_text) {
        setAiReply(`読み取り結果: ${data.raw_text}`);
        setTranscript('');
      }
      const hasAnyData = Object.values(pendingDataRef.current).some(v => v !== undefined && v !== null && v !== '');
      if (!hasAnyData && data.raw_text && data.raw_text.trim()) {
        pendingDataRef.current.work_log = data.raw_text.trim();
      }
      const finalCheck = Object.values(pendingDataRef.current).some(v => v !== undefined && v !== null && v !== '');
      if (!finalCheck) {
        const msg = '読み取れるデータがありませんでした。もう一度試してください。';
        setAiReply(msg);
        setPhase('IDLE');
        speak(msg);
        setOcrLoading(false);
        return;
      }
      showConfirmScreen();
    } catch {
      setAiReply('OCR処理に失敗しました。');
      setPhase('IDLE');
    }
    setOcrLoading(false);
  }, [showConfirmScreen, clr]);

  /* ── AI admin_log fetch + debounced regeneration ── */
  const adminLogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminLogFetchingRef = useRef(false);

  const fetchAdminLogFromAI = useCallback(async (items: ConfirmItem[]): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.filter(i =>
            i.key !== 'admin_log' && i.key !== 'raw_transcript'
            && i.value && i.value.trim() && i.value !== '場所未定'
          ),
        }),
      });
      const data = await res.json();
      return data.admin_log || null;
    } catch {
      return null;
    }
  }, []);

  const regenerateAdminLogWithAI = useCallback(async (items: ConfirmItem[]) => {
    adminLogFetchingRef.current = true;
    try {
      const adminLog = await fetchAdminLogFromAI(items);
      if (adminLog) {
        setConfirmItems(prev => prev.map(it => it.key === 'admin_log' ? { ...it, value: adminLog } : it));
      }
    } finally {
      adminLogFetchingRef.current = false;
    }
  }, [fetchAdminLogFromAI]);

  // CONFIRM進入時にGemini admin_log自動生成（編集なしでもGemini版を保証）
  useEffect(() => {
    if (phase === 'CONFIRM' && confirmItems.length > 0 && !adminLogFetchingRef.current) {
      regenerateAdminLogWithAI(confirmItems);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ── Save from Confirm Screen ── */
  const saveFromConfirm = useCallback(async () => {
    persistentRecogRef.current = false; mutedRef.current = false;
    const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    invalidateRecogCache();
    clr();
    window.speechSynthesis?.cancel();
    // debounce待機中 OR fetch in-flight中のいずれかで待機
    const needsAdminLogSync = !!adminLogDebounceRef.current || adminLogFetchingRef.current;
    if (adminLogDebounceRef.current) { clearTimeout(adminLogDebounceRef.current); adminLogDebounceRef.current = null; }
    const d = pendingDataRef.current;

    for (const item of confirmItems) {
      const raw = item.value;
      switch (item.key) {
        case 'work_log': d.work_log = raw; break;
        case 'max_temp': {
          const n = parseFloat(raw);
          if (!isNaN(n)) {
            if (!d.house_data) d.house_data = { max_temp: null, min_temp: null, humidity: null };
            d.house_data.max_temp = n;
          }
          break;
        }
        case 'min_temp': {
          const n = parseFloat(raw);
          if (!isNaN(n)) {
            if (!d.house_data) d.house_data = { max_temp: null, min_temp: null, humidity: null };
            d.house_data.min_temp = n;
          }
          break;
        }
        case 'humidity': {
          const n = parseFloat(raw);
          if (!isNaN(n)) {
            if (!d.house_data) d.house_data = { max_temp: null, min_temp: null, humidity: null };
            d.house_data.humidity = n;
          }
          break;
        }
        case 'fertilizer': d.fertilizer = raw; break;
        case 'pest_status': d.pest_status = raw; break;
        case 'harvest_amount': d.harvest_amount = raw; break;
        case 'material_cost': d.material_cost = raw; break;
        case 'fuel_cost': d.fuel_cost = raw; break;
        case 'work_duration': d.work_duration = raw; break;
        case 'plant_status': d.plant_status = raw; break;
        case 'ocr_date': d.ocr_date = raw; break;
        case 'raw_transcript': d.raw_transcript = raw; break;
        case 'admin_log': d.admin_log = raw; break;
        case 'location': {
          const normalized = normalizeLocationName(raw) || raw;
          setCurLoc(normalized);
          if (normalized && normalized !== '場所未定') {
            addLocation(normalized, raw !== normalized ? raw : undefined);
            setLocationOptions(getLocationNames());
          }
          break;
        }
      }
    }

    const loc = locRef.current;
    const profit = calculateProfitPreview(d);

    const slots = buildSlotsFromPending(d);
    const conf = calcConfidence(slots);
    const adviceText = d.advice || generateAdvice(slots, conf);
    const strategicText = d.strategic_advice || generateStrategicAdvice(slots);

    // admin_log同期保証: debounce待機中 or fetch中なら同期的にGemini版を取得
    let adminText: string;
    if (needsAdminLogSync) {
      setSaving(true);
      const aiLog = await fetchAdminLogFromAI(confirmItems);
      adminText = aiLog
        || confirmItems.find(it => it.key === 'admin_log')?.value
        || generateAdminLog(slots, loc);
      setSaving(false);
    } else {
      const confirmAdminLog = confirmItems.find(it => it.key === 'admin_log')?.value;
      adminText = confirmAdminLog || d.admin_log || generateAdminLog(slots, loc);
    }

    const locMaster = findLocationByName(loc);
    const rec: LocalRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: pendingDataRef.current.ocr_date || new Date().toISOString().split('T')[0], location: loc,
      house_data: d.house_data || null, work_log: d.work_log || '',
      plant_status: d.plant_status || '良好', advice: adviceText,
      admin_log: adminText, fertilizer: d.fertilizer || '',
      pest_status: d.pest_status || '', harvest_amount: d.harvest_amount || '',
      material_cost: d.material_cost || '', work_duration: d.work_duration || '',
      fuel_cost: d.fuel_cost || '', strategic_advice: strategicText,
      photo_count: photoCount, estimated_profit: profit.total,
      raw_transcript: d.raw_transcript || undefined,
      location_id: locMaster?.id,
      synced: false, timestamp: Date.now(),
    };
    saveRecLS(rec); setPendSync(p => p + 1);
    saveSession({ location: loc, work: d.work_log || '', date: rec.date });
    updateMediaRecordId(pendingMediaId, rec.id).catch(() => {});
    setHistVer(v => v + 1);
    setPhotoCount(0);
    setConfirmItems([]);
    setIsNewLocation(false);
    mediaPreview.forEach(m => URL.revokeObjectURL(m.url));
    setMediaPreview([]);

    setConv([]);
    setTranscript('');
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    photoWaitingRef.current = false;
    rawTranscriptRef.current = [];
    setFollowUpInfo(null);
    setBump(null);
    setConfidence(null);

    if (sosDetectedRef.current) {
      sosDetectedRef.current = false;
      setShowCelebration(false);
      setPhase('MENTOR');
      setMentorCopied(false);
      setMentorStep('comfort');
      setMentorDraft('');
      const speakP = speak('きもち、うけとめました。ひとりでかかえこまないで。');
      fetchTomorrowWeather().then(weather => {
        setConsultSheet(buildConsultationSheet('', weather));
        speakP.then(async () => {
          if (weather) {
            const hint = weather.maxTemp >= 30
              ? 'あさの涼しいうちだけ作業。ごごはやすむ。'
              : weather.maxTemp <= 10
                ? 'さむいので、むりしないで。'
                : 'てんきにあわせて、むりなく。';
            await speak(`あしたは${weather.description}、${weather.maxTemp}度。${hint}`);
          }
          setMentorStep('ask');
        });
      });
      if (navigator.onLine) setTimeout(syncRecs, 500);
      return;
    }

    // ── Tier 2: EmpathyCard (post-save, suppress celebration) ──
    if (tier2DetectedRef.current && tier2DetectedRef.current.tier >= 2) {
      const empEmotion = tier2DetectedRef.current;
      tier2DetectedRef.current = null;
      saveMoodEntry(empEmotion, outdoor);
      setEmpathyCard(empEmotion);
      setShowCelebration(false);
      setProfitPreview(null);
      const msg = 'きょうもおつかれさま。';
      setAiReply(msg); setPhase('IDLE'); setView('history');
      speak(msg);
      if (navigator.onLine) setTimeout(syncRecs, 500);
      return;
    }

    setCelebrationProfit(profit.total);
    setShowCelebration(true);
    setTimeout(() => setShowCelebration(false), 5000);

    if (profit.total > 0) {
      const yen = profit.total >= 10000 ? `${(profit.total / 10000).toFixed(1)}万円` : `${profit.total.toLocaleString()}円`;
      const profitMsg = `きょうの見込み増益: 推定${yen}`;
      setProfitPreview({ total: profit.total, details: profit.details, message: profitMsg, praise: profit.praise, marketTip: profit.marketTip });
      const fullMsg = `${profit.praise} ${profitMsg}。`;
      setAiReply(fullMsg); setPhase('IDLE');
      setView('history');
      speak(fullMsg);
    } else {
      setProfitPreview(null);
      const msg = 'きょうもおつかれさま！記録を保存しました。';
      setAiReply(msg); setPhase('IDLE');
      setView('history');
      speak(msg);
    }
    if (navigator.onLine) setTimeout(syncRecs, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmItems, photoCount, syncRecs, pendingMediaId, clr, fetchAdminLogFromAI]);

  /* ── Update confirm item ── */
  const updateConfirmItem = useCallback((key: string, val: string) => {
    setConfirmItems(prev => {
      const updated = prev.map(it => it.key === key ? { ...it, value: val } : it);
      // admin_log直接編集: デバウンスキャンセル（ユーザーの手動上書きを尊重）
      if (key === 'admin_log') {
        if (adminLogDebounceRef.current) { clearTimeout(adminLogDebounceRef.current); adminLogDebounceRef.current = null; }
        return updated;
      }
      if (key === 'raw_transcript') return updated;
      // スロットまたはlocation編集時: 即座にローカル版で仮更新
      const loc = updated.find(it => it.key === 'location')?.value || '';
      const slots = buildSlotsFromConfirmItems(updated);
      const newLog = generateAdminLog(slots, loc === '場所未定' ? '' : loc);
      const withLocalLog = updated.map(it => it.key === 'admin_log' ? { ...it, value: newLog } : it);
      // 1.5秒デバウンスでGemini品質版に差し替え
      if (adminLogDebounceRef.current) clearTimeout(adminLogDebounceRef.current);
      adminLogDebounceRef.current = setTimeout(() => { regenerateAdminLogWithAI(withLocalLog); }, 1500);
      return withLocalLog;
    });
  }, [regenerateAdminLogWithAI]);

  /* ── Voice Correction on CONFIRM ── */
  const handleVoiceCorrection = useCallback(async (text: string) => {
    try {
      setCorrectionTranscript('修正を解析中...');
      const res = await fetch('/api/voice-correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, currentItems: confirmItems }),
      });
      const data = await res.json();
      if (data.corrections && data.corrections.length > 0) {
        for (const c of data.corrections) updateConfirmItem(c.key, c.value);
        setCorrectionTranscript('');
        speak('修正しました。');
        return;
      }
      // Gemini成功だが修正候補なし
      setCorrectionTranscript('');
      speak('どの項目を変更するか分かりませんでした。もう一度お試しください。');
    } catch {
      setCorrectionTranscript('');
      speak('修正の解析に失敗しました。直接タップして編集してください。');
    }
  }, [updateConfirmItem, confirmItems]);

  const startVoiceCorrection = useCallback(() => {
    setCorrectionTranscript('');
    setCorrectionListening(true);
    try {
      const r = createRecog();
      if (!r) { setCorrectionListening(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        t = correctAgriTerms(t);
        setCorrectionTranscript(t);
      };
      r.onerror = () => {};
      r.onend = () => {
        setCorrectionListening(false);
        const text = (r as unknown as { _lastText?: string })._lastText || '';
        // Need to capture final text from state — use a small trick
        // Actually, use the transcript we accumulated
      };
      // Wrap onresult to also capture for onend
      const origOnResult = r.onresult;
      let finalText = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (origOnResult as any)?.(e);
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        finalText = correctAgriTerms(t);
      };
      r.onend = () => {
        setCorrectionListening(false);
        if (finalText.trim()) handleVoiceCorrection(finalText.trim());
      };
      r.start();
      setTimeout(() => { try { r.stop(); } catch {} }, MAX_LISTEN_MS);
    } catch {
      setCorrectionListening(false);
    }
  }, [handleVoiceCorrection]);

  /* ── Start Listening ── */
  const startListen = useCallback(() => {
    // Persistent mode fast path: recogインスタンス再利用（iOS Safariバナー回避）
    if (persistentRecogRef.current && recogRef.current) {
      mutedRef.current = false;
      chunksRef.current = '';
      setPhase('LISTENING');
      setTranscript('');
      clr();
      maxRef.current = setTimeout(() => { sasRef.current(); }, MAX_LISTEN_MS);
      return;
    }

    if (recogRef.current) return; // 二重起動防止
    userStoppedRef.current = false;
    textPrefixRef.current = '';
    try {
      const r = createRecog();
      if (!r) {
        setTranscript('音声認識を利用できません（HTTPS接続が必要です）');
        return;
      }
      chunksRef.current = ''; let spoke = false;
      photoTriggeredRef.current = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        // ミュート中: オフセットを進めて結果を無視（TTS中のエコー防止）
        if (mutedRef.current) {
          resultOffsetRef.current = e.results.length;
          return;
        }
        let t = '';
        for (let i = resultOffsetRef.current; i < e.results.length; i++) t += e.results[i][0].transcript;
        t = correctAgriTerms(t);
        chunksRef.current = textPrefixRef.current + t; setTranscript(textPrefixRef.current + t); spoke = true;
      };
      r.onerror = (e: any) => {
        if (e.error === 'not-allowed') {
          setTranscript('マイクの使用を許可してください');
        }
      };
      r.onend = () => {
        if (!recogRef.current) return;
        clr();

        // Persistent mode: iOSがrecogを殺した場合、サイレント再起動（バナー1回追加、既存の8回より大幅改善）
        if (persistentRecogRef.current) {
          recogRef.current = null;
          setTimeout(() => {
            if (!persistentRecogRef.current || recogRef.current) return;
            try {
              const r2 = createRecog(); if (!r2) return;
              resultOffsetRef.current = 0;
              r2.onresult = r.onresult;
              r2.onerror = (e: any) => {
                if (e.error === 'not-allowed') {
                  setTranscript('マイクの使用を許可してください');
                }
              };
              r2.onend = r.onend;
              r2.start();
              recogRef.current = r2;
            } catch {
              recogRef.current = null;
              persistentRecogRef.current = false;
              setTranscript('マイクの再起動に失敗しました');
            }
          }, 300);
          return;
        }

        recogRef.current = null;

        // follow-up中: 既存動作を維持
        if (followUpActiveRef.current) {
          if (spoke) sasRef.current();
          else setPhase('FOLLOW_UP');
          return;
        }

        // 通常モード: ユーザー停止でなければ自動再起動
        if (!userStoppedRef.current) {
          textPrefixRef.current = chunksRef.current;
          setTimeout(() => {
            if (userStoppedRef.current || recogRef.current) return;
            try {
              const r2 = createRecog(); if (!r2) return;
              resultOffsetRef.current = 0;
              r2.onresult = r.onresult;
              r2.onerror = r.onerror;
              r2.onend = r.onend;
              r2.start();
              recogRef.current = r2;
            } catch {
              recogRef.current = null;
              if (spoke) setPhase('REVIEWING');
            }
          }, 300);
          return;
        }

        // ユーザーが明示的に停止
        clr();
        if (spoke) { setPhase('REVIEWING'); }
        else { setPhase('IDLE'); }
      };
      resultOffsetRef.current = 0;
      // Singleton: 同一インスタンスで stop→再start（新規生成しない）
      try {
        r.start();
      } catch {
        try { r.stop(); } catch {}
        try {
          r.start();
        } catch {
          throw new Error('SR start failed');
        }
      }
      recogRef.current = r; setPhase('LISTENING'); setTranscript('');
      maxRef.current = setTimeout(() => {
        if (persistentRecogRef.current) {
          sasRef.current(); // recog停止せずに処理
        } else {
          try { recogRef.current?.stop(); } catch {}
        }
      }, MAX_LISTEN_MS);
    } catch {
      recogRef.current = null;
      invalidateRecogCache();
      setTranscript('もう一度お願いします');
      if (followUpActiveRef.current) {
        setPhase('FOLLOW_UP');
      }
      // 非follow-up: 現在のphaseに留まる。ユーザーがマイクタップで再試行
    }
  }, [clr]);

  /* ── Confirm transcript (REVIEWING → process) ── */
  const confirmTranscript = useCallback(() => {
    sasRef.current();
  }, []);

  /* ── Retry listening (REVIEWING → re-record) ── */
  const retryListen = useCallback(() => {
    chunksRef.current = '';
    setTranscript('');
    startListen();
  }, [startListen]);

  /* ── Advance Follow-Up ── */
  const advanceFollowUp = useCallback(() => {
    // iOS安定化: 質問遷移前にrecogを確実に停止
    if (!persistentRecogRef.current) {
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    }
    const queue = followUpQueueRef.current;

    while (followUpIndexRef.current < queue.length) {
      const step = queue[followUpIndexRef.current];
      const d = pendingDataRef.current;
      const filled =
        (step === 'WORK' && d.work_log) ||
        (step === 'HOUSE_TEMP' && d.house_data) ||
        (step === 'FERTILIZER' && d.fertilizer) ||
        (step === 'PEST' && d.pest_status) ||
        (step === 'HARVEST' && d.harvest_amount) ||
        (step === 'COST' && (d.material_cost || d.fuel_cost)) ||
        (step === 'DURATION' && d.work_duration);
      if (filled) {
        followUpIndexRef.current++;
      } else {
        break;
      }
    }

    if (followUpIndexRef.current >= queue.length) {
      // 全問完了: persistent recog停止
      persistentRecogRef.current = false;
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
      setFollowUpInfo({ label: '完了', current: queue.length, total: queue.length });
      setPhase('FOLLOW_UP');
      let transitioned = false;
      const doTransition = () => {
        if (transitioned) return;
        transitioned = true;
        showConfirmScreen();
      };
      speak('バッチリです！今日の記録を保存しますね！').then(() => setTimeout(doTransition, 500));
      setTimeout(doTransition, 3000); // safety fallback
      return;
    }
    const step = queue[followUpIndexRef.current];

    emptyRetryRef.current = 0; // 新しい質問ごとにリトライカウンタをリセット

    // PHOTO step: persistent recog停止（音声入力不要）
    if (step === 'PHOTO') {
      persistentRecogRef.current = false;
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    }

    const questions = FOLLOW_UP_QUESTIONS[step];
    const question = questions[Math.floor(Math.random() * questions.length)];
    setFollowUpInfo({ label: questions[0], current: followUpIndexRef.current + 1, total: queue.length });

    setTranscript('');
    chunksRef.current = '';

    if (isFirstQuestionRef.current) {
      isFirstQuestionRef.current = false;
      setPhase('FOLLOW_UP');
      if (step !== 'PHOTO') {
        // 非iOS: persistent muted recog並行起動（バナー抑制）
        // iOS: TTS完了までrecog起動しない（audio session排他）
        if (!isIOS) {
          persistentRecogRef.current = true;
          mutedRef.current = true;
        }
      }
      // 最初の質問（ナラティブ「今日のこと〜」直後なので挨拶不要）
      const ttsP = speak(question);
      if (step !== 'PHOTO') {
        if (!isIOS) setTimeout(() => { if (followUpActiveRef.current && !recogRef.current) startListen(); }, 100);
        ttsP.then(() => {
          if (!followUpActiveRef.current) return;
          mutedRef.current = false;  // TTS完了→明示的unmute（recog死亡時の保険）
          startListen();
        });
      }
    } else {
      const breathMs = BREATHING_MS;
      setPhase('BREATHING');
      mutedRef.current = true; // BREATHING+TTS中はミュート（persistent recog用。iOSではrecog無いので無影響）
      setTimeout(() => {
        if (!followUpActiveRef.current) return;
        setTranscript('');
        chunksRef.current = '';
        setPhase('FOLLOW_UP');
        const ttsP = speak(question);
        if (step !== 'PHOTO') {
          ttsP.then(() => {
            if (!followUpActiveRef.current) return;
            mutedRef.current = false;
            startListen();
          });
        }
      }, breathMs);
    }
  }, [startListen, showConfirmScreen]);

  useEffect(() => { advanceFollowUpRef.current = advanceFollowUp; }, [advanceFollowUp]);

  /* ── Fallback queue builder (Gemini missing_questions absent) ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildFallbackQueue = (d: Record<string, any>): FollowUpStep[] => {
    const q: FollowUpStep[] = [];
    if (!d.work_log) q.push('WORK');
    if (!d.house_data) q.push('HOUSE_TEMP');
    if (!d.fertilizer) q.push('FERTILIZER');
    if (!d.pest_status) q.push('PEST');
    if (!d.harvest_amount) q.push('HARVEST');
    if (!d.material_cost && !d.fuel_cost) q.push('COST');
    if (!d.work_duration) q.push('DURATION');
    return q;
  };

  /* ── Stop & Send ── */
  const stopAndSend = useCallback(async () => {
    // CONFIRM/MENTOR中はIDLE遷移を完全ブロック（iOS Safari自発onend対策）
    if (phaseRef.current === 'CONFIRM' || phaseRef.current === 'MENTOR') return;
    // CONFIRM画面表示済みなら何もしない（iOS同期onendからのstale再呼出防止）
    if (!followUpActiveRef.current && !recogRef.current && chunksRef.current.trim() === '') return;

    if (persistentRecogRef.current && followUpActiveRef.current && recogRef.current) {
      mutedRef.current = true;  // 次の質問のTTSまで結果を無視
      clr();
    } else {
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
      clr();
    }
    const text = chunksRef.current.trim();

    // ── Follow-up mode ──
    if (followUpActiveRef.current) {
      const emotion = analyzeEmotion(text);
      if (emotion.tier >= 3) {
        sosDetectedRef.current = true;
      } else if (emotion.tier >= 2) {
        tier2DetectedRef.current = emotion;
      } else if (emotion.tier === 1 && emotion.primaryCategory) {
        const nudge = pickNudge(emotion.primaryCategory);
        if (nudge) speak(nudge);
      }

      // Accumulate raw transcript (original)
      if (text) rawTranscriptRef.current.push(text);

      const step = followUpQueueRef.current[followUpIndexRef.current];
      // ナビゲーション発言をノイズとして除去してからデータ処理
      const cleaned = text
        .replace(NAV_NOISE_RE, '')
        .replace(/写真[を]?撮って|カメラ[を]?起動|撮影して|撮るよ/g, '')
        .replace(/\s{2,}/g, ' ').trim();
      const isSkip = !cleaned;

      if (!isSkip && cleaned.length > 0 && cleaned.length <= 2 && (step === 'FERTILIZER' || step === 'PEST')) {
        setTranscript('もう一度お願いします');
        setPhase('FOLLOW_UP');
        return;
      }

      if (step === 'PHOTO') {
        if (isSkip) {
          setTranscript('');
          followUpIndexRef.current++;
          advanceFollowUpRef.current();
          return;
        }
        photoWaitingRef.current = true;
        setTranscript('');
        return;
      }

      if (!isSkip && step) {
        switch (step) {
          case 'WORK': pendingDataRef.current.work_log = cleaned; break;
          case 'HOUSE_TEMP': {
            const tempMatch = cleaned.match(/(\d+)\s*[度℃]/g);
            if (tempMatch) {
              const nums = tempMatch.map(t => parseInt(t.replace(/[^\d]/g, ''))).filter(isValidTemp);
              if (nums.length >= 2) {
                pendingDataRef.current.house_data = { max_temp: Math.max(...nums), min_temp: Math.min(...nums), humidity: null };
              } else if (nums.length === 1) {
                pendingDataRef.current.house_data = { max_temp: nums[0], min_temp: null, humidity: null };
              }
            } else {
              const m = cleaned.match(/(\d+)/);
              const bare = m ? parseInt(m[1], 10) : NaN;
              if (!isNaN(bare) && isValidTemp(bare)) {
                pendingDataRef.current.house_data = { max_temp: bare, min_temp: null, humidity: null };
              }
            }
            break;
          }
          case 'FERTILIZER': pendingDataRef.current.fertilizer = cleaned; break;
          case 'PEST': pendingDataRef.current.pest_status = cleaned; break;
          case 'HARVEST': pendingDataRef.current.harvest_amount = cleaned; break;
          case 'COST': pendingDataRef.current.material_cost = cleaned; break;
          case 'DURATION': pendingDataRef.current.work_duration = cleaned; break;
        }
      }

      if (!isSkip) {
        // 有効な入力があればリトライカウンタをリセット
        emptyRetryRef.current = 0;
        setTranscript('');
        followUpIndexRef.current++;
        advanceFollowUpRef.current();
      } else {
        setTranscript('');
        setPhase('FOLLOW_UP');
      }
      return;
    }

    // ── Normal mode ──
    if (!text) { setPhase('IDLE'); return; }

    // Accumulate raw transcript (original), then strip nav noise for processing
    rawTranscriptRef.current.push(text);
    const textClean = text.replace(NAV_NOISE_RE, '').replace(/\s{2,}/g, ' ').trim();
    if (!textClean) { setPhase('IDLE'); return; }

    // ── Emotion Detection ──
    const emotion = analyzeEmotion(text);
    if (emotion.tier >= 3) {
      setPhase('MENTOR');
      setMentorCopied(false);
      setMentorStep('comfort');
      setMentorDraft(text);
      const speakP = speak('きもち、うけとめました。ひとりでかかえこまないで。');
      const weather = await fetchTomorrowWeather();
      setConsultSheet(buildConsultationSheet(text, weather));
      await speakP;
      if (weather) {
        const hint = weather.maxTemp >= 30
          ? 'あさの涼しいうちだけ作業。ごごはやすむ。'
          : weather.maxTemp <= 10
            ? 'さむいので、むりしないで。'
            : 'てんきにあわせて、むりなく。';
        await speak(`あしたは${weather.description}、${weather.maxTemp}度。${hint}`);
      }
      setMentorStep('ask');
      return;
    }
    if (emotion.tier >= 2) tier2DetectedRef.current = emotion;
    normalEmotionRef.current = emotion;

    const rawLocOvr = detectLocationOverride(text, locRef.current);
    const locOvr = rawLocOvr ? normalizeLocationName(rawLocOvr) : null;
    if (locOvr) setCurLoc(locOvr);

    const msg: ConvMessage = { role: 'user', text };
    const uc = [...convRef.current, msg];
    setConv(uc); setPhase('THINKING'); setTranscript('');

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: uc, location: locOvr || locRef.current, outdoor, knownLocations: getLocationNames() }),
      });
      const d: ApiResponse = await res.json();
      if (d.error) { setAiReply(d.error); setPhase('IDLE'); return; }

      if (d.mentor_mode) {
        setPhase('MENTOR');
        setMentorStep('comfort');
        setMentorDraft(text);
        setMentorCopied(false);
        const sheet = buildConsultationSheet(text);
        setConsultSheet(sheet);
        await speak(d.reply);
        setMentorStep('ask');
        return;
      }

      setConv(p => [...p, { role: 'assistant', text: d.reply }]);
      setAiReply(d.reply);
      if (d.house_data) setTodayHouse(d.house_data);
      if (d.advice) setTodayAdvice(d.advice);
      if (d.admin_log) setTodayLog(d.admin_log);
      if (d.confidence) setConfidence(d.confidence);

      // 新場所検出 → マスタに追加
      if (d.new_location) {
        const normalized = normalizeLocationName(d.new_location);
        if (normalized) {
          addLocation(normalized, d.new_location);
          setLocationOptions(getLocationNames());
          setIsNewLocation(true);
          setCurLoc(normalized);
        }
      }

      await speak(d.reply);

      // Tier 1 nudge after AI reply
      if (normalEmotionRef.current?.tier === 1 && normalEmotionRef.current.primaryCategory) {
        const nudge = pickNudge(normalEmotionRef.current.primaryCategory);
        if (nudge) await speak(nudge);
        normalEmotionRef.current = null;
      }

      try {
        pendingDataRef.current = { ...d };

        // Geminiが判定した不足フィールドを使用（フォールバック: 既存falsyチェック）
        const VALID_STEPS = new Set<FollowUpStep>(['WORK','HOUSE_TEMP','FERTILIZER','PEST','HARVEST','COST','DURATION']);
        const geminiQueue: FollowUpStep[] = Array.isArray(d.missing_questions)
          ? (d.missing_questions as string[]).filter((q): q is FollowUpStep => VALID_STEPS.has(q as FollowUpStep))
          : buildFallbackQueue(d);

        // PHOTOはmissing_questionsとは独立。不足項目があれば末尾に追加
        const queue: FollowUpStep[] = geminiQueue.length > 0
          ? [...geminiQueue, 'PHOTO']
          : [];

        if (queue.length > 0) {
          followUpActiveRef.current = true;
          followUpIndexRef.current = 0;
          followUpQueueRef.current = queue;
          isFirstQuestionRef.current = true;
          advanceFollowUpRef.current();
        } else {
          // 全項目埋まり → follow-upスキップ、CONFIRM直行
          speak('バッチリ全部入ってます！確認画面へいきますね。');
          showConfirmScreen();
        }
      } catch (err) {
        console.error('Follow-up build error:', err);
        pendingDataRef.current = { ...d };
        showConfirmScreen();
      }
    } catch {
      setAiReply('通信に失敗しました。ネットワークを確認して、もう一度話しかけてください。'); setPhase('IDLE');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clr, syncRecs, photoCount, showConfirmScreen, startListen]);

  useEffect(() => { sasRef.current = stopAndSend; }, [stopAndSend]);

  /* ── Confirm Follow-Up Step (次へ) ── */
  const confirmFollowUpStep = useCallback(() => {
    if (persistentRecogRef.current && recogRef.current) {
      mutedRef.current = true;
      clr();
    } else {
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
      clr();
    }
    sasRef.current();
  }, [clr]);

  /* ── Skip Follow-Up ── */
  const skipFollowUp = useCallback(() => {
    if (persistentRecogRef.current && recogRef.current) {
      mutedRef.current = true;
      clr();
    } else {
      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
      clr();
    }
    window.speechSynthesis?.cancel();
    photoWaitingRef.current = false;
    setTranscript('');
    followUpIndexRef.current++;
    advanceFollowUpRef.current();
  }, [clr]);

  /* ── Skip ALL ── */
  const skipAllFollowUp = useCallback(() => {
    persistentRecogRef.current = false;
    const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    clr(); window.speechSynthesis?.cancel();
    setTranscript('');
    // advanceFollowUp経由せず直接CONFIRM画面へ
    showConfirmScreen();
  }, [clr, showConfirmScreen]);

  /* ── Start Narrative (free-talk → dynamic follow-up) ── */
  const startNarrative = useCallback(() => {
    // 前回セッションの完全クリーンアップ
    persistentRecogRef.current = false; mutedRef.current = false; resultOffsetRef.current = 0;
    const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
    clr();
    rawTranscriptRef.current = [];
    chunksRef.current = '';
    sosDetectedRef.current = false;
    tier2DetectedRef.current = null;
    normalEmotionRef.current = null;
    photoWaitingRef.current = false;
    emptyRetryRef.current = 0;
    pendingDataRef.current = {};
    setTranscript(''); setAiReply(''); setConv([]); setProfitPreview(null);
    setPhotoCount(0); setTodayHouse(null); setTodayAdvice(''); setTodayLog('');
    setBump(null); setConfidence(null); setConfirmItems([]); setFollowUpInfo(null);
    setMentorDraft(''); setMentorCopied(false); setMentorStep('comfort'); setConsultSheet('');
    mediaPreview.forEach(m => URL.revokeObjectURL(m.url));
    setMediaPreview([]);
    localStorage.removeItem(SK_SESSION);

    // ナラティブモード: queueプリビルドしない
    followUpActiveRef.current = false;
    speak('今日のこと、なんでも聞かせてください。').then(() => startListen());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clr, startListen]);

  /* ── Begin Session ── */
  const begin = useCallback(() => {
    // マイク権限プリリクエスト（ユーザージェスチャーコンテキスト内で発火）
    // → ブラウザが許可プロンプトを表示。fire-and-forget で interview 開始をブロックしない
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {});
    startNarrative();
  }, [startNarrative]);

  const reset = () => {
    persistentRecogRef.current = false; mutedRef.current = false; resultOffsetRef.current = 0;
    try { recogRef.current?.stop(); } catch {} recogRef.current = null; invalidateRecogCache(); clr(); window.speechSynthesis?.cancel();
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    photoWaitingRef.current = false;
    sosDetectedRef.current = false;
    tier2DetectedRef.current = null;
    normalEmotionRef.current = null;
    setEmpathyCard(null);
    rawTranscriptRef.current = [];
    setFollowUpInfo(null);
    setConfirmItems([]);
    setMentorDraft('');
    setMentorCopied(false);
    setMentorStep('comfort');
    setConsultSheet('');
    setProfitPreview(null);
    mediaPreview.forEach(m => URL.revokeObjectURL(m.url));
    setMediaPreview([]);
    setPhase('IDLE'); setConv([]); setTranscript(''); setAiReply('');
    setTodayHouse(null); setTodayAdvice(''); setTodayLog('');
    setBump(null); setConfidence(null); setPhotoCount(0);
    setView('record');
  };

  const onPtrDown = useCallback(() => { if (phase !== 'THINKING' && phase !== 'CONFIRM' && phase !== 'BREATHING' && phase !== 'MENTOR' && phase !== 'REVIEWING') { ptrRef.current = Date.now(); lpRef.current = false; } }, [phase]);
  const onPtrUp = useCallback(() => {
    if (phase === 'THINKING' || phase === 'CONFIRM' || phase === 'BREATHING' || phase === 'MENTOR' || phase === 'REVIEWING') return;
    if (Date.now() - ptrRef.current < 200) {
      if (phase === 'LISTENING') {
        if (persistentRecogRef.current && followUpActiveRef.current) {
          mutedRef.current = true;
          sasRef.current(); // recog停止せずに処理
        } else {
          userStoppedRef.current = true;
          try { recogRef.current?.stop(); } catch {}
        }
      }
      else if (phase === 'FOLLOW_UP') startListen();
      else if (conv.length === 0 && !todayHouse && !followUpActiveRef.current) begin();
      else { if (bump) setBump(null); startListen(); }
    } else {
      lpRef.current = true;
      if (phase === 'LISTENING') {
        if (persistentRecogRef.current && followUpActiveRef.current) {
          mutedRef.current = true;
          sasRef.current();
        } else {
          userStoppedRef.current = true;
          try { recogRef.current?.stop(); } catch {}
        }
      }
    }
  }, [phase, startListen, begin, conv.length, todayHouse, bump]);

  const dateStr = mounted ? (() => {
    const t = new Date();
    return `${t.getMonth() + 1}月${t.getDate()}日（${DAY_NAMES[t.getDay()]}）`;
  })() : '';

  const todayISO = mounted ? new Date().toISOString().split('T')[0] : '';

  const handleShowReport = useCallback((text: string, type: 'month' | 'half') => {
    setReportText(text); setReportType(type); setShowReport(true); setReportFullscreen(true);
  }, []);

  const handleResetData = useCallback(() => {
    if (window.confirm('すべてのきろくをけします。もとにもどせません。よろしいですか？')) {
      if (window.confirm('ほんとうにけしますか？')) {
        localStorage.removeItem(SK_RECORDS);
        localStorage.removeItem(SK_SESSION);
        localStorage.removeItem(SK_DEEP_CLEANED);
        setHistVer(v => v + 1);
        setCalDate(null);
      }
    }
  }, []);

  return (
    <main className="min-h-screen pb-48 max-w-lg mx-auto">

      {/* ═══ COMPRESSED HEADER ═══ */}
      <header className="px-5 pt-8 pb-2 fade-up">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-black text-white tracking-wider">{APP_NAME}</h1>
          <div className="flex items-center gap-2">
            {outdoor && outdoor.code >= 0 && (
              <div className={`px-2.5 py-1 rounded-full text-sm font-bold ${CARD_FLAT}`}>
                <span className="text-stone-700">{outdoor.description} {outdoor.temperature}℃</span>
              </div>
            )}
            {mounted && (
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                isOnline ? 'bg-green-500/20 text-green-200 border border-green-400/30' : 'bg-red-500/20 text-red-200 border border-red-400/30 offline-pulse'
              }`}>
                {isOnline ? '同期済' : `未同期${pendSync > 0 ? `(${pendSync})` : ''}`}
              </div>
            )}
          </div>
        </div>
        {mounted && (
          <p className="text-sm font-medium text-white/50 mt-1">
            {dateStr}
          </p>
        )}
      </header>

      {/* ═══════════════════════════════════════════
          RECORD VIEW
          ═══════════════════════════════════════════ */}
      {view === 'record' && (
        <div className="view-enter">

          {/* ═══ MENTOR SCREEN ═══ */}
          {phase === 'MENTOR' && (
            <MentorMode
              mentorStep={mentorStep} mentorDraft={mentorDraft}
              mentorCopied={mentorCopied} consultSheet={consultSheet}
              setMentorStep={setMentorStep} setMentorCopied={setMentorCopied}
              onReset={reset}
            />
          )}

          {/* ═══ CONFIRM SCREEN ═══ */}
          {phase === 'CONFIRM' && confirmItems.length > 0 && (
            <ConfirmScreen
              confirmItems={confirmItems} onUpdate={updateConfirmItem}
              onSave={saveFromConfirm} onReset={reset}
              onVoiceCorrection={startVoiceCorrection}
              isListeningCorrection={correctionListening}
              correctionTranscript={correctionTranscript}
              saving={saving}
              locationOptions={locationOptions}
              isNewLocation={isNewLocation}
            />
          )}

          {/* ═══ CONFIRM FALLBACK (empty items safety net) ═══ */}
          {phase === 'CONFIRM' && confirmItems.length === 0 && (
            <section className="mx-5 mb-4 fade-up">
              <div className={`p-5 rounded-2xl ${GLASS}`}>
                <p className="text-xl font-bold text-stone-700 mb-4">記録するデータがありません</p>
                <button onClick={reset}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press">
                  もどる
                </button>
              </div>
            </section>
          )}

          {/* ═══ IDLE CONTENT ═══ */}
          {phase === 'IDLE' && (
            <>
              {httpsRedirectUrl && (
                <section className="mx-5 mb-4 fade-up">
                  <a href={httpsRedirectUrl}
                    className="block p-5 rounded-2xl bg-amber-50/90 backdrop-blur-xl border border-amber-300/50 shadow-lg">
                    <p className="text-lg font-bold text-amber-800 mb-1">音声機能にはHTTPS接続が必要です</p>
                    <p className="text-base font-medium text-amber-600 underline">{httpsRedirectUrl}</p>
                  </a>
                </section>
              )}

              {isFirstTime && !aiReply && (
                <section className="mx-5 mb-4 view-enter">
                  <div className={`p-6 rounded-2xl ${CARD_ACCENT}`}>
                    <h2 className="text-xl font-bold text-stone-800 mb-4">はじめかた</h2>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">1</span>
                        <p className="text-lg font-medium text-stone-700">下のマイクをタップ</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">2</span>
                        <p className="text-lg font-medium text-stone-700">今日の作業を自由に話す</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">3</span>
                        <p className="text-lg font-medium text-stone-700">足りない情報だけ質問します</p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {aiReply && !profitPreview && (
                <section className="mx-5 mb-4 fade-up">
                  <div className="p-5 rounded-2xl bg-blue-50/85 backdrop-blur-xl border border-blue-200/30 shadow-lg">
                    <p className="text-xs font-bold text-blue-500 mb-2 tracking-wide">営農分析</p>
                    <p className="text-xl font-bold text-blue-800 leading-relaxed font-serif">{aiReply}</p>
                  </div>
                </section>
              )}

              {profitPreview && (
                <section className="mx-5 mb-4 fade-up">
                  <div className="p-5 rounded-2xl bg-green-50/85 backdrop-blur-xl border border-green-200/30 shadow-lg">
                    <p className="text-xl font-black text-green-900 mb-1">{profitPreview.praise}</p>
                    <p className="text-2xl font-black text-green-800 mb-3">{profitPreview.message}</p>
                    <div className="space-y-1">
                      {profitPreview.details.map((d, i) => (
                        <p key={i} className="text-base font-medium text-green-700">{d}</p>
                      ))}
                    </div>
                    {profitPreview.marketTip && (
                      <div className="mt-3 p-3 rounded-xl bg-green-100/60 border border-green-300/40">
                        <p className="text-sm font-bold text-green-800">{profitPreview.marketTip}</p>
                      </div>
                    )}
                    <p className="text-xs font-medium text-green-500 mt-3">※ 収穫量 × 800円/kg で試算。市場価格により変動します。</p>
                  </div>
                </section>
              )}

              {weeklyCount > 0 && (
                <section className="mx-5 mb-4 fade-up">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${CARD_FLAT}`}>
                    <p className="flex-1 text-lg font-bold text-green-700">今週 {weeklyCount}回 記録済</p>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ═══ ACTIVE PHASE CONTENT (non-CONFIRM, non-MENTOR) ═══ */}
          {phase !== 'CONFIRM' && phase !== 'MENTOR' && (
            <section className="flex flex-col items-center justify-center px-5 py-4">

              {phase === 'BREATHING' && (
                <div className="w-full mb-6 fade-up">
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="flex items-end justify-center h-12 text-amber-500 mb-4">
                      <span className="soundwave-bar" />
                      <span className="soundwave-bar" />
                      <span className="soundwave-bar" />
                      <span className="soundwave-bar" />
                      <span className="soundwave-bar" />
                    </div>
                    <p className="text-lg font-medium text-white/70">次の質問を準備中...</p>
                  </div>
                </div>
              )}

              {followUpInfo && (phase === 'FOLLOW_UP' || phase === 'LISTENING') && (
                <div className="w-full mb-6 fade-up">
                  <div className={`p-5 rounded-2xl ${CARD_ACCENT}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-amber-600 bg-amber-200/60 px-2.5 py-1 rounded-full">
                        {followUpInfo.current}/{followUpInfo.total}
                      </span>
                      <span className="text-sm font-medium text-stone-500">の質問</span>
                    </div>
                    <p className="text-2xl font-bold text-stone-900 leading-relaxed">{followUpInfo.label}</p>
                  </div>
                </div>
              )}

              {phase === 'FOLLOW_UP' && transcript && (
                <div className="w-full mb-3 fade-up">
                  <div className={`px-4 py-2 rounded-xl ${CARD_FLAT}`}>
                    <p className="text-lg font-bold text-stone-700">{transcript}</p>
                  </div>
                </div>
              )}

              {phase === 'THINKING' && (
                <div className="mb-6 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-500 dot-1" />
                    <div className="w-5 h-5 rounded-full bg-amber-500 dot-2" />
                    <div className="w-5 h-5 rounded-full bg-amber-500 dot-3" />
                  </div>
                  <p className="text-lg font-medium text-white/60">解析中...</p>
                </div>
              )}

              {phase === 'LISTENING' && transcript && (
                <div className="w-full mb-4 fade-up">
                  <div className={`px-4 py-3 rounded-2xl ${CARD_ACCENT}`}>
                    <p className="text-xl font-bold text-stone-800">{transcript}</p>
                  </div>
                </div>
              )}

              {phase === 'REVIEWING' && !followUpActiveRef.current && (
                <div className="w-full mb-4 fade-up">
                  <div className={`p-5 rounded-2xl ${GLASS}`}>
                    {transcript ? (
                      <>
                        <p className="text-sm font-medium text-stone-500 mb-2">聞き取り内容</p>
                        <p className="text-xl font-bold text-stone-900 mb-4 leading-relaxed">{transcript}</p>
                        <div className="flex gap-3">
                          <button onClick={confirmTranscript}
                            className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                            <Check className="w-6 h-6" /> 確定
                          </button>
                          <button onClick={retryListen}
                            className="py-4 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                            <RotateCcw className="w-5 h-5" /> やり直し
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-stone-700 mb-4">聞き取れませんでした</p>
                        <button onClick={retryListen}
                          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                          <RotateCcw className="w-5 h-5" /> もう一度
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {phase === 'LISTENING' && liveChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5 justify-center">
                  {liveChips.map((c, i) => (
                    <span key={`${c}-${i}`} className="chip-pop px-3 py-1.5 rounded-full text-base font-bold bg-amber-100/80 text-amber-800 border border-amber-300/50 shadow-sm backdrop-blur-sm">{c}</span>
                  ))}
                </div>
              )}

              {photoCount > 0 && (
                <div className="mb-3">
                  <p className="text-base font-medium text-white/60 mb-2">
                    <Camera className="w-4 h-4 inline mr-1" /> {photoCount}件添付
                  </p>
                  {mediaPreview.length > 0 && (
                    <div className="flex gap-2 flex-wrap justify-center">
                      {mediaPreview.map((m, i) => (
                        m.type === 'video' ? (
                          <video key={i} src={m.url} className="w-20 h-20 object-cover rounded-lg border border-white/30" muted playsInline />
                        ) : (
                          <img key={i} src={m.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-white/30" />
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ MIC / CAMERA BUTTON (Record View) ═══ */}
              {(() => {
                const isPhotoStep = followUpInfo !== null
                  && followUpQueueRef.current[followUpIndexRef.current] === 'PHOTO'
                  && (phase === 'FOLLOW_UP' || phase === 'LISTENING');
                return isPhotoStep ? (
                  <>
                    <button
                      onClick={() => photoRef.current?.click()}
                      className="relative z-10 rounded-full flex items-center justify-center w-[24vh] h-[24vh] max-w-64 max-h-64 transition-all duration-300 select-none touch-none btn-press bg-gradient-to-br from-sky-500 to-blue-600 shadow-[0_8px_50px_rgba(14,165,233,0.5)]"
                      aria-label="写真を添付"
                    >
                      <Camera className="w-20 h-20 text-white" />
                    </button>
                    <p className="mt-4 text-xl font-bold text-white/70">写真を添付</p>
                  </>
                ) : (
                  <>
                    <div className="relative">
                      {(phase === 'LISTENING' || phase === 'FOLLOW_UP') && <div className="absolute inset-0 rounded-full bg-amber-400/30 listening-ring" />}
                      <button
                        onPointerDown={onPtrDown} onPointerUp={onPtrUp}
                        onPointerLeave={() => { if (phase === 'LISTENING' && lpRef.current) stopAndSend(); }}
                        disabled={phase === 'THINKING' || phase === 'BREATHING' || phase === 'REVIEWING'}
                        className={`
                          relative z-10 rounded-full flex items-center justify-center
                          w-[24vh] h-[24vh] max-w-64 max-h-64
                          transition-all duration-300 select-none touch-none btn-press
                          ${phase === 'LISTENING'
                            ? 'bg-gradient-to-br from-red-500 to-red-600 scale-105 shadow-[0_0_60px_rgba(239,68,68,0.4)]'
                            : phase === 'THINKING'
                              ? 'bg-stone-300/80 backdrop-blur-xl animate-pulse cursor-wait'
                              : phase === 'BREATHING'
                                ? 'bg-gradient-to-br from-amber-300 to-orange-400 opacity-60 cursor-wait'
                                : phase === 'FOLLOW_UP'
                                  ? 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] biwa-pulse shadow-[0_8px_50px_rgba(255,140,0,0.5)]'
                                  : 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] shadow-[0_8px_50px_rgba(255,140,0,0.5)]'
                          }
                        `}
                        aria-label="タップして話す"
                      >
                        <Mic className={`w-16 h-16 text-white ${
                          phase === 'LISTENING' ? 'animate-pulse' : phase === 'THINKING' ? 'animate-bounce' : ''
                        }`} />
                      </button>
                    </div>
                    <p className="mt-4 text-xl font-bold text-white/70">
                      {phase === 'LISTENING' ? '聞いています... タップで止める'
                        : phase === 'REVIEWING' ? ''
                        : phase === 'THINKING' ? '考え中...'
                        : phase === 'BREATHING' ? '準備中...'
                        : phase === 'FOLLOW_UP' ? '声で答えてください'
                        : '今日のことを話す'}
                    </p>
                  </>
                );
              })()}

              {/* Action buttons row */}
              <div className="mt-4 flex gap-3 w-full">
                {followUpInfo && followUpQueueRef.current[followUpIndexRef.current] === 'PHOTO' && (
                  <button onClick={() => photoRef.current?.click()}
                    className={`flex-1 py-5 rounded-2xl ${CARD_FLAT} flex items-center justify-center gap-2 text-lg font-bold text-stone-700 hover:bg-white/80 btn-press`}>
                    <Camera className="w-6 h-6" /> 写真
                  </button>
                )}
                <input ref={photoRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
                  onChange={async e => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    for (let i = 0; i < Math.min(files.length, MAX_MEDIA_PER_RECORD - photoCount); i++) {
                      const file = files[i];
                      const mediaType = file.type.startsWith('video') ? 'video' : 'image';
                      try {
                        await saveMediaBlob(pendingMediaId, file, mediaType);
                        setMediaPreview(prev => [...prev, { url: URL.createObjectURL(file), type: mediaType }]);
                      } catch { /* IDB save failed, count only */ }
                    }
                    setPhotoCount(p => p + Math.min(files.length, MAX_MEDIA_PER_RECORD - photoCount));
                    e.target.value = '';
                    const isPhotoStep = followUpActiveRef.current && followUpQueueRef.current[followUpIndexRef.current] === 'PHOTO';
                    if (photoWaitingRef.current || isPhotoStep) {
                      photoWaitingRef.current = false;
                      followUpIndexRef.current++;
                      // 音声認識を確実に停止してからCONFIRM遷移（遅延onendによるIDLEリセット防止）
                      persistentRecogRef.current = false;
                      const _r = recogRef.current; recogRef.current = null; if (_r) { try { _r.stop(); } catch {} }
                      window.speechSynthesis?.cancel();
                      setTimeout(() => showConfirmScreen(), 500);
                    }
                  }} />
                <input ref={ocrInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleOcr(file);
                    e.target.value = '';
                  }} />
              </div>

              {phase === 'IDLE' && (
                <>
                  <p className="mt-5 text-lg font-medium text-white/50 text-center leading-relaxed max-w-xs">
                    マイクをタップして、今日の作業を自由に話してください<br/>
                    <span className="text-white/30">不足分だけあとで質問します</span>
                  </p>
                  {!isFirstTime && (
                    <button onClick={() => ocrInputRef.current?.click()}
                      className={`mt-3 py-3 px-6 rounded-2xl ${CARD_FLAT} flex items-center justify-center gap-2 text-lg font-bold text-stone-700 hover:bg-white/80 btn-press`}>
                      <FileScan className="w-5 h-5" /> 過去の日誌をスキャン
                    </button>
                  )}
                  <button onClick={() => setView('history')}
                    className={`mt-3 w-full py-5 rounded-2xl ${GLASS} flex items-center justify-center gap-3 text-xl font-bold text-stone-700 hover:bg-white/80 btn-press`}>
                    <CalendarDays className="w-6 h-6" /> 過去の履歴を見る
                  </button>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {/* ═══ HISTORY VIEW ═══ */}
      {view === 'history' && mounted && (
        <HistoryView
          hasChartData={hasChartData} trendData={trendData}
          calMonth={calMonth} setCalMonth={setCalMonth}
          calDays={calDays} calDate={calDate} setCalDate={setCalDate}
          todayISO={todayISO} recordMap={recordMap} calSelected={calSelected}
          selectedMedia={selectedMedia} setFullscreenMedia={setFullscreenMedia}
          setView={setView} onShowReport={handleShowReport} onResetData={handleResetData}
        />
      )}

      {/* ═══ TAB BAR ═══ */}
      {!isActivePhase && mounted && (
        <TabBar view={view} setView={setView} />
      )}

      {/* ═══ CELEBRATION OVERLAY ═══ */}
      {showCelebration && (
        <CelebrationOverlay celebrationProfit={celebrationProfit} />
      )}

      {/* ═══ EMPATHY CARD (Tier 2) ═══ */}
      {empathyCard && (
        <EmpathyCard emotion={empathyCard} outdoor={outdoor} onDismiss={() => setEmpathyCard(null)} />
      )}

      {/* ═══ FULLSCREEN MEDIA VIEWER ═══ */}
      {fullscreenMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/90 backdrop-blur-sm" onClick={() => setFullscreenMedia(null)}>
          <button onClick={() => setFullscreenMedia(null)} className="absolute top-5 right-5 z-10 p-2 rounded-full bg-white/20 hover:bg-white/30 btn-press">
            <X className="w-7 h-7 text-white" />
          </button>
          {fullscreenMedia.type === 'video' ? (
            <video src={fullscreenMedia.url} controls autoPlay playsInline className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          ) : (
            <img src={fullscreenMedia.url} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}

      {/* ═══ FULLSCREEN REPORT ═══ */}
      {reportFullscreen && showReport && reportText && (
        <div className="fixed inset-0 z-50 bg-stone-900/95 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">
              {reportType === 'half' ? '就農状況報告書' : '月次レポート'}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `agri-buddy-report-${calMonth.getFullYear()}-${calMonth.getMonth() + 1}.txt`;
                a.click(); URL.revokeObjectURL(url);
              }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-sm font-bold btn-press">
                <Download className="w-4 h-4" /> 保存
              </button>
              <button onClick={() => { setReportFullscreen(false); setShowReport(false); }}
                className="p-2 rounded-full hover:bg-white/10 btn-press">
                <X className="w-6 h-6 text-white/60" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 shadow-2xl">
              <pre className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed font-sans">{reportText}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Fixed Bottom Button Bar (Follow-up) ═══ */}
      {view === 'record' && followUpInfo && (phase === 'FOLLOW_UP' || phase === 'LISTENING') && (
        <FollowUpBar phase={phase} onConfirm={confirmFollowUpStep} onSkip={skipFollowUp} onSkipAll={skipAllFollowUp} />
      )}
    </main>
  );
}
