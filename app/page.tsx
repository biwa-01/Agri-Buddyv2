'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Mic, Camera, ChevronLeft, ChevronRight, ChevronDown,
  RotateCcw, Download, Pencil, Check, X,
  CalendarDays, Flame, HandHeart, PhoneCall, FileScan,
} from 'lucide-react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */
interface ConvMessage { role: 'user' | 'assistant'; text: string; }
interface HouseData { max_temp: number | null; min_temp: number | null; humidity: number | null; }

interface PartialSlots {
  max_temp?: number; min_temp?: number; humidity?: number;
  work_log?: string; plant_status?: string;
  fertilizer?: string; pest_status?: string;
  harvest_amount?: string; material_cost?: string;
  work_duration?: string; fuel_cost?: string;
}

interface ApiResponse {
  status: 'complete'; reply: string;
  missing_hints?: string[]; confidence?: 'low' | 'medium' | 'high';
  house_data?: HouseData | null; work_log?: string; plant_status?: string;
  advice?: string; strategic_advice?: string; admin_log?: string;
  fertilizer?: string; pest_status?: string;
  harvest_amount?: string; material_cost?: string;
  work_duration?: string; fuel_cost?: string;
  error?: string;
  mentor_mode?: boolean;
}

type Phase = 'IDLE' | 'LISTENING' | 'REVIEWING' | 'THINKING' | 'FOLLOW_UP' | 'BREATHING' | 'CONFIRM' | 'MENTOR';
type View = 'record' | 'history';
interface OutdoorWeather { description: string; temperature: number; code: number; }

interface LocalRecord {
  id: string; date: string; location: string;
  house_data: HouseData | null; work_log: string; plant_status: string;
  advice: string; admin_log: string;
  fertilizer: string; pest_status: string;
  harvest_amount: string; material_cost: string;
  work_duration: string; fuel_cost: string;
  strategic_advice: string; photo_count: number;
  estimated_profit?: number;
  synced: boolean; timestamp: number;
}

interface LastSession { location: string; work: string; date: string; }

type FollowUpStep = 'WORK' | 'HOUSE_TEMP' | 'FERTILIZER' | 'PEST' | 'HARVEST' | 'COST' | 'DURATION' | 'PHOTO';

/* ── Confirm field definition ── */
interface ConfirmItem {
  key: string;
  label: string;
  value: string;
}

/* ═══════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════ */
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Agri-Buddy';
const MAX_LISTEN_MS = 120000;
const BREATHING_MS = 1500;
const SK_RECORDS = 'agri-buddy-records';
const SK_SESSION = 'agri-buddy-last-session';
const DEFAULT_LOC = '茂木町ハウス';
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/* ── Card hierarchy ── */
const GLASS = 'bg-stone-50/85 backdrop-blur-xl border border-stone-200/20 shadow-lg';
const CARD_FLAT = 'bg-white/60 backdrop-blur-sm border border-stone-100/40';
const CARD_ACCENT = 'bg-gradient-to-br from-amber-50/90 to-orange-50/80 border border-amber-200/30';
const CARD_INSET = 'bg-stone-50/40 border border-stone-200/30 shadow-inner';

// 内容クリア→即座に次へ (100ms)
const SKIP_RE = /(スキップ|なし|ない|いいえ|いえ|特にない|ありません|パス|とくにない|なかった)/i;
const PHOTO_RE = /写真|カメラ|撮って|撮影|撮るよ/;
// セッション終了→CONFIRM画面 (200ms)
const DONE_RE = /以上です|いじょうです|以上|終わり|おわり|終了|しゅうりょう/;
// 内容保持→次へ (300ms)
const CONFIRM_RE = /確定|かくてい|次へ|つぎへ|OK|オッケー|オーケー|送信|そうしん|決定|けってい|完了|かんりょう|できた/;
const SOS_RE = /しんどい|辞めたい|やめたい|つらい|辛い|きつい|限界|助けて|もう無理|逃げたい|潰れ|SOS|疲れた|つかれた|だるい|やる気.*ない/i;
const GENERIC_ADVICE_RE = /詳細を追加すると|次回の入力で傾向分析/;

/* ── Agricultural term correction dictionary ── */
const AGRI_CORRECTIONS: [RegExp, string][] = [
  [/感謝/, '換気'], [/剣定|選定/, '剪定'], [/接ぎ|席/, '施肥'],
  [/果樹園|貸主/, '灌水'], [/監視|関数/, '灌水'], [/観水|完水/, '灌水'],
  [/飛行|比較/, '肥料'], [/視界|しかい|指揮/, '資材'],
  [/燃料日|ねんりょうひ/, '燃料費'], [/格差|日格差/, '日較差'],
  [/車庫|社交/, '遮光'],
  [/貝殻虫/, 'カイガラムシ'], [/うどん粉/, 'うどんこ病'],
  [/白い粉/, 'うどんこ病'], [/灰色カビ/, '灰色かび病'],
  [/あぶら虫/, 'アブラムシ'], [/油虫/, 'アブラムシ'],
  [/びわ|ビワ|琵琶/, '枇杷'], [/摘下/, '摘果'],
  [/線定|洗定/, '剪定'], [/市場|至宝/, '施肥'], [/殺菌際/, '殺菌剤'],
  [/線香/, '選果'], [/用燐|ようりん/, 'ようりん'],
  [/再配|さいはい/, '栽培'], [/転園|てんえん/, '点検'], [/正規|せいき/, '生育'],
];

const FOLLOW_UP_QUESTIONS: Record<FollowUpStep, string> = {
  WORK: '今日の主な作業は何ですか？',
  HOUSE_TEMP: 'ハウスの温度は？（最高・最低も）',
  FERTILIZER: '肥料は使いましたか？',
  PEST: '病害虫はいましたか？',
  HARVEST: '収穫はしましたか？',
  COST: '資材や燃料費はかかりましたか？',
  DURATION: '作業時間はどれくらいですか？',
  PHOTO: '写真は撮りますか？',
};

/* ── Structured extraction: classify input to step ── */
const CLASSIFY_RE: Record<FollowUpStep, RegExp> = {
  WORK: /灌水|剪定|散布|摘果|施肥|観察|収穫|換気|袋かけ|消毒|出荷|作業|草刈|定植/,
  HOUSE_TEMP: /\d+度|\d+℃|温度|気温|最高|最低/,
  FERTILIZER: /肥料|追肥|元肥|窒素|リン|カリ|有機|化成|施肥|撒いた|まいた/,
  PEST: /病|虫|害|薬|殺虫|殺菌|防除|散布|カイガラ|すす|紋羽|灰斑|黒点/,
  HARVEST: /収穫|穫れた|取れた|出荷|kg|キロ|コンテナ|箱|個|玉/,
  COST: /円|費|コスト|経費|支出|買った|購入|万|千/,
  DURATION: /時間|分|午前|午後|朝|昼|夕|始め|終わ/,
  PHOTO: /撮った|とった|写真|画像/,
};

/* ── pest_status verb stripping ── */
const PEST_VERB_RE = /(が|を|は)?(い(た|ました|ます|る)|あっ(た|て)|出(た|て(い(た|る))?)|発生(し(た|て(い(た|る))?)?)?|見つか(った|って)|確認(し(た|て(い(た|る))?)?)?)$/;
function cleanPestName(raw: string): string {
  return raw.replace(PEST_VERB_RE, '').trim() || raw;
}

/* ═══════════════════════════════════════════
   Advice Generation (client-side)
   ═══════════════════════════════════════════ */
const REFERENCE_LINKS = [
  '長崎県農林技術開発センター: https://www.pref.nagasaki.jp/section/nougisen/',
  '農研機構 果樹研究部門: https://www.naro.go.jp/laboratory/nifts/',
  'JA長崎せいひ 枇杷栽培情報: https://www.ja-nagasakiseihi.jp/',
];

type Confidence = 'low' | 'medium' | 'high';

function calcConfidence(slots: PartialSlots): Confidence {
  let filled = 0;
  if (slots.max_temp !== undefined) filled++;
  if (slots.min_temp !== undefined) filled++;
  if (slots.humidity !== undefined) filled++;
  if (slots.work_log) filled++;
  if (slots.plant_status && slots.plant_status !== '良好') filled++;
  if (slots.fertilizer) filled++;
  if (slots.pest_status && slots.pest_status !== 'なし') filled++;
  if (slots.harvest_amount) filled++;
  if (slots.material_cost) filled++;
  if (filled >= 5) return 'high';
  if (filled >= 2) return 'medium';
  return 'low';
}

