import { AGRI_CORRECTIONS, WORK_CHIPS, NAV_NOISE_RE, FILLER_RE, LOCATION_GHOST_RE } from '@/lib/constants';
import type { PartialSlots, ConfirmItem, LocalRecord } from '@/lib/types';
import { isNegativeInput } from '@/lib/logic/advice';

/* ── Location name normalization ── */
const LOCATION_NORMALIZE_MAP: [RegExp, string][] = [
  [/法事の上|宝地の上|ほうじのうえ|ホウジノウエ/i, 'ホウジノウエ'],
  [/[AＡaａ]号?\s*ハウス|ハウス[AＡaａ]/i, 'Aハウス'],
  [/[BＢbｂ]号?\s*ハウス|ハウス[BＢbｂ]/i, 'Bハウス'],
];

export function normalizeLocationName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  for (const [re, normalized] of LOCATION_NORMALIZE_MAP) {
    if (re.test(raw)) return normalized;
  }
  return raw.trim();
}

export function extractCorrections(rawText: string): { original: string; corrected: string }[] {
  const results: { original: string; corrected: string }[] = [];
  if (!rawText) return results;
  for (const [pattern, replacement] of AGRI_CORRECTIONS) {
    const match = rawText.match(pattern);
    if (match && match[0] !== replacement) {
      results.push({ original: match[0], corrected: replacement });
    }
  }
  return results;
}

export function buildRecordChips(rec: LocalRecord): { label: string; color: string }[] {
  const chips: { label: string; color: string }[] = [];
  if (rec.work_log) {
    for (const w of WORK_CHIPS) {
      if (w.p.test(rec.work_log)) chips.push({ label: w.l, color: 'amber' });
    }
  }
  if (rec.house_data?.max_temp != null || rec.house_data?.min_temp != null) {
    const parts: string[] = [];
    if (rec.house_data?.max_temp != null) parts.push(`${rec.house_data.max_temp}℃`);
    if (rec.house_data?.min_temp != null) parts.push(`${rec.house_data.min_temp}℃`);
    chips.push({ label: parts.join(' / '), color: 'blue' });
  }
  if (rec.harvest_amount && !isNegativeInput(rec.harvest_amount))
    chips.push({ label: `収穫 ${rec.harvest_amount}`, color: 'green' });
  if (rec.fertilizer && !isNegativeInput(rec.fertilizer))
    chips.push({ label: `施肥 ${rec.fertilizer}`, color: 'orange' });
  if (rec.pest_status && !isNegativeInput(rec.pest_status))
    chips.push({ label: rec.pest_status, color: 'red' });
  if (rec.work_duration) chips.push({ label: rec.work_duration, color: 'purple' });
  return chips;
}

