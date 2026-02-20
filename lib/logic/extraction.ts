import { AGRI_CORRECTIONS, WORK_CHIPS, NAV_NOISE_RE, FILLER_RE, LOCATION_GHOST_RE } from '@/lib/constants';
import type { PartialSlots } from '@/lib/types';
import { isNegativeInput } from '@/lib/logic/advice';

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