function generateAdvice(slots: PartialSlots, confidence: Confidence): string {
  if (confidence === 'low') {
    return '記録しました。詳細を追加すると、具体的な分析が可能になります。';
  }
  const parts: string[] = [];
  if (slots.max_temp !== undefined) {
    const maxT = slots.max_temp;
    const minT = slots.min_temp;
    if (maxT >= 35) {
      parts.push(`【高温警戒】${maxT}℃は暑すぎて葉が働けない温度。遮光ネット50%を張って、15時すぎたら天窓を全開に。実が焼けないよう葉陰を確保。`);
    } else if (maxT >= 30) {
      parts.push(`【温度管理】${maxT}℃はやや高め。暑いとハウスが乾きやすいから、水やりを普段より1割ほど増やす。午後は遮光して実の温度を下げる。`);
    } else if (maxT <= 3) {
      parts.push(`【凍害警戒】${maxT}℃は枇杷がやられる寒さ。二重カーテン＋暖房機を確認しましょう。花は-3℃、小さい実は-1℃でダメになる。`);
    } else if (maxT <= 8) {
      parts.push(`【低温注意】${maxT}℃。保温資材を点検しましょう。夜の気温に注意。`);
    } else {
      parts.push(`【環境良好】${maxT}℃は枇杷がよく育つ温度帯。このまま続けて大丈夫。`);
    }
    if (minT !== undefined && maxT - minT > 10) {
      parts.push(`昼夜の温度差${maxT - minT}℃。10℃超えると甘くなりやすいけど、結露しやすい。朝イチで換気して結露を飛ばし、灰色かび病を防ぐ。`);
    }
  }
  if (slots.humidity !== undefined) {
    if (slots.humidity < 40) {
      parts.push(`【乾燥注意】湿度${slots.humidity}%。乾燥しすぎると葉が閉じて育ちが悪くなる。ミスト灌水か葉水で湿度60%以上を目標に。`);
    } else if (slots.humidity < 50) {
      parts.push(`【湿度低め】${slots.humidity}%。葉水をすると楽になる。午前中がいい。`);
    } else if (slots.humidity > 90) {
      parts.push(`【過湿警戒】湿度${slots.humidity}%。灰色かびやすす病が出やすい。扇風機と天窓で80%以下まで下げる。`);
    } else if (slots.humidity > 85) {
      parts.push(`【湿度高め】${slots.humidity}%。カビが出やすい条件。換気を強めて、通路の草を刈って風通しを良くする。`);
    }
  }
  if (slots.fertilizer) {
    parts.push(`【施肥管理】${slots.fertilizer}を記録。根に届くまで3〜5日、葉の色に出るまで7〜10日。肥料のやりすぎに注意しましょう。根っこが傷みます。`);
  }
  if (slots.pest_status && slots.pest_status !== 'なし') {
    const pest = cleanPestName(slots.pest_status);
    if (/カイガラムシ/.test(pest)) {
      parts.push(`【病害虫】${pest}を確認。マシン油乳剤95%の散布（発生初期）が有効。放置すると排泄物によるすす病を併発し、商品価値が著しく低下。経済被害は1樹あたり収量20〜30%減の可能性。`);
    } else if (/うどんこ/.test(pest)) {
      parts.push(`【病害虫】${pest}を確認。トリフミン水和剤またはカリグリーンの散布しましょう。風通しをよくすると再発しにくい。`);
    } else if (/アブラムシ/.test(pest)) {
      parts.push(`【病害虫】${pest}を確認。モスピラン水溶剤の散布が有効。天敵（テントウムシ）の活用も検討。ウイルス媒介リスクがあるため早めに防除しましょう。`);
    } else {
      parts.push(`【病害虫】${pest}を確認。拡大前の早期防除が経済的損失を最小化。被害面積を記録し、次の散布計画を考えましょう。`);
    }
  }
  if (slots.harvest_amount) {
    const m = String(slots.harvest_amount).match(/(\d+)/);
    if (m) {
      const qty = parseInt(m[1]);
      parts.push(`【収穫】${slots.harvest_amount}を記録。収穫後は礼肥（お礼の肥料）を検討。粒を揃えて、いいタイミングで出すと値段が変わる。`);
      if (qty >= 50) {
        parts.push(`たくさん穫れたぶん、木への負担が大きい。来年の花が減る可能性があるから、秋の肥料を早めに計画。`);
      }
    }
  }
  if (parts.length === 0) {
    return '記録しました。詳細を追加すると、具体的な分析が可能になります。';
  }
  const work = slots.work_log || '管理作業';
  let reason = '日々の管理';
  if (slots.max_temp !== undefined || slots.humidity !== undefined) reason = '環境モニタリング';
  if (slots.fertilizer) reason = '土壌管理';
  if (slots.pest_status && slots.pest_status !== 'なし') reason = '早期防除';
  if (slots.harvest_amount) reason = '収量管理';
  const praise = `今日の${work}は${reason}の観点から価値の高い作業です。`;
  const actions: string[] = [];
  if (slots.max_temp !== undefined && slots.max_temp >= 30) actions.push('遮光ネットの確認と灌水量の調整');
  if (slots.max_temp !== undefined && slots.max_temp <= 8) actions.push('保温資材と暖房機の点検');
  if (slots.humidity !== undefined && slots.humidity > 85) actions.push('換気扇の稼働確認と天窓開度の調整');
  if (slots.humidity !== undefined && slots.humidity < 50) actions.push('葉水の実施（午前中推奨）');
  if (slots.fertilizer) actions.push('施肥後3〜5日で葉色変化を観察');
  if (slots.pest_status && slots.pest_status !== 'なし') actions.push(`${cleanPestName(slots.pest_status)}の経過観察と防除記録の更新`);
  if (slots.harvest_amount) actions.push('樹勢回復に礼肥を考えましょう');
  let result = praise + '\n\n' + parts.join('\n');
  if (actions.length > 0) {
    result += '\n\n【次のアクション】\n' + actions.map(a => `・${a}`).join('\n');
  }
  result += '\n\n【参考】\n' + REFERENCE_LINKS.join('\n');
  return result;
}

function generateStrategicAdvice(slots: PartialSlots): string {
  const lines: string[] = [];
  if (slots.max_temp !== undefined) {
    if (slots.max_temp >= 35) lines.push('【緊急】遮光ネットを張る・天窓全開で換気・葉水をすぐやる');
    else if (slots.max_temp >= 30) lines.push('次回: 遮光ネット50%を確認、水やり1割増し、午後は換気を強める');
    else if (slots.max_temp <= 3) lines.push('【緊急】二重カーテン確認・暖房をつける・霜対策');
    else if (slots.max_temp <= 8) lines.push('次回: 保温資材を点検、夜の気温をよく見る');
  }
  if (slots.humidity !== undefined) {
    if (slots.humidity < 50) lines.push('次回: 午前中に葉水をして、湿度60%以上をキープ');
    if (slots.humidity > 85) lines.push('次回: 扇風機が動いてるか確認、天窓を調整して80%以下に');
  }
  if (slots.pest_status && slots.pest_status !== 'なし') lines.push(`次回: ${cleanPestName(slots.pest_status)}の様子を最優先で見る、防除記録を更新`);
  if (slots.fertilizer) lines.push('次回: 肥料をやって3〜5日で葉の色をチェック');
  if (slots.harvest_amount) lines.push('次回: 礼肥を検討、来年の花への影響も考える');
  if (slots.material_cost) {
    const m = String(slots.material_cost).match(/(\d+)/);
    if (m && parseInt(m[1]) >= 10000) lines.push(`経営注記: 資材費${slots.material_cost}、月の予算と合ってるか確認しましょう`);
  }
  return lines.length > 0 ? lines.join('\n') : '記録完了。次回の入力で傾向分析が可能になります。';
}

function generateAdminLog(slots: PartialSlots, loc: string): string {
  const hasEnvData = slots.max_temp !== undefined || slots.humidity !== undefined;
  const conf = calcConfidence(slots);
  return [
    `【日付】${new Date().toISOString().split('T')[0]}`,
    `【圃場】${loc}`,
    hasEnvData
      ? `【ハウス環境】最高${slots.max_temp !== undefined ? slots.max_temp + '℃' : '-'} / 最低${slots.min_temp !== undefined ? slots.min_temp + '℃' : '-'} / 湿度${slots.humidity !== undefined ? slots.humidity + '%' : '-'}`
      : '【ハウス環境】未計測',
    `【作業】${slots.work_log || '-'}`,
    slots.work_duration ? `【作業時間】${slots.work_duration}` : null,
    slots.fertilizer ? `【施肥】${slots.fertilizer}` : null,
    slots.harvest_amount ? `【収穫】${slots.harvest_amount}` : null,
    slots.material_cost ? `【資材費】${slots.material_cost}` : null,
    slots.fuel_cost ? `【燃料費】${slots.fuel_cost}` : null,
    `【病害虫】${slots.pest_status || 'なし'}`,
    `【所見】${(slots.plant_status || '良好') === '良好' ? '特記事項なし' : slots.plant_status}`,
    `【信頼度】${conf}`,
  ].filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
const WORK_CHIPS = [
  { p: /水やり|灌水|かんすい|みずやり/, l: '灌水' }, { p: /剪定|せんてい/, l: '剪定' },
  { p: /薬|散布|消毒/, l: '薬散' }, { p: /摘果|てきか/, l: '摘果' },
  { p: /施肥|肥料|ひりょう/, l: '施肥' }, { p: /観察|かんさつ|見回/, l: '観察' },
  { p: /収穫|しゅうかく/, l: '収穫' }, { p: /換気|かんき/, l: '換気' },
  { p: /袋かけ|袋掛/, l: '袋かけ' }, { p: /害虫|虫|カビ/, l: '病害虫' },
];

function correctAgriTerms(text: string): string {
  let result = text;
  for (const [pattern, replacement] of AGRI_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function extractChips(text: string): string[] {
  const chips: string[] = [];
  const lo = text.toLowerCase();
  const tm = text.match(/(\d+)\s*[度℃]/g);
  if (tm) tm.forEach(t => chips.push(`${t.replace(/[^\d]/g, '')}℃`));
  const hm = text.match(/(\d+)\s*[%％パーセント]/);
  if (hm) chips.push(`${hm[1]}%`);
  for (const w of WORK_CHIPS) { if (w.p.test(lo)) chips.push(w.l); }
  if (lo.includes('黄')) chips.push('黄化');
  if (lo.includes('斑点')) chips.push('斑点');
  const qm = text.match(/(\d+)\s*袋/);
  if (qm) chips.push(qm[0]);
  const cm = text.match(/(\d+)\s*(円|えん)/);
  if (cm) chips.push(cm[0]);
  const km = text.match(/(\d+)\s*(kg|キロ|個|箱)/i);
  if (km) chips.push(km[0]);
  return [...new Set(chips)];
}

function detectLocationOverride(text: string, cur: string): string | null {
  const m = text.match(/(\S+(?:ハウス|畑|園|圃場))/);
  if (!m || m[1] === cur) return null;
  // 助詞・動詞語尾 + 圃場名は誤検出（例:「温度はハウス」「見てハウス」）
  if (/^.+[はがをのにでもへとてで](?:ハウス|畑|園|圃場)$/.test(m[1])) return null;
  return m[1];
}

function weatherDesc(c: number) { return c === 0 ? '快晴' : c <= 3 ? '晴れ' : c <= 49 ? '曇り' : c <= 69 ? '雨' : c <= 79 ? '雪' : '荒天'; }

async function fetchWeather(): Promise<OutdoorWeather> {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.75&longitude=129.87&current_weather=true&timezone=Asia/Tokyo');
    const d = await r.json(); const c = d.current_weather;
    return { description: weatherDesc(c.weathercode), temperature: c.temperature, code: c.weathercode };
  } catch { return { description: '取得失敗', temperature: 0, code: -1 }; }
}

async function fetchTomorrowWeather(): Promise<{ description: string; maxTemp: number; minTemp: number } | null> {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.75&longitude=129.87&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia/Tokyo&forecast_days=2');
    const d = await r.json();
    return {
      description: weatherDesc(d.daily.weathercode[1]),
      maxTemp: d.daily.temperature_2m_max[1],
      minTemp: d.daily.temperature_2m_min[1],
    };
  } catch { return null; }
}

function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 1.0;
    u.onend = () => resolve(); u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRecog(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any; const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
  if (!SR) return null;
  const r = new SR(); r.lang = 'ja-JP'; r.continuous = true; r.interimResults = true; return r;
}

function Linkify({ text }: { text: string }) {
  const re = /(https?:\/\/[^\s）)]+)/g; const parts = text.split(re);
  return <>{parts.map((p, i) => re.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-amber-600 underline underline-offset-2 hover:text-amber-500 break-all">{p}</a>
    : <span key={i}>{p}</span>
  )}</>;
}