export function correctAgriTerms(text: string): string {
  let result = text;
  for (const [pattern, replacement] of AGRI_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function extractChips(text: string): string[] {
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

export function detectLocationOverride(text: string, cur: string): string | null {
  // A号ハウス, 山の上の畑 等の複合パターンも検出
  const m = text.match(/([A-Za-zＡ-Ｚａ-ｚ\d０-９]+号?\s*ハウス|山の上の畑|\S+(?:ハウス|畑|園|圃場))/);
  if (!m || m[1] === cur) return null;
  if (/^.+[はがをのにでもへとてで](?:ハウス|畑|園|圃場)$/.test(m[1])) return null;
  return m[1];
}

export function fmtVal(v: number | null | undefined, unit: string): string {
  return v !== null && v !== undefined ? `${v}${unit}` : '-';
}

export function extractNextActions(advice: string, strategic: string): { analysisOnly: string; actions: string[] } {
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
  // 否定語で始まるアクション（「なかったですの様子を見る」等）を除去
  const cleaned = actions.filter(a => {
    const firstSegment = a.split(/[のを、]/)[0];
    return !isNegativeInput(firstSegment);
  });
  // Dedup: exact match + substring containment
  const unique = [...new Set(cleaned)];
  const deduped = unique.filter((a, i) =>
    !unique.some((b, j) => j !== i && b.length > a.length && b.includes(a))
  );
  return { analysisOnly, actions: deduped };
}

export function correctForLog(text: string): string {
  let result = correctAgriTerms(text);
  // 方言→標準農業用語
  result = result
    .replace(/ばさろ(暑|熱)か/g, '非常に高温')
    .replace(/ちょっとばかし/g, '少量')
    .replace(/よかばい|よかたい/g, '良好')
    .replace(/いっちょん/g, '全く')
    .replace(/水をやっ(た|て)/g, '灌水')
    .replace(/薬をかけ(た|て)/g, '薬剤散布');
  // ナビゲーション発言の除去
  result = result.replace(NAV_NOISE_RE, '');
  // フィラー除去
  result = result.replace(FILLER_RE, '').replace(/\s{2,}/g, ' ').trim();
  return result;
}

export function sanitizeLocation(loc: string): string {
  if (LOCATION_GHOST_RE.test(loc)) return '';
  if (/[はがをのにでもへとてで](?:ハウス|畑|園|圃場)$/.test(loc)) return '';
  return loc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSlotsFromPending(d: Record<string, any>): PartialSlots {
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
  return slots;
}

export function buildSlotsFromConfirmItems(items: ConfirmItem[]): PartialSlots {
  const get = (key: string) => items.find(it => it.key === key)?.value || '';
  const slots: PartialSlots = {
    work_log: get('work_log') || undefined,
    plant_status: get('plant_status') || undefined,
    fertilizer: get('fertilizer') || undefined,
    pest_status: get('pest_status') || undefined,
    harvest_amount: get('harvest_amount') || undefined,
    material_cost: get('material_cost') || undefined,
    work_duration: get('work_duration') || undefined,
    fuel_cost: get('fuel_cost') || undefined,
  };
  const maxN = parseFloat(get('max_temp'));
  const minN = parseFloat(get('min_temp'));
  const humN = parseFloat(get('humidity'));
  if (!isNaN(maxN)) slots.max_temp = maxN;
  if (!isNaN(minN)) slots.min_temp = minN;
  if (!isNaN(humN)) slots.humidity = humN;
  return slots;
}

/* ── Voice Correction Parser (CONFIRM画面音声修正) ── */
const CORRECTION_LABEL_MAP: Record<string, string> = {
  '場所': 'location', 'ばしょ': 'location',
  '作業': 'work_log', '作業内容': 'work_log',
  '最高気温': 'max_temp', '最高': 'max_temp',
  '最低気温': 'min_temp', '最低': 'min_temp',
  '湿度': 'humidity',
  '肥料': 'fertilizer', 'ひりょう': 'fertilizer',
  '病害虫': 'pest_status', '害虫': 'pest_status', '病気': 'pest_status',
  '収穫': 'harvest_amount', 'しゅうかく': 'harvest_amount',
  '資材費': 'material_cost', '資材': 'material_cost',
  '燃料費': 'fuel_cost', '燃料': 'fuel_cost',
  '作業時間': 'work_duration', '時間': 'work_duration',
};

const NEGATIVE_CORRECTION_RE = /なし|ない|やってない|ません|ゼロ|０|なかった/;

export function parseVoiceCorrection(text: string): { key: string; value: string }[] {
  const results: { key: string; value: string }[] = [];
  const cleaned = text.replace(/\s+/g, '');

  // Pattern 1: 「XはYに変更」「XをYに変更して」
  const changeRe = /(.+?)[はをの](.+?)に(?:変更|修正|直して|して)/g;
  let m: RegExpExecArray | null;
  while ((m = changeRe.exec(cleaned)) !== null) {
    const label = m[1].trim();
    const value = m[2].trim();
    const key = CORRECTION_LABEL_MAP[label];
    if (key) {
      results.push({ key, value: NEGATIVE_CORRECTION_RE.test(value) ? '' : value });
    }
  }
  if (results.length > 0) return results;

  // Pattern 2: 「最高気温32度」「湿度80パーセント」
  const directRe = /(最高気温|最低気温|最高|最低|湿度|作業時間)\s*(\d+)\s*(度|℃|%|％|パーセント|時間|じかん)?/g;
  while ((m = directRe.exec(cleaned)) !== null) {
    const key = CORRECTION_LABEL_MAP[m[1]];
    if (key) {
      const unit = key === 'humidity' ? '%' : key.includes('temp') ? '℃' : key === 'work_duration' ? '時間' : '';
      results.push({ key, value: `${m[2]}${unit}` });
    }
  }
  if (results.length > 0) return results;

  // Pattern 3: 「肥料なし」「害虫なし」(negation)
  const negRe = /(場所|作業|肥料|ひりょう|病害虫|害虫|病気|収穫|しゅうかく|資材費?|燃料費?|作業時間)[はがを]?(?:なし|ない|やってない|ません|ゼロ|なかった)/g;
  while ((m = negRe.exec(cleaned)) !== null) {
    const key = CORRECTION_LABEL_MAP[m[1]] || CORRECTION_LABEL_MAP[m[1].replace(/費$/, '')];
    if (key) results.push({ key, value: '' });
  }
  if (results.length > 0) return results;

  // Pattern 4: 「場所はBハウス」「肥料は硫安2キロ」
  const simpleRe = /(場所|作業内容?|肥料|ひりょう|病害虫|害虫|収穫|資材費?|燃料費?|作業時間)[はを](.+)/;
  const sm = cleaned.match(simpleRe);
  if (sm) {
    const key = CORRECTION_LABEL_MAP[sm[1]] || CORRECTION_LABEL_MAP[sm[1].replace(/費$/, '')];
    const value = sm[2].replace(/[にへ]?(?:変更|修正|して).*$/, '').trim();
    if (key) {
      results.push({ key, value: NEGATIVE_CORRECTION_RE.test(value) ? '' : value });
    }
  }

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calculateProfitPreview(d: Record<string, any>): { total: number; details: string[]; praise: string; marketTip: string } {
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
