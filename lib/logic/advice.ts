import type { PartialSlots, Confidence } from '@/lib/types';
import { PEST_VERB_RE, REFERENCE_LINKS } from '@/lib/constants';

/* ── Negative input detection ── */
const NEGATIVE_EXACT_RE = /^(なし|ない|いない|大丈夫|問題ない|異常なし|特になし|特にない|とくにない|特にありません|なかった|なかったです|いなかった|いなかったです|ありませんでした|使いませんでした|やりませんでした|していません|やっていません)$/i;
const NEGATIVE_SUFFIX_RE = /(ません(でした)?|てない|ていない|やってない|してない|していない|なかった(です)?|いなかった(です)?|ありません(でした)?|使わなかった(です)?|使いません(でした)?|かかりません(でした)?|かからなかった(です)?|やりません(でした)?|やらなかった(です)?|あげてない|あげていない|出てない|出ていない|なさそう|なさそうです)$/;

export function isNegativeInput(value: string | undefined): boolean {
  if (!value) return false;
  const t = value.trim();
  // 完全一致は常にチェック。接尾辞パターンは15文字以下のみ適用
  // (「カイガラムシが出ていたけど薬をやっていない」等の複合文を保護)
  return NEGATIVE_EXACT_RE.test(t) || (t.length <= 15 && NEGATIVE_SUFFIX_RE.test(t));
}

export function cleanPestName(raw: string): string {
  return raw.replace(PEST_VERB_RE, '').trim() || raw;
}

export function calcConfidence(slots: PartialSlots): Confidence {
  let filled = 0;
  if (slots.max_temp !== undefined) filled++;
  if (slots.min_temp !== undefined) filled++;
  if (slots.humidity !== undefined) filled++;
  if (slots.work_log) filled++;
  if (slots.plant_status && slots.plant_status !== '良好') filled++;
  if (slots.fertilizer && !isNegativeInput(slots.fertilizer)) filled++;
  if (slots.pest_status && slots.pest_status !== 'なし' && !isNegativeInput(slots.pest_status)) filled++;
  if (slots.harvest_amount && !isNegativeInput(slots.harvest_amount)) filled++;
  if (slots.material_cost) filled++;
  if (filled >= 5) return 'high';
  if (filled >= 1) return 'medium';
  return 'low';
}

/**
 * Output format: **事実行**\n助言行
 * - Lines starting with ** are facts (bold in UI)
 * - Other lines are advice (serif font in UI)
 */
export function generateAdvice(slots: PartialSlots, confidence: Confidence): string {
  if (confidence === 'low') {
    return '記録しました。詳細を追加すると、具体的な分析が可能になります。';
  }

  const tips: string[] = [];

  // ── Temperature ──
  if (slots.max_temp !== undefined) {
    const maxT = slots.max_temp;
    const minT = slots.min_temp;

    if (maxT >= 35) {
      tips.push(`${maxT}℃は暑すぎて葉が働けない温度。遮光ネット50%を張って、15時すぎたら天窓を全開に。実が焼けないよう葉陰を確保。`);
    } else if (maxT >= 30) {
      tips.push(`${maxT}℃はやや高め。暑いとハウスが乾きやすいから、水やりを普段より1割ほど増やす。午後は遮光して実の温度を下げる。`);
    } else if (maxT <= 3) {
      tips.push(`${maxT}℃は枇杷がやられる寒さ。二重カーテン＋暖房機を確認しましょう。花は-3℃、小さい実は-1℃でダメになる。`);
    } else if (maxT <= 8) {
      tips.push(`${maxT}℃。保温資材を点検しましょう。夜の気温に注意。`);
    } else {
      tips.push(`${maxT}℃は枇杷がよく育つ温度帯。このまま続けて大丈夫。`);
    }
    if (minT !== undefined && maxT - minT > 10) {
      tips.push(`昼夜の温度差${maxT - minT}℃。10℃超えると甘くなりやすいけど、結露しやすい。朝イチで換気して結露を飛ばし、灰色かび病を防ぐ。`);
    }
  }

  // ── Humidity ──
  if (slots.humidity !== undefined) {
    if (slots.humidity < 40) {
      tips.push(`乾燥しすぎると葉が閉じて育ちが悪くなる。ミスト灌水か葉水で湿度60%以上を目標に。`);
    } else if (slots.humidity < 50) {
      tips.push(`葉水をすると楽になる。午前中がいい。`);
    } else if (slots.humidity > 90) {
      tips.push(`灰色かびやすす病が出やすい。扇風機と天窓で80%以下まで下げる。`);
    } else if (slots.humidity > 85) {
      tips.push(`カビが出やすい条件。換気を強めて、通路の草を刈って風通しを良くする。`);
    }
  }

  // ── Fertilizer: Negative Guard ──
  if (slots.fertilizer) {
    if (isNegativeInput(slots.fertilizer)) {
      // No tip — user explicitly said none
      // No tip — user explicitly said none
    } else {
      tips.push(`根に届くまで3〜5日、葉の色に出るまで7〜10日。肥料のやりすぎに注意。根っこが傷みます。`);
    }
  }

  // ── Pest: Negative Guard ──
  if (slots.pest_status) {
    if (isNegativeInput(slots.pest_status) || slots.pest_status === 'なし') {
      // No tip — user explicitly said none
      // No tip — user explicitly said none
    } else {
      const pest = cleanPestName(slots.pest_status);
      if (/カイガラムシ/.test(pest)) {
        tips.push(`マシン油乳剤95%の散布（発生初期）が有効。放置するとすす病を併発し、商品価値が著しく低下する可能性。`);
      } else if (/うどんこ/.test(pest)) {
        tips.push(`トリフミン水和剤またはカリグリーンの散布が有効。風通しをよくすると再発しにくい。`);
      } else if (/アブラムシ/.test(pest)) {
        tips.push(`モスピラン水溶剤の散布が有効。天敵（テントウムシ）の活用も検討。ウイルス媒介リスクがあるため早めに防除しましょう。`);
      } else {
        tips.push(`拡大前の早期防除が大事。被害面積を記録し、次の散布計画を考えましょう。`);
      }
    }
  }

  // ── Harvest: Negative Guard ──
  if (slots.harvest_amount) {
    if (isNegativeInput(slots.harvest_amount)) {
      // No tip — user explicitly said none
    } else {
      const m = String(slots.harvest_amount).match(/(\d+)/);
      if (m) {
        const qty = parseInt(m[1]);
        tips.push(`収穫後は礼肥（お礼の肥料）を検討。粒を揃えて、いいタイミングで出すと値段が変わる。`);
        if (qty >= 50) {
          tips.push(`たくさん穫れたぶん、木への負担が大きい。来年の花が減る可能性があるから、秋の肥料を早めに計画。`);
        }
      }
    }
  }

  if (tips.length === 0) {
    return '記録しました。詳細を追加すると、具体的な分析が可能になります。';
  }

  // ── Build structured output ──
  const actions: string[] = [];
  if (slots.max_temp !== undefined && slots.max_temp >= 30) actions.push('遮光ネットの確認と灌水量の調整');
  if (slots.max_temp !== undefined && slots.max_temp <= 8) actions.push('保温資材と暖房機の点検');
  if (slots.humidity !== undefined && slots.humidity > 85) actions.push('換気扇の稼働確認と天窓開度の調整');
  if (slots.humidity !== undefined && slots.humidity < 50) actions.push('葉水の実施（午前中推奨）');
  if (slots.fertilizer && !isNegativeInput(slots.fertilizer)) actions.push('施肥後3〜5日で葉色変化を観察');
  if (slots.pest_status && slots.pest_status !== 'なし' && !isNegativeInput(slots.pest_status)) actions.push(`${cleanPestName(slots.pest_status)}の経過観察と防除記録の更新`);
  if (slots.harvest_amount && !isNegativeInput(slots.harvest_amount)) actions.push('樹勢回復に礼肥を考えましょう');

  let result = tips.join('\n');
  if (actions.length > 0) {
    result += '\n\n【次のアクション】\n' + actions.map(a => `・${a}`).join('\n');
  }
  result += '\n\n【参考】\n' + REFERENCE_LINKS.join('\n');
  return result;
}