function fmtVal(v: number | null | undefined, unit: string): string {
  return v !== null && v !== undefined ? `${v}${unit}` : '-';
}

function extractNextActions(advice: string, strategic: string): { analysisOnly: string; actions: string[] } {
  const actions: string[] = [];
  let analysisOnly = advice;
  const actionIdx = advice.indexOf('【次のアクション】');
  if (actionIdx >= 0) {
    const block = advice.slice(actionIdx);
    analysisOnly = advice.slice(0, actionIdx).trimEnd();
    for (const line of block.split('\n').slice(1)) {
      const t = line.replace(/^・/, '').trim();
      if (!t || t.startsWith('【参考】')) break;
      actions.push(t);
    }
  }
  if (strategic) {
    for (const line of strategic.split('\n')) {
      if (/^次回:\s*/.test(line)) actions.push(line.replace(/^次回:\s*/, ''));
    }
  }
  return { analysisOnly, actions: [...new Set(actions)] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateProfitPreview(d: Record<string, any>): { total: number; details: string[]; praise: string; marketTip: string } {
  let total = 0;
  const details: string[] = [];

  if (d.harvest_amount) {
    const m = String(d.harvest_amount).match(/(\d+)\s*(kg|キロ)/i);
    if (m) {
      const kg = parseInt(m[1]);
      const amt = kg * 800;
      total += amt;
      details.push(`収穫 ${kg}kg × 800円/kg = +${amt >= 10000 ? (amt / 10000).toFixed(1) + '万円' : amt.toLocaleString() + '円'}`);
    }
  }

  const praises = [];
  if (d.fertilizer) praises.push('施肥作業、お疲れさまです');
  if (d.pest_status) praises.push('早期対応、的確です');
  if (d.harvest_amount) praises.push('収穫作業、お疲れさまです');
  if (d.house_data) praises.push('環境計測、継続できています');
  const praise = praises.length > 0 ? praises[0] + '。' : '本日もお疲れさまです。';

  const marketTip = total > 0 ? '※ 収穫量 × 800円/kg で試算。市場価格により変動します。' : '';

  return { total, details, praise, marketTip };
}

/* ── IndexedDB Media Storage ── */
const MEDIA_DB = 'agri-buddy-media';
const MEDIA_STORE = 'media';
const MAX_MEDIA_PER_RECORD = 5;

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('recordId', 'recordId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveMediaBlob(recordId: string, blob: Blob, type: string): Promise<number> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.add({ recordId, blob, type, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

async function loadMediaForRecord(recordId: string): Promise<{ id: number; blob: Blob; type: string }[]> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAll(recordId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteMediaForRecord(recordId: string): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAllKeys(recordId);
    req.onsuccess = () => {
      const keys = req.result;
      keys.forEach(k => store.delete(k));
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function updateMediaRecordId(oldId: string, newId: string): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAll(oldId);
    req.onsuccess = () => {
      const items = req.result;
      items.forEach(item => { item.recordId = newId; store.put(item); });
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── Validation Guards ── */
function isValidTemp(v: number): boolean { return v >= -20 && v <= 60; }
function isValidHumidity(v: number): boolean { return v >= 0 && v <= 100; }

/* ── localStorage ── */
function loadRecs(): LocalRecord[] { try { return JSON.parse(localStorage.getItem(SK_RECORDS) || '[]'); } catch { return []; } }
function saveRecLS(r: LocalRecord) { const rs = loadRecs(); rs.push(r); localStorage.setItem(SK_RECORDS, JSON.stringify(rs)); }
function markSync(id: string) { const rs = loadRecs(); localStorage.setItem(SK_RECORDS, JSON.stringify(rs.map(r => r.id === id ? { ...r, synced: true } : r))); }
function getUnsynced() { return loadRecs().filter(r => !r.synced); }
function loadSession(): LastSession | null { try { return JSON.parse(localStorage.getItem(SK_SESSION) || 'null'); } catch { return null; } }
function saveSession(s: LastSession) { localStorage.setItem(SK_SESSION, JSON.stringify(s)); }

/* ── Sanitize ── */
function sanitizeRecords() {
  try {
    const recs = loadRecs();
    let dirty = false;
    const cleaned = recs.map(r => {
      if (!r.house_data) return r;
      let changed = false;
      const hd = { ...r.house_data };
      if (hd.max_temp !== null && !isValidTemp(hd.max_temp)) { hd.max_temp = null; changed = true; }
      if (hd.min_temp !== null && !isValidTemp(hd.min_temp)) { hd.min_temp = null; changed = true; }
      if (hd.humidity !== null && !isValidHumidity(hd.humidity)) { hd.humidity = null; changed = true; }
      const allNull = hd.max_temp === null && hd.min_temp === null && hd.humidity === null;
      if (changed) { dirty = true; return { ...r, house_data: allNull ? null : hd }; }
      return r;
    });
    if (dirty) localStorage.setItem(SK_RECORDS, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

/* ── Deep Clean (one-time migration) ── */
const SK_DEEP_CLEANED = 'agri-buddy-deep-cleaned-v1';
function deepClean() {
  try {
    if (localStorage.getItem(SK_DEEP_CLEANED)) return;
    const recs = loadRecs();
    let dirty = false;
    const cleaned = recs.map(r => {
      let changed = false;
      // Fix string-typed temp/humidity
      if (r.house_data) {
        const hd = { ...r.house_data };
        if (typeof hd.max_temp === 'string') { const n = parseFloat(hd.max_temp); hd.max_temp = isNaN(n) ? null : n; changed = true; }
        if (typeof hd.min_temp === 'string') { const n = parseFloat(hd.min_temp); hd.min_temp = isNaN(n) ? null : n; changed = true; }
        if (typeof hd.humidity === 'string') { const n = parseFloat(hd.humidity); hd.humidity = isNaN(n) ? null : n; changed = true; }
        // Re-validate
        if (hd.max_temp !== null && !isValidTemp(hd.max_temp)) { hd.max_temp = null; changed = true; }
        if (hd.min_temp !== null && !isValidTemp(hd.min_temp)) { hd.min_temp = null; changed = true; }
        if (hd.humidity !== null && !isValidHumidity(hd.humidity)) { hd.humidity = null; changed = true; }
        const allNull = hd.max_temp === null && hd.min_temp === null && hd.humidity === null;
        if (changed) { dirty = true; return { ...r, house_data: allNull ? null : hd }; }
      }
      return r;
    }).filter(r => {
      // Remove records where ALL fields are empty/null (only if older than 30 days)
      const hasData = r.work_log || r.plant_status !== '良好' || r.fertilizer || r.pest_status ||
        r.harvest_amount || r.material_cost || r.work_duration || r.fuel_cost || r.house_data;
      const age = Date.now() - (r.timestamp || 0);
      if (!hasData && age > 30 * 24 * 60 * 60 * 1000) { dirty = true; return false; }
      return true;
    });
    if (dirty) localStorage.setItem(SK_RECORDS, JSON.stringify(cleaned));
    localStorage.setItem(SK_DEEP_CLEANED, '1');
  } catch { /* ignore */ }
}

/* ── Calendar ── */
function getCalDays(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let d = 1; d <= dim; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

/* ── Consultation Sheet ── */
function buildConsultationSheet(text: string, weather?: { description: string; maxTemp: number; minTemp: number } | null): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const lines = [
    `【営農相談シート】`,
    `日付: ${dateStr}`,
    `営農者: _______________`,
    `就農地: 長崎県長崎市茂木町`,
    ``,
    `【相談内容】`,
    text,
    ``,
  ];
  if (weather) {
    lines.push(
      `【当日の天気】`,
      `${weather.description}、最高${weather.maxTemp}℃ / 最低${weather.minTemp}℃`,
      ``,
    );
  }
  lines.push(
    `【相談先】`,
    `- 長崎県新規就農相談センター: 095-895-2946`,
    `- JA長崎せいひ: 095-838-5200`,
    `- よりそいホットライン: 0120-279-338（24時間無料）`,
  );
  return lines.join('\n');
}

/* ── Official Report ── */
function generateOfficialReport(records: LocalRecord[], startYear: number, startMonth: number, months: number): string {
  const start = new Date(startYear, startMonth, 1);
  const end = new Date(startYear, startMonth + months, 0);

  const rangeRecs = records.filter(r => {
    const d = new Date(r.date);
    return d >= start && d <= end;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const periodLabel = months === 1
    ? `${startYear}年${startMonth + 1}月`
    : `${startYear}年${startMonth + 1}月 ～ ${end.getFullYear()}年${end.getMonth() + 1}月`;

  const today = new Date();
  const reportDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  let rpt = '';
  rpt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  rpt += `  就 農 状 況 報 告 書\n`;
  rpt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  rpt += `報告期間: ${periodLabel}\n`;
  rpt += `報告日: ${reportDate}\n`;
  rpt += `営農者: _______________\n`;
  rpt += `就農地: 長崎県長崎市茂木町\n`;
  rpt += `主要作目: 枇杷（ハウス栽培）\n\n`;

  if (rangeRecs.length === 0) {
    rpt += `この期間の記録はありません。\n`;
    return rpt;
  }

  rpt += `─────────────────────────────\n`;
  rpt += `■ 1. 経営概況\n`;
  rpt += `─────────────────────────────\n`;
  rpt += `  記録日数: ${rangeRecs.length}日\n`;
  const locs = [...new Set(rangeRecs.map(r => r.location))];
  rpt += `  圃場: ${locs.join(', ')}\n\n`;

  rpt += `─────────────────────────────\n`;
  rpt += `■ 2. 作業実績\n`;
  rpt += `─────────────────────────────\n`;
  const workCounts: Record<string, number> = {};
  rangeRecs.forEach(r => {
    if (r.work_log) r.work_log.split('・').forEach(w => { workCounts[w] = (workCounts[w] || 0) + 1; });
  });
  rpt += `  作業種別          回数\n`;
  Object.entries(workCounts).forEach(([w, c]) => {
    rpt += `  ${w.padEnd(16, '　')}${c}回\n`;
  });
  rpt += `  合計作業日数: ${rangeRecs.length}日\n`;

  const durRecs = rangeRecs.filter(r => r.work_duration);
  if (durRecs.length > 0) {
    const totalHours = durRecs.reduce((s, r) => {
      const m = r.work_duration.match(/(\d+)/);
      return s + (m ? parseInt(m[1]) : 0);
    }, 0);
    rpt += `  合計作業時間: 約${totalHours}時間（${durRecs.length}日分記録）\n`;
  } else {
    rpt += `  合計作業時間: -（未記録）\n`;
  }
  rpt += '\n';

  rpt += `─────────────────────────────\n`;
  rpt += `■ 3. 経営収支\n`;
  rpt += `─────────────────────────────\n`;
  rpt += `【支出】\n`;

  const fertRecs = rangeRecs.filter(r => r.fertilizer);
  if (fertRecs.length > 0) {
    rpt += `  肥料費:\n`;
    fertRecs.forEach(r => { rpt += `    ${r.date}: ${r.fertilizer}\n`; });
  } else {
    rpt += `  肥料費: 記録なし\n`;
  }

  const costRecs = rangeRecs.filter(r => r.material_cost);
  if (costRecs.length > 0) {
    rpt += `  資材費:\n`;
    costRecs.forEach(r => { rpt += `    ${r.date}: ${r.material_cost}\n`; });
    const totalCost = costRecs.reduce((s, r) => {
      const m = r.material_cost.match(/(\d+)/);
      return s + (m ? parseInt(m[1]) : 0);
    }, 0);
    rpt += `  資材費小計: ¥${totalCost.toLocaleString()}\n`;
  } else {
    rpt += `  資材費: 記録なし\n`;
  }

  const fuelRecs = rangeRecs.filter(r => r.fuel_cost);
  if (fuelRecs.length > 0) {
    rpt += `  燃料費:\n`;
    fuelRecs.forEach(r => { rpt += `    ${r.date}: ${r.fuel_cost}\n`; });
  } else {
    rpt += `  燃料費: 記録なし\n`;
  }

  rpt += `\n【収入】\n`;
  const harvestRecs = rangeRecs.filter(r => r.harvest_amount);
  if (harvestRecs.length > 0) {
    rpt += `  収穫実績:\n`;
    harvestRecs.forEach(r => { rpt += `    ${r.date}: ${r.harvest_amount}\n`; });
    const totalKg = harvestRecs.reduce((s, r) => {
      const m = r.harvest_amount.match(/(\d+)/);
      return s + (m ? parseInt(m[1]) : 0);
    }, 0);
    rpt += `  収穫量合計: 約${totalKg}（数値合算）\n`;
  } else {
    rpt += `  収穫実績: 記録なし\n`;
  }
  rpt += `  出荷先: -（要記入）\n`;
  rpt += `  売上（実績/予測）: -（要記入）\n\n`;

  rpt += `─────────────────────────────\n`;
  rpt += `■ 4. 栽培環境データ\n`;
  rpt += `─────────────────────────────\n`;
  const envRecs = rangeRecs.filter(r => r.house_data);
  if (envRecs.length > 0) {
    const maxTemps = envRecs.map(r => r.house_data!.max_temp).filter((v): v is number => v !== null);
    const minTemps = envRecs.map(r => r.house_data!.min_temp).filter((v): v is number => v !== null);
    const hums = envRecs.map(r => r.house_data!.humidity).filter((v): v is number => v !== null);
    rpt += `  平均最高気温: ${maxTemps.length ? (maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length).toFixed(1) + '℃' : '-'}\n`;
    rpt += `  平均最低気温: ${minTemps.length ? (minTemps.reduce((a, b) => a + b, 0) / minTemps.length).toFixed(1) + '℃' : '-'}\n`;
    rpt += `  平均湿度: ${hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) + '%' : '-'}\n`;
    rpt += `  計測日数: ${envRecs.length}日\n`;
  } else {
    rpt += `  環境データ: 未計測\n`;
  }
  rpt += '\n';

  rpt += `─────────────────────────────\n`;
  rpt += `■ 5. 病害虫・生育異常\n`;
  rpt += `─────────────────────────────\n`;
  const pestRecs = rangeRecs.filter(r => r.pest_status && r.pest_status !== 'なし' && r.pest_status);
  const issueRecs = rangeRecs.filter(r => r.plant_status && r.plant_status !== '良好');
  if (pestRecs.length > 0 || issueRecs.length > 0) {
    pestRecs.forEach(r => { rpt += `  ${r.date}: [病害虫] ${r.pest_status}\n`; });
    issueRecs.forEach(r => { rpt += `  ${r.date}: [生育] ${r.plant_status}\n`; });
  } else {
    rpt += `  特記事項なし\n`;
  }
  rpt += '\n';

  rpt += `─────────────────────────────\n`;
  rpt += `■ 6. 課題と改善策（AI分析）\n`;
  rpt += `─────────────────────────────\n`;
  const lastWithAdvice = [...rangeRecs].reverse().find(r => r.strategic_advice);
  if (lastWithAdvice) {
    rpt += `  ${lastWithAdvice.strategic_advice.replace(/\n/g, '\n  ')}\n`;
  } else {
    rpt += `  現状維持で問題なし\n`;
  }
  rpt += '\n';

  rpt += `─────────────────────────────\n`;
  rpt += `■ 7. 今後の営農計画\n`;
  rpt += `─────────────────────────────\n`;
  rpt += `  （次期の作付・投資計画等を記入）\n\n`;

  rpt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  rpt += `自動生成 by ${APP_NAME} | ${reportDate}\n`;
  rpt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return rpt;
}

/* ═══════════════════════════════════════════
   ConfirmField — diary-style row layout
   ═══════════════════════════════════════════ */
function ConfirmField({ item, onUpdate }: { item: ConfirmItem; onUpdate: (key: string, val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-stone-300">
      <p className="text-base font-medium text-stone-400 w-20 shrink-0">{item.label}</p>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onUpdate(item.key, draft); setEditing(false); } }}
            className="w-full text-xl font-bold text-stone-900 bg-transparent border-b-2 border-amber-400 outline-none py-1" />
        ) : (
          <p className="text-xl font-bold text-stone-900 truncate">{item.value || '-'}</p>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { onUpdate(item.key, draft); setEditing(false); }}
            className="p-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 btn-press"><Check className="w-5 h-5" /></button>
          <button onClick={() => { setDraft(item.value); setEditing(false); }}
            className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 btn-press"><X className="w-5 h-5" /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="p-2 rounded-full hover:bg-white/60 text-stone-400 shrink-0 btn-press"><Pencil className="w-5 h-5" /></button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Chart Tooltip
   ═══════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-stone-200/50 text-sm">
      <p className="font-bold text-stone-600 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => p.value != null && (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.dataKey === 'max_temp' ? '最高' : '最低'}: {p.value}℃
        </p>
      ))}
    </div>
  );
}

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
  const [partial, setPartial] = useState<PartialSlots>({});
  const [bump, setBump] = useState<string[] | null>(null);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high' | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendSync, setPendSync] = useState(0);
  const [lastSess, setLastSess] = useState<LastSession | null>(null);
  const [curLoc, setCurLoc] = useState(DEFAULT_LOC);
  const [photoCount, setPhotoCount] = useState(0);

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
  const locRef = useRef(DEFAULT_LOC);
  const photoRef = useRef<HTMLInputElement>(null);
  const photoTriggeredRef = useRef(false);
  const photoWaitingRef = useRef(false);

  // Follow-up refs
  const followUpActiveRef = useRef(false);
  const followUpIndexRef = useRef(0);
  const followUpQueueRef = useRef<FollowUpStep[]>([]);
  const isFirstQuestionRef = useRef(false);
  const autoTransitionRef = useRef(false);
  const turboSkipRef = useRef(false);
  const sosDetectedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingDataRef = useRef<Record<string, any>>({});
  const advanceFollowUpRef = useRef<() => void>(() => {});

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
    fetchWeather().then(setOutdoor);
    setIsOnline(navigator.onLine);
    setPendSync(getUnsynced().length);
    const prev = loadSession();
    if (prev) {
      // 助詞付き誤検出値（例:「て温度はハウス」）が永続化されていたらリセット
      if (/[はがをのにでもへとてで](?:ハウス|畑|園|圃場)$/.test(prev.location)) prev.location = DEFAULT_LOC;
      setLastSess(prev); setCurLoc(prev.location);
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

  useEffect(() => () => { try { recogRef.current?.stop(); } catch {} clr(); window.speechSynthesis?.cancel(); }, [clr]);

  /* ── Build confirm items ── */
  const buildConfirmItems = useCallback((): ConfirmItem[] => {
    const d = pendingDataRef.current;
    const items: ConfirmItem[] = [];
    if (d.ocr_date) items.push({ key: 'ocr_date', label: '日付', value: d.ocr_date });
    if (d.work_log) items.push({ key: 'work_log', label: '作業内容', value: d.work_log });
    if (d.house_data) {
      const hd = d.house_data as HouseData;
      if (hd.max_temp !== null) items.push({ key: 'max_temp', label: '最高気温', value: `${hd.max_temp}℃` });
      if (hd.min_temp !== null) items.push({ key: 'min_temp', label: '最低気温', value: `${hd.min_temp}℃` });
      if (hd.humidity !== null) items.push({ key: 'humidity', label: '湿度', value: `${hd.humidity}%` });
    }
    if (d.fertilizer) items.push({ key: 'fertilizer', label: '肥料', value: d.fertilizer });
    if (d.pest_status) items.push({ key: 'pest_status', label: '病害虫', value: d.pest_status });
    if (d.harvest_amount) items.push({ key: 'harvest_amount', label: '収穫', value: d.harvest_amount });
    if (d.material_cost) items.push({ key: 'material_cost', label: '資材費', value: d.material_cost });
    if (d.fuel_cost) items.push({ key: 'fuel_cost', label: '燃料費', value: d.fuel_cost });
    if (d.work_duration) items.push({ key: 'work_duration', label: '作業時間', value: d.work_duration });
    if (d.plant_status && d.plant_status !== '良好') items.push({ key: 'plant_status', label: '所見', value: d.plant_status });
    return items;
  }, []);

  /* ── Show Confirm Screen ── */
  const showConfirmScreen = useCallback(() => {
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    setFollowUpInfo(null);
    const items = buildConfirmItems();
    setConfirmItems(items);
    setPhase('CONFIRM');

    const dur = pendingDataRef.current.work_duration;
    if (dur) {
      const hm = dur.match(/(\d+)/);
      if (hm && parseInt(hm[1]) >= 4) {
        speak('ながい作業、おつかれさま。むりは禁物。15分やすみませんか？');
      }
    }
  }, [buildConfirmItems]);

  /* ── OCR Handler ── */
  const handleOcr = useCallback(async (file: File) => {
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
      if (!pendingDataRef.current || Object.keys(pendingDataRef.current).length === 0) {
        pendingDataRef.current = {};
      }
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
      // OCR結果が空なら白画面を防止してIDLEに戻す
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
  }, [showConfirmScreen]);

  /* ── Save from Confirm Screen ── */
  const saveFromConfirm = useCallback(() => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} recogRef.current = null; }
    clr();
    window.speechSynthesis?.cancel();
    const d = pendingDataRef.current;

    for (const item of confirmItems) {
      const raw = item.value;
      switch (item.key) {
        case 'work_log': d.work_log = raw; break;
        case 'max_temp': {
          const n = parseFloat(raw);
          if (!isNaN(n) && d.house_data) d.house_data.max_temp = n;
          break;
        }
        case 'min_temp': {
          const n = parseFloat(raw);
          if (!isNaN(n) && d.house_data) d.house_data.min_temp = n;
          break;
        }
        case 'humidity': {
          const n = parseFloat(raw);
          if (!isNaN(n) && d.house_data) d.house_data.humidity = n;
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
      }
    }

    const loc = locRef.current;
    const profit = calculateProfitPreview(d);

    // Generate advice locally
    const slots: PartialSlots = {
      work_log: d.work_log, plant_status: d.plant_status,
      fertilizer: d.fertilizer, pest_status: d.pest_status,
      harvest_amount: d.harvest_amount, material_cost: d.material_cost,
      work_duration: d.work_duration, fuel_cost: d.fuel_cost,
    };
    if (d.house_data) {
      if (d.house_data.max_temp !== null) slots.max_temp = d.house_data.max_temp;
      if (d.house_data.min_temp !== null) slots.min_temp = d.house_data.min_temp;
      if (d.house_data.humidity !== null) slots.humidity = d.house_data.humidity;
    }
    const conf = calcConfidence(slots);
    const adviceText = d.advice || generateAdvice(slots, conf);
    const strategicText = d.strategic_advice || generateStrategicAdvice(slots);
    const adminText = d.admin_log || generateAdminLog(slots, loc);

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
      synced: false, timestamp: Date.now(),
    };
    saveRecLS(rec); setPendSync(p => p + 1);
    saveSession({ location: loc, work: d.work_log || '', date: rec.date });
    // Update pending media to final record ID
    updateMediaRecordId(pendingMediaId, rec.id).catch(() => {});
    setHistVer(v => v + 1);
    setPhotoCount(0);
    setConfirmItems([]);
    // Clean up media preview URLs
    mediaPreview.forEach(m => URL.revokeObjectURL(m.url));
    setMediaPreview([]);

    // 会話状態フルクリア（ゴーストテキスト + 保存後ループ防止）
    setConv([]);
    setTranscript('');
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    photoWaitingRef.current = false;
    setFollowUpInfo(null);
    setPartial({});
    setBump(null);
    setConfidence(null);

    // SOS branch — save completed, now transition to MENTOR
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

    // Celebration overlay
    setCelebrationProfit(profit.total);
    setShowCelebration(true);
    setTimeout(() => setShowCelebration(false), 3500);

    if (profit.total > 0) {
      const yen = profit.total >= 10000 ? `${(profit.total / 10000).toFixed(1)}万円` : `${profit.total.toLocaleString()}円`;
      const profitMsg = `きょうの見込み増益: 推定${yen}`;
      setProfitPreview({ total: profit.total, details: profit.details, message: profitMsg, praise: profit.praise, marketTip: profit.marketTip });
      const fullMsg = `${profit.praise} ${profitMsg}。`;
      setAiReply(fullMsg); setPhase('IDLE');
      speak(fullMsg);
    } else {
      setProfitPreview(null);
      const msg = 'きょうもおつかれさま！記録を保存しました。';
      setAiReply(msg); setPhase('IDLE');
      speak(msg);
    }
    if (navigator.onLine) setTimeout(syncRecs, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmItems, photoCount, syncRecs, pendingMediaId, clr]);

  /* ── Update confirm item ── */
  const updateConfirmItem = useCallback((key: string, val: string) => {
    setConfirmItems(prev => prev.map(it => it.key === key ? { ...it, value: val } : it));
  }, []);

  /* ── Start Listening ── */
  const startListen = useCallback(() => {
    try {
      const r = createRecog(); if (!r) return;
      chunksRef.current = ''; let spoke = false;
      photoTriggeredRef.current = false;
      autoTransitionRef.current = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        t = correctAgriTerms(t);
        chunksRef.current = t; setTranscript(t); spoke = true;

        // Voice command auto-transition
        if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }

        if (followUpActiveRef.current) {
          if (DONE_RE.test(t)) {
            autoTransitionRef.current = true;
            silRef.current = setTimeout(() => { try { r.stop(); } catch {} recogRef.current = null; sasRef.current(); }, 200);
          } else if (SKIP_RE.test(t)) {
            autoTransitionRef.current = true;
            silRef.current = setTimeout(() => { try { r.stop(); } catch {} recogRef.current = null; sasRef.current(); }, 100);
          } else if (CONFIRM_RE.test(t)) {
            autoTransitionRef.current = true;
            silRef.current = setTimeout(() => { try { r.stop(); } catch {} recogRef.current = null; sasRef.current(); }, 300);
          }
        } else if (CONFIRM_RE.test(t)) {
          silRef.current = setTimeout(() => { try { r.stop(); } catch {} recogRef.current = null; sasRef.current(); }, 500);
        }
      };
      r.onerror = () => {};
      r.onend = () => {
        if (!recogRef.current) return;
        clr();
        if (spoke && followUpActiveRef.current) {
          if (autoTransitionRef.current) {
            autoTransitionRef.current = false;
            return; // silRefのsetTimeoutがsasを呼ぶ
          }
          // 通常の発話完了 → 即送信（REVIEWING廃止）
          recogRef.current = null;
          sasRef.current();
          return;
        }
        if (spoke) {
          setPhase('REVIEWING');
        } else {
          if (followUpActiveRef.current) setPhase('FOLLOW_UP');
          else setPhase('IDLE');
        }
      };
      r.start(); recogRef.current = r; setPhase('LISTENING'); setTranscript('');
      maxRef.current = setTimeout(() => { try { r.stop(); } catch {} }, MAX_LISTEN_MS);
    } catch {}
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
      showConfirmScreen();
      return;
    }
    const step = queue[followUpIndexRef.current];
    const question = FOLLOW_UP_QUESTIONS[step] + (step === 'PHOTO' ? '　「次へ」でとばせます。' : '　なければ「次へ」。');
    setFollowUpInfo({ label: FOLLOW_UP_QUESTIONS[step], current: followUpIndexRef.current + 1, total: queue.length });

    // ゴーストテキスト防止: BREATHING前にクリア
    setTranscript('');
    chunksRef.current = '';

    if (isFirstQuestionRef.current) {
      // 初回はBREATHINGスキップ → 即質問
      isFirstQuestionRef.current = false;
      turboSkipRef.current = false;
      setPhase('FOLLOW_UP');
      speak(question).then(() => {
        if (followUpActiveRef.current && step !== 'PHOTO') setTimeout(() => startListen(), 600);
      });
    } else {
      const breathMs = turboSkipRef.current ? 500 : BREATHING_MS;
      turboSkipRef.current = false;
      setPhase('BREATHING');
      setTimeout(() => {
        // ゴーストテキスト防止: setTimeout内でも再クリア
        setTranscript('');
        chunksRef.current = '';
        setPhase('FOLLOW_UP');
        speak(question).then(() => {
          if (followUpActiveRef.current && step !== 'PHOTO') {
            setTimeout(() => startListen(), 600);
          }
        });
      }, breathMs);
    }
  }, [showConfirmScreen, startListen]);

  useEffect(() => { advanceFollowUpRef.current = advanceFollowUp; }, [advanceFollowUp]);

  /* ── Stop & Send ── */
  const stopAndSend = useCallback(async () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} recogRef.current = null; }
    clr();
    const text = chunksRef.current.trim();

    // ── Follow-up mode ──
    if (followUpActiveRef.current) {
      // SOS detection inside interview — flag only, handle at save time
      if (SOS_RE.test(text)) {
        sosDetectedRef.current = true;
      }

      // 「以上です」→ 全質問スキップ → CONFIRM直行
      if (DONE_RE.test(text)) {
        setTranscript('');
        showConfirmScreen();
        return;
      }

      const step = followUpQueueRef.current[followUpIndexRef.current];
      const cleaned = text.replace(/写真[を]?撮って|カメラ[を]?起動|撮影して|撮るよ/g, '').trim();
      const isSkip = !cleaned || SKIP_RE.test(cleaned);

      // FERTILIZER/PESTステップで1-2文字の発話はノイズ→リトライ
      if (!isSkip && cleaned.length > 0 && cleaned.length <= 2 && (step === 'FERTILIZER' || step === 'PEST')) {
        speak('もう一度お願いします');
        setTranscript('');
        setTimeout(() => startListen(), 500);
        return;
      }

      if (step === 'PHOTO') {
        if (isSkip) {
          setTranscript('');
          turboSkipRef.current = true;
          followUpIndexRef.current++;
          advanceFollowUpRef.current();
          return;
        }
        photoWaitingRef.current = true;
        setTranscript('');
        return; // 遷移しない — onChange待ち
      }

      if (!isSkip && step) {
        let matched = false;
        const allSteps: FollowUpStep[] = ['WORK', 'HOUSE_TEMP', 'FERTILIZER', 'PEST', 'HARVEST', 'COST', 'DURATION', 'PHOTO'];
        for (const s of allSteps) {
          if (s === 'PHOTO') continue;
          if (CLASSIFY_RE[s].test(cleaned)) {
            matched = true;
            switch (s) {
              case 'WORK': pendingDataRef.current.work_log = (pendingDataRef.current.work_log ? pendingDataRef.current.work_log + '・' : '') + cleaned; break;
              case 'HOUSE_TEMP': {
                const tempMatch = cleaned.match(/(\d+)\s*[度℃]/g);
                if (tempMatch) {
                  const nums = tempMatch.map(t => parseInt(t.replace(/[^\d]/g, ''))).filter(isValidTemp);
                  if (nums.length >= 2) {
                    pendingDataRef.current.house_data = { max_temp: Math.max(...nums), min_temp: Math.min(...nums), humidity: null };
                  } else if (nums.length === 1) {
                    pendingDataRef.current.house_data = { max_temp: nums[0], min_temp: null, humidity: null };
                  }
                }
                break;
              }
              case 'FERTILIZER': pendingDataRef.current.fertilizer = (pendingDataRef.current.fertilizer ? pendingDataRef.current.fertilizer + '、' : '') + cleaned; break;
              case 'PEST': pendingDataRef.current.pest_status = cleaned; break;
              case 'HARVEST': pendingDataRef.current.harvest_amount = cleaned; break;
              case 'COST': pendingDataRef.current.material_cost = cleaned; break;
              case 'DURATION': pendingDataRef.current.work_duration = cleaned; break;
            }
          }
        }

        if (!matched) {
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
                const bare = parseInt(cleaned);
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
      }

      setTranscript('');
      if (isSkip) turboSkipRef.current = true;
      followUpIndexRef.current++;
      advanceFollowUpRef.current();
      return;
    }

    // ── Normal mode ──
    if (!text) { setPhase('IDLE'); return; }

    // ── SOS Detection ──
    if (SOS_RE.test(text)) {
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

    const locOvr = detectLocationOverride(text, locRef.current);
    if (locOvr) setCurLoc(locOvr);

    const msg: ConvMessage = { role: 'user', text };
    const uc = [...convRef.current, msg];
    setConv(uc); setPhase('THINKING'); setTranscript('');

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: uc, partial, location: locOvr || locRef.current }),
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
      setAiReply(d.reply); setPartial({});
      if (d.house_data) setTodayHouse(d.house_data);
      if (d.advice) setTodayAdvice(d.advice);
      if (d.admin_log) setTodayLog(d.admin_log);
      if (d.confidence) setConfidence(d.confidence);

      await speak(d.reply);

      const queue: FollowUpStep[] = [];
      if (!d.house_data) queue.push('HOUSE_TEMP');
      if (!d.fertilizer) queue.push('FERTILIZER');
      if (!d.pest_status) queue.push('PEST');
      if (!d.harvest_amount) queue.push('HARVEST');
      if (!d.material_cost && !d.fuel_cost) queue.push('COST');
      if (!d.work_duration) queue.push('DURATION');
      queue.push('PHOTO');

      pendingDataRef.current = { ...d };

      if (queue.length > 0) {
        followUpActiveRef.current = true;
        followUpIndexRef.current = 0;
        followUpQueueRef.current = queue;
        advanceFollowUpRef.current();
      } else {
        showConfirmScreen();
      }
    } catch {
      setAiReply('オフラインです。ローカル保存しました。'); setPhase('IDLE');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partial, clr, syncRecs, photoCount, showConfirmScreen]);

  useEffect(() => { sasRef.current = stopAndSend; }, [stopAndSend]);

  /* ── Confirm Follow-Up Step (次へ) ── */
  const confirmFollowUpStep = useCallback(() => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} recogRef.current = null; }
    clr();
    sasRef.current();
  }, [clr]);

  /* ── Skip Follow-Up ── */
  const skipFollowUp = useCallback(() => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} recogRef.current = null; }
    clr(); window.speechSynthesis?.cancel();
    photoWaitingRef.current = false;
    setTranscript('');
    followUpIndexRef.current++;
    advanceFollowUpRef.current();
  }, [clr]);

  /* ── Skip ALL ── */
  const skipAllFollowUp = useCallback(() => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} recogRef.current = null; }
    clr(); window.speechSynthesis?.cancel();
    setTranscript('');
    followUpIndexRef.current = followUpQueueRef.current.length;
    advanceFollowUpRef.current();
  }, [clr]);

  /* ── Start Interview (question-first flow) ── */
  const startInterview = useCallback(() => {
    pendingDataRef.current = {};
    setTranscript(''); setAiReply(''); setPartial({}); setConv([]); setProfitPreview(null);
    const queue: FollowUpStep[] = ['WORK','HOUSE_TEMP','FERTILIZER','PEST','HARVEST','COST','DURATION','PHOTO'];
    followUpActiveRef.current = true;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = queue;
    isFirstQuestionRef.current = true;
    advanceFollowUpRef.current();
  }, []);

  /* ── Begin Session ── */
  const begin = useCallback(() => {
    startInterview();
  }, [startInterview]);

  const reset = () => {
    try { recogRef.current?.stop(); } catch {} clr(); window.speechSynthesis?.cancel();
    followUpActiveRef.current = false;
    followUpIndexRef.current = 0;
    followUpQueueRef.current = [];
    photoWaitingRef.current = false;
    sosDetectedRef.current = false;
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
    setPartial({}); setBump(null); setConfidence(null); setPhotoCount(0);
    setView('record');
  };

  const onPtrDown = useCallback(() => { if (phase !== 'THINKING' && phase !== 'CONFIRM' && phase !== 'BREATHING' && phase !== 'MENTOR' && phase !== 'REVIEWING') { ptrRef.current = Date.now(); lpRef.current = false; } }, [phase]);
  const onPtrUp = useCallback(() => {
    if (phase === 'THINKING' || phase === 'CONFIRM' || phase === 'BREATHING' || phase === 'MENTOR' || phase === 'REVIEWING') return;
    if (Date.now() - ptrRef.current < 200) {
      if (phase === 'LISTENING') { try { recogRef.current?.stop(); } catch {} }
      else if (phase === 'FOLLOW_UP') startListen();
      else if (conv.length === 0 && !todayHouse && !followUpActiveRef.current) begin();
      else { if (bump) setBump(null); startListen(); }
    } else { lpRef.current = true; if (phase === 'LISTENING') { try { recogRef.current?.stop(); } catch {} } }
  }, [phase, startListen, begin, conv.length, todayHouse, bump]);

  const dateStr = mounted ? (() => {
    const t = new Date();
    return `${t.getMonth() + 1}月${t.getDate()}日（${DAY_NAMES[t.getDay()]}）`;
  })() : '';

  const fmtCalDate = (day: number) => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const todayISO = mounted ? new Date().toISOString().split('T')[0] : '';

  return (
    <main className="min-h-screen pb-48 max-w-lg mx-auto">

      {/* ═══ COMPRESSED HEADER ═══ */}
      <header className="px-5 pt-8 pb-2 fade-up">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-black text-white tracking-wider">{APP_NAME}</h1>
          <div className="flex items-center gap-2">
            {/* Streak badge */}
            {mounted && streak > 0 && (
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${streakColor}`}>
                <Flame className="w-3.5 h-3.5" />
                <span>{streak}日</span>
              </div>
            )}
            {/* Weather pill */}
            {outdoor && outdoor.code >= 0 && (
              <div className={`px-2.5 py-1 rounded-full text-sm font-bold ${CARD_FLAT}`}>
                <span className="text-stone-700">{outdoor.description} {outdoor.temperature}℃</span>
              </div>
            )}
            {/* Sync pill */}
            {mounted && (
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                isOnline ? 'bg-green-500/20 text-green-200 border border-green-400/30' : 'bg-red-500/20 text-red-200 border border-red-400/30 offline-pulse'
              }`}>
                {isOnline ? '同期済' : `未同期${pendSync > 0 ? `(${pendSync})` : ''}`}
              </div>
            )}
            {/* Reset button */}
            {conv.length > 0 && view === 'record' && (
              <button onClick={reset} className="p-1.5 rounded-full hover:bg-white/20 transition-colors btn-press">
                <RotateCcw className="w-5 h-5 text-white/60" />
              </button>
            )}
          </div>
        </div>
        {/* Location subtitle */}
        {mounted && (
          <p className="text-sm font-medium text-white/50 mt-1">
            {curLoc} | {dateStr}
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
            <section className="mx-5 mb-4 fade-up">
              <div className={`p-5 rounded-2xl ${GLASS}`}>
                {/* Step 1: comfort */}
                {mentorStep === 'comfort' && (
                  <>
                    <div className="flex flex-col items-center gap-4 py-6">
                      <HandHeart className="w-16 h-16 text-amber-600" />
                      <p className="text-xl font-bold text-stone-800 text-center leading-relaxed">
                        きもちを受けとめています...
                      </p>
                      {mentorDraft && (
                        <div className={`w-full p-4 rounded-xl ${CARD_FLAT}`}>
                          <p className="text-lg font-medium text-stone-600">{mentorDraft}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {/* Step 2: ask */}
                {mentorStep === 'ask' && (
                  <>
                    <div className="flex flex-col items-center gap-4 py-4">
                      <HandHeart className="w-12 h-12 text-amber-600" />
                      <p className="text-xl font-bold text-stone-800 text-center leading-relaxed mb-2">
                        行政や相談窓口に<br/>相談しますか？
                      </p>
                      <div className="flex gap-3 w-full">
                        <button onClick={() => setMentorStep('sheet')}
                          className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                          <PhoneCall className="w-6 h-6" /> はい
                        </button>
                        <button onClick={reset}
                          className="flex-1 py-5 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                          いいえ
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {/* Step 3: sheet */}
                {mentorStep === 'sheet' && (
                  <>
                    <h2 className="font-display text-2xl font-bold text-stone-900 tracking-wider mb-4">営農相談シート</h2>
                    <pre className="text-lg text-stone-700 whitespace-pre-wrap leading-relaxed font-sans mb-5">{consultSheet}</pre>
                    <div className="flex gap-3">
                      <button onClick={() => {
                        navigator.clipboard.writeText(consultSheet);
                        setMentorCopied(true);
                        setTimeout(() => setMentorCopied(false), 2000);
                      }}
                        className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                        {mentorCopied ? <><Check className="w-6 h-6" /> コピー済</> : <><PhoneCall className="w-5 h-5" /> コピーして相談</>}
                      </button>
                      <button onClick={reset}
                        className="py-4 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                        やめる
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* ═══ CONFIRM SCREEN ═══ */}
          {phase === 'CONFIRM' && confirmItems.length > 0 && (
            <section className="mx-5 mb-4 fade-up">
              <div className={`p-5 rounded-2xl ${GLASS}`}>
                <h2 className="font-display text-2xl tracking-[0.3em] text-stone-900 font-bold mb-2">営 農 日 誌</h2>
                <p className="text-base font-medium text-stone-500 mb-4">タップで修正できます。問題なければ「保存」を押してください。</p>
                <div>
                  {confirmItems.map((item, i) => (
                    <ConfirmField key={`${item.key}-${i}`} item={item} onUpdate={updateConfirmItem} />
                  ))}
                </div>
                <div className="mt-5 flex gap-3">
                  <button onClick={saveFromConfirm}
                    className="flex-1 py-5 rounded-3xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-2xl font-black shadow-lg btn-press flex items-center justify-center gap-2">
                    <Check className="w-7 h-7" /> 保存する
                  </button>
                  <button onClick={reset}
                    className="py-5 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                    <X className="w-6 h-6" /> 破棄
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ═══ IDLE CONTENT ═══ */}
          {phase === 'IDLE' && (
            <>
              {/* Onboarding (first time) */}
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
                        <p className="text-lg font-medium text-stone-700">質問に声で答えるだけ</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">3</span>
                        <p className="text-lg font-medium text-stone-700">「次へ」でスキップ、「以上」で保存</p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* AI Reply (no profit preview = simple save or API response) */}
              {aiReply && !profitPreview && (
                <section className="mx-5 mb-4 fade-up">
                  <div className="p-5 rounded-2xl bg-emerald-50/85 backdrop-blur-xl border border-emerald-200/30 shadow-lg">
                    <p className="text-xs font-bold text-emerald-500 mb-2 tracking-wide">営農分析</p>
                    <p className="text-xl font-bold text-emerald-800 leading-relaxed">{aiReply}</p>
                  </div>
                </section>
              )}

              {/* Profit Preview */}
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

              {/* Weekly count */}
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

              {/* BREATHING — waveform animation */}
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

              {/* FOLLOW-UP QUESTION */}
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
                    <p className="text-base font-medium text-stone-500 mt-2">「次へ」で進む、「終わり」で保存</p>
                  </div>
                </div>
              )}

              {/* FOLLOW-UP captured transcript */}
              {phase === 'FOLLOW_UP' && transcript && (
                <div className="w-full mb-3 fade-up">
                  <div className={`px-4 py-2 rounded-xl ${CARD_FLAT}`}>
                    <p className="text-lg font-bold text-stone-700">{transcript}</p>
                  </div>
                </div>
              )}

              {/* THINKING */}
              {phase === 'THINKING' && (
                <div className="mb-6 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-500 dot-1" />
                  <div className="w-5 h-5 rounded-full bg-amber-500 dot-2" />
                  <div className="w-5 h-5 rounded-full bg-amber-500 dot-3" />
                </div>
              )}

              {/* LISTENING transcript */}
              {phase === 'LISTENING' && transcript && (
                <div className="w-full mb-4 fade-up">
                  <div className={`px-4 py-3 rounded-2xl ${CARD_ACCENT}`}>
                    <p className="text-xl font-bold text-stone-800">{transcript}</p>
                  </div>
                </div>
              )}

              {/* REVIEWING — confirm or retry (non-follow-up only) */}
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

              {/* Live Chips */}
              {phase === 'LISTENING' && liveChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5 justify-center">
                  {liveChips.map((c, i) => (
                    <span key={`${c}-${i}`} className="chip-pop px-3 py-1.5 rounded-full text-base font-bold bg-amber-100/80 text-amber-800 border border-amber-300/50 shadow-sm backdrop-blur-sm">{c}</span>
                  ))}
                </div>
              )}

              {/* Photo/Video count + previews */}
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
                      {phase === 'LISTENING' && <div className="absolute inset-0 rounded-full bg-amber-400/30 listening-ring" />}
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
                                  ? 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] shadow-[0_8px_50px_rgba(255,140,0,0.5)]'
                                  : 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] biwa-pulse shadow-[0_8px_50px_rgba(255,140,0,0.5)]'
                          }
                        `}
                        aria-label="タップして話す"
                      >
                        <Mic className="w-16 h-16 text-white" />
                      </button>
                    </div>
                    <p className="mt-4 text-xl font-bold text-white/70">
                      {phase === 'LISTENING' ? '聞いています... タップで止める'
                        : phase === 'REVIEWING' ? ''
                        : phase === 'THINKING' ? '考え中...'
                        : phase === 'BREATHING' ? '準備中...'
                        : phase === 'FOLLOW_UP' ? 'タップして回答'
                        : '記録開始'}
                    </p>
                  </>
                );
              })()}

              {/* Action buttons row */}
              <div className="mt-4 flex gap-3 w-full">
                {/* Camera + OCR buttons — only during PHOTO step */}
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
                      setTimeout(() => advanceFollowUpRef.current(), 1000);
                    }
                  }} />
                <input ref={ocrInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleOcr(file);
                    e.target.value = '';
                  }} />

                {/* Follow-up action buttons moved to fixed bottom bar */}
              </div>

              {phase === 'IDLE' && (
                <>
                  <p className="mt-5 text-lg font-medium text-white/50 text-center leading-relaxed max-w-xs">
                    タップすると質問が始まります<br/>
                    <span className="text-white/30">「次へ」でスキップ、「以上」で保存</span>
                  </p>
                  {!aiReply && !isFirstTime && (
                    <button onClick={() => ocrInputRef.current?.click()}
                      className={`mt-4 py-3 px-6 rounded-2xl ${CARD_FLAT} flex items-center justify-center gap-2 text-lg font-bold text-stone-700 hover:bg-white/80 btn-press`}>
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

      {/* ═══════════════════════════════════════════
          HISTORY VIEW
          ═══════════════════════════════════════════ */}
      {view === 'history' && mounted && (
        <div className="view-enter">

          {/* ═══ BACK BUTTON ═══ */}
          <section className="mx-5 mb-4">
            <button onClick={() => setView('record')}
              className={`w-full py-4 rounded-2xl ${GLASS} flex items-center justify-center gap-2 text-xl font-bold text-stone-700 hover:bg-white/80 btn-press`}>
              <ChevronLeft className="w-6 h-6" /> 記録に戻る
            </button>
          </section>

          {/* ═══ TREND CHART ═══ */}
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

          {/* ═══ CALENDAR ═══ */}
          <section className="mx-5 mb-4 fade-up">
            <div className={`p-5 rounded-2xl ${GLASS}`}>
              {/* Month navigation */}
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

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1.5 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className={`text-center text-sm font-medium py-1 ${d === '日' ? 'text-red-400' : d === '土' ? 'text-blue-400' : 'text-stone-400'}`}>{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} />;
                  const iso = fmtCalDate(day);
                  const hasRec = recordMap.has(iso);
                  const isToday = iso === todayISO;
                  const isSel = iso === calDate;
                  return (
                    <button key={iso} onClick={() => setCalDate(isSel ? null : iso)}
                      className={`
                        relative aspect-square flex flex-col items-center justify-center rounded-xl text-2xl font-bold transition-all btn-press
                        ${isToday
                          ? 'bg-gradient-to-br from-[#FF8C00] to-[#FF6B00] text-white shadow-md'
                          : isSel
                            ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-400'
                            : hasRec
                              ? 'bg-green-50 text-stone-700 hover:bg-green-100/70'
                              : 'text-stone-700 hover:bg-white/50'
                        }
                      `}>
                      {day}
                      {hasRec && !isToday && <span className="absolute bottom-0.5 text-[11px] font-bold text-green-600">済</span>}
                    </button>
                  );
                })}
              </div>

              {/* Scroll hint */}
              {calDate && (
                <div className="flex items-center justify-center gap-2 py-3 text-stone-400 scroll-hint-bounce">
                  <ChevronDown className="w-5 h-5" />
                  <span className="text-sm font-medium">下にスクロールで詳細</span>
                </div>
              )}

              {/* Report buttons */}
              <div className="mt-4 flex gap-2">
                <button onClick={() => {
                  const rpt = generateOfficialReport(loadRecs(), calMonth.getFullYear(), calMonth.getMonth(), 1);
                  setReportText(rpt); setReportType('month'); setShowReport(true); setReportFullscreen(true);
                }} className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-stone-900/80 text-white text-base font-bold hover:bg-stone-900 btn-press">
                  {calMonth.getMonth() + 1}月レポート
                </button>
                <button onClick={() => {
                  const startMonth = calMonth.getMonth() < 6 ? 0 : 6;
                  const rpt = generateOfficialReport(loadRecs(), calMonth.getFullYear(), startMonth, 6);
                  setReportText(rpt); setReportType('half'); setShowReport(true); setReportFullscreen(true);
                }} className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-base font-bold btn-press">
                  半期報告書
                </button>
              </div>

              {/* Data reset */}
              <div className="mt-4 text-center">
                <button onClick={() => {
                  if (window.confirm('すべてのきろくをけします。もとにもどせません。よろしいですか？')) {
                    if (window.confirm('ほんとうにけしますか？')) {
                      localStorage.removeItem(SK_RECORDS);
                      localStorage.removeItem(SK_SESSION);
                      localStorage.removeItem(SK_DEEP_CLEANED);
                      setHistVer(v => v + 1);
                      setCalDate(null);
                    }
                  }
                }} className="text-xs text-stone-400 hover:text-red-400 transition-colors">
                  データをすべてリセット
                </button>
              </div>
            </div>
          </section>

          {/* ═══ SELECTED DATE DETAIL ═══ */}
          {calSelected && (
            <>
            <section className="mx-2 mb-4 fade-up">
              <div className={`p-5 rounded-2xl ${GLASS}`}>
                <p className="text-4xl font-black text-amber-700 mb-3">{calDate}</p>
                {calSelected.house_data && (
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.max_temp, '℃')}</p><p className="text-xl font-bold text-stone-600">最高</p></div>
                    <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.min_temp, '℃')}</p><p className="text-xl font-bold text-stone-600">最低</p></div>
                    <div><p className="text-5xl font-black text-stone-900">{fmtVal(calSelected.house_data.humidity, '%')}</p><p className="text-xl font-bold text-stone-600">湿度</p></div>
                  </div>
                )}
                {/* Media thumbnails */}
                {selectedMedia.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
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
                {calSelected.estimated_profit != null && calSelected.estimated_profit > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-green-50/70 border border-green-200/50">
                    <p className="text-sm font-bold text-green-700 mb-1">見込み増益</p>
                    <p className="text-lg font-black text-green-800">推定 +{calSelected.estimated_profit >= 10000 ? `${(calSelected.estimated_profit / 10000).toFixed(1)}万円` : `${calSelected.estimated_profit.toLocaleString()}円`}</p>
                  </div>
                )}
                {/* 事実記録 */}
                {calSelected.admin_log && (
                  <div className="mt-3 p-4 rounded-xl bg-stone-50/70 border border-stone-200/50">
                    <p className="text-2xl font-bold text-stone-500 mb-1">事実記録</p>
                    <pre className="text-xl font-medium text-stone-600 whitespace-pre-wrap leading-relaxed font-sans">{calSelected.admin_log}</pre>
                  </div>
                )}
                {/* 営農分析 */}
                {(calSelected.strategic_advice || calSelected.advice) && (() => {
                  const isGeneric = GENERIC_ADVICE_RE.test(calSelected.advice || '') && GENERIC_ADVICE_RE.test(calSelected.strategic_advice || '');
                  if (isGeneric) return (
                    <div className="mt-3 p-3 rounded-xl bg-stone-50/50 border border-stone-200/30">
                      <p className="text-base font-medium text-stone-400">詳細を入力すると分析が表示されます</p>
                    </div>
                  );
                  const { analysisOnly, actions } = extractNextActions(calSelected.advice || '', calSelected.strategic_advice || '');
                  const strategicLines = (calSelected.strategic_advice || '').split('\n').filter(l => !/^次回:\s*/.test(l)).join('\n').trim();
                  return (<>
                    {(strategicLines || analysisOnly) && (
                      <div className="mt-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/50">
                        <p className="text-xl font-bold text-emerald-700 mb-1">営農分析</p>
                        {strategicLines && !GENERIC_ADVICE_RE.test(strategicLines) && (
                          <p className="text-xl font-medium text-emerald-800 whitespace-pre-line mb-2"><Linkify text={strategicLines} /></p>
                        )}
                        {analysisOnly && !GENERIC_ADVICE_RE.test(analysisOnly) && (
                          <p className="text-xl font-medium text-stone-600 whitespace-pre-line leading-relaxed"><Linkify text={analysisOnly} /></p>
                        )}
                      </div>
                    )}
                    {actions.length > 0 && (
                      <div className="mt-3 p-4 rounded-xl bg-orange-50/70 border border-orange-200/50">
                        <p className="text-xl font-bold text-orange-700 mb-1">ネクストアクション</p>
                        <ul className="space-y-1">
                          {actions.map((a, i) => (
                            <li key={i} className="text-xl font-medium text-orange-900 flex items-start gap-2">
                              <span className="text-orange-500 mt-1 shrink-0">▸</span>{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>);
                })()}
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
      )}

      {/* ═══ TAB BAR ═══ */}
      {!isActivePhase && mounted && (
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
      )}

      {/* ═══ CELEBRATION OVERLAY ═══ */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm">
          {Array.from({ length: 20 }, (_, i) => <span key={i} className="confetti-piece" />)}
          <div className="celebration-pop flex flex-col items-center gap-4 p-8">
            <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.5)]">
              <Check className="w-12 h-12 text-white" />
            </div>
            <p className="text-3xl font-black text-white">保存完了</p>
            {celebrationProfit > 0 && (<>
              <p className="text-lg font-bold text-green-200/80">本日の推定収益</p>
              <p className="text-5xl font-black text-green-300">
                +{celebrationProfit >= 10000 ? `${(celebrationProfit / 10000).toFixed(1)}万円` : `${celebrationProfit.toLocaleString()}円`}
              </p>
            </>)}
          </div>
        </div>
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
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-3 bg-gradient-to-t from-stone-900/95 via-stone-900/80 to-transparent">
          <div className="max-w-lg mx-auto flex gap-3">
            <button onClick={confirmFollowUpStep}
              className="flex-[2] rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white flex items-center justify-center gap-2 text-2xl font-black shadow-lg btn-press min-h-[88px]">
              <Check className="w-7 h-7" /> 次へ（保存して進む）
            </button>
            {phase !== 'LISTENING' && (
              <button onClick={skipFollowUp}
                className="flex-1 rounded-2xl bg-stone-200/90 backdrop-blur-xl flex items-center justify-center gap-2 text-xl font-bold text-stone-600 btn-press min-h-[80px]">
                スキップ
              </button>
            )}
            <button onClick={skipAllFollowUp}
              className="rounded-2xl bg-stone-800/90 backdrop-blur-xl flex items-center justify-center px-6 text-xl font-bold text-white btn-press min-h-[80px]">
              以上
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
