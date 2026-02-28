import type { LocalRecord } from '@/lib/types';
import { APP_NAME } from '@/lib/constants';

export function generateOfficialReport(records: LocalRecord[], startYear: number, startMonth: number, months: number): string {
  const start = new Date(startYear, startMonth, 1);
  const end = new Date(startYear, startMonth + months, 0);

  const rangeRecs = records.filter(r => {
    const d = new Date(r.date);
    return d >= start && d <= end;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

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
    if (r.work_log) String(r.work_log).split('・').forEach(w => { workCounts[w] = (workCounts[w] || 0) + 1; });
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

export function buildConsultationSheet(text: string, weather?: { description: string; maxTemp: number; minTemp: number } | null): string {
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