export function generateStrategicAdvice(slots: PartialSlots): string {
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
  if (slots.pest_status && slots.pest_status !== 'なし' && !isNegativeInput(slots.pest_status)) {
    lines.push(`次回: ${cleanPestName(slots.pest_status)}の様子を最優先で見る、防除記録を更新`);
  }
  if (slots.fertilizer && !isNegativeInput(slots.fertilizer)) {
    lines.push('次回: 肥料をやって3〜5日で葉の色をチェック');
  }
  if (slots.harvest_amount && !isNegativeInput(slots.harvest_amount)) {
    lines.push('次回: 礼肥を検討、来年の花への影響も考える');
  }
  if (slots.material_cost) {
    const m = String(slots.material_cost).match(/(\d+)/);
    if (m && parseInt(m[1]) >= 10000) lines.push(`経営注記: 資材費${slots.material_cost}、月の予算と合ってるか確認しましょう`);
  }
  // Dedup: exact match + substring containment
  const unique = lines.filter((line, i) =>
    lines.indexOf(line) === i &&
    !lines.some((other, j) => j !== i && other.length > line.length && other.includes(line))
  );
  return unique.length > 0 ? unique.join('\n') : '記録完了。次回の入力で傾向分析が可能になります。';
}

export function generateAdminLog(slots: PartialSlots, loc: string): string {
  const hasEnvData = slots.max_temp !== undefined || slots.humidity !== undefined;
  const conf = calcConfidence(slots);
  return [
    `【日付】${new Date().toISOString().split('T')[0]}`,
    loc ? `【圃場】${loc}` : null,
    hasEnvData
      ? `【ハウス環境】最高${slots.max_temp !== undefined ? slots.max_temp + '℃' : '-'} / 最低${slots.min_temp !== undefined ? slots.min_temp + '℃' : '-'} / 湿度${slots.humidity !== undefined ? slots.humidity + '%' : '-'}`
      : '【ハウス環境】未計測',
    `【作業】${slots.work_log || '-'}`,
    slots.work_duration ? `【作業時間】${slots.work_duration}` : null,
    slots.fertilizer && !isNegativeInput(slots.fertilizer) ? `【施肥】${slots.fertilizer}` : null,
    slots.harvest_amount && !isNegativeInput(slots.harvest_amount) ? `【収穫】${slots.harvest_amount}` : null,
    slots.material_cost ? `【資材費】${slots.material_cost}` : null,
    slots.fuel_cost ? `【燃料費】${slots.fuel_cost}` : null,
    `【病害虫】${slots.pest_status && !isNegativeInput(slots.pest_status) ? slots.pest_status : 'なし'}`,
    `【所見】${(slots.plant_status || '良好') === '良好' ? '特記事項なし' : slots.plant_status}`,
    `【信頼度】${conf}`,
  ].filter(Boolean).join('\n');
}
