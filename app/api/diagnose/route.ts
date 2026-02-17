import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface PartialSlots {
  max_temp?: number;
  min_temp?: number;
  humidity?: number;
  work_log?: string;
  plant_status?: string;
  fertilizer?: string;
  pest_status?: string;
  harvest_amount?: string;
  material_cost?: string;
  work_duration?: string;
  fuel_cost?: string;
}

type Confidence = 'low' | 'medium' | 'high';

const REFERENCE_LINKS = [
  '長崎県農林技術開発センター: https://www.pref.nagasaki.jp/section/nougisen/',
  '農研機構 果樹研究部門: https://www.naro.go.jp/laboratory/nifts/',
  'JA長崎せいひ 枇杷栽培情報: https://www.ja-nagasakiseihi.jp/',
];

/* ── SOS Detection ── */
const SOS_RE = /しんどい|辞めたい|やめたい|つらい|辛い|きつい|限界|助けて|もう無理|逃げたい|潰れ|SOS|疲れた|つかれた|だるい|やる気.*ない/i;

/* ── Validation Guards ── */
function isValidTemp(v: number): boolean { return v >= -20 && v <= 60; }
function isValidHumidity(v: number): boolean { return v >= 0 && v <= 100; }

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
    const pest = slots.pest_status;
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

  // 冒頭称賛
  const work = slots.work_log || '管理作業';
  let reason = '日々の管理';
  if (slots.max_temp !== undefined || slots.humidity !== undefined) reason = '環境モニタリング';
  if (slots.fertilizer) reason = '土壌管理';
  if (slots.pest_status && slots.pest_status !== 'なし') reason = '早期防除';
  if (slots.harvest_amount) reason = '収量管理';
  const praise = `今日の${work}は${reason}の観点から価値の高い作業です。`;

  // 末尾アクション
  const actions: string[] = [];
  if (slots.max_temp !== undefined && slots.max_temp >= 30) actions.push('遮光ネットの確認と灌水量の調整');
  if (slots.max_temp !== undefined && slots.max_temp <= 8) actions.push('保温資材と暖房機の点検');
  if (slots.humidity !== undefined && slots.humidity > 85) actions.push('換気扇の稼働確認と天窓開度の調整');
  if (slots.humidity !== undefined && slots.humidity < 50) actions.push('葉水の実施（午前中推奨）');
  if (slots.fertilizer) actions.push('施肥後3〜5日で葉色変化を観察');
  if (slots.pest_status && slots.pest_status !== 'なし') actions.push(`${slots.pest_status}の経過観察と防除記録の更新`);
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
  if (slots.pest_status && slots.pest_status !== 'なし') lines.push(`次回: ${slots.pest_status}の様子を最優先で見る、防除記録を更新`);
  if (slots.fertilizer) lines.push('次回: 肥料をやって3〜5日で葉の色をチェック');
  if (slots.harvest_amount) lines.push('次回: 礼肥を検討、来年の花への影響も考える');
  if (slots.material_cost) {
    const m = String(slots.material_cost).match(/(\d+)/);
    if (m && parseInt(m[1]) >= 10000) lines.push(`経営注記: 資材費${slots.material_cost}、月の予算と合ってるか確認しましょう`);
  }

  return lines.length > 0 ? lines.join('\n') : '記録完了。次回の入力で傾向分析が可能になります。';
}

export async function POST(req: NextRequest) {
  try {
    const { text, context, partial, location } = await req.json() as {
      text: string;
      context: ConversationMessage[];
      partial?: PartialSlots;
      location?: string;
    };

    // ─── SOS Detection (server-side double check) ───
    if (SOS_RE.test(text || '')) {
      return NextResponse.json({
        status: 'complete',
        reply: 'きもち、うけとめました。ひとりでかかえこまないで。',
        mentor_mode: true,
      });
    }

    // ─── Mock Mode ───
    if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') {
      const allText = [
        ...(context || []).map(m => m.text),
        text || '',
      ].join(' ');
      const input = allText.toLowerCase();

      const slots: PartialSlots = { ...(partial || {}) };

      // --- Temperature extraction with VALIDATION ---
      const tempMatches = allText.match(/(\d+)\s*[度℃]/g);
      if (tempMatches) {
        const nums = tempMatches
          .map(t => parseInt(t.replace(/[^\d]/g, '')))
          .filter(isValidTemp); // GUARD: reject -20℃ ~ 60℃ outside range
        if (nums.length >= 2) {
          slots.max_temp = Math.max(...nums);
          slots.min_temp = Math.min(...nums);
        } else if (nums.length === 1) {
          if (slots.max_temp === undefined) slots.max_temp = nums[0];
        }
        // Invalid values (e.g. 1510℃) are silently discarded
      }

      // --- Humidity extraction with VALIDATION ---
      const humidMatch = allText.match(/(\d+)\s*[%％パーセント]/);
      if (humidMatch) {
        const hVal = parseInt(humidMatch[1]);
        if (isValidHumidity(hVal)) slots.humidity = hVal; // GUARD: 0-100% only
      }

      // --- Work extraction ---
      const workLabels: string[] = [];
      const workKeywords = [
        { pattern: /水やり|灌水|かんすい|みずやり/, label: '灌水' },
        { pattern: /剪定|せんてい/, label: '剪定' },
        { pattern: /薬|散布|消毒/, label: '薬剤散布' },
        { pattern: /摘果|てきか/, label: '摘果' },
        { pattern: /施肥|肥料|ひりょう/, label: '施肥' },
        { pattern: /観察|かんさつ|見回/, label: '観察・巡回' },
        { pattern: /収穫|しゅうかく/, label: '収穫' },
        { pattern: /換気|かんき/, label: '換気' },
        { pattern: /袋かけ|袋掛/, label: '袋かけ' },
      ];
      for (const wk of workKeywords) {
        if (wk.pattern.test(input)) workLabels.push(wk.label);
      }
      if (workLabels.length > 0) slots.work_log = workLabels.join('・');
      const quantityMatch = allText.match(/(\d+)\s*袋/);
      if (quantityMatch && slots.work_log) slots.work_log += `（${quantityMatch[0]}）`;
      if (!slots.work_log && text.trim().length > 2) slots.work_log = text.trim().slice(0, 40);

      // --- Plant status ---
      if (input.includes('黄') || input.includes('きいろ')) slots.plant_status = '葉の黄化あり（Mg欠乏の可能性）';
      else if (input.includes('斑点') || input.includes('はんてん')) slots.plant_status = '斑点あり（がんしゅ病の可能性）';
      else if (!slots.plant_status) slots.plant_status = '良好';

      // --- Fertilizer ---
      if (/肥料|施肥|硫安|尿素|有機|化成|石灰/.test(input)) {
        const fertNames = [];
        if (/硫安/.test(input)) fertNames.push('硫安');
        if (/尿素/.test(input)) fertNames.push('尿素');
        if (/有機/.test(input)) fertNames.push('有機肥料');
        if (/化成/.test(input)) fertNames.push('化成肥料');
        if (/石灰/.test(input)) fertNames.push('石灰');
        const fertAmtMatch = allText.match(/(\d+)\s*(kg|キロ|グラム|g)/i);
        slots.fertilizer = (fertNames.length > 0 ? fertNames.join('・') : '肥料') + (fertAmtMatch ? ` ${fertAmtMatch[0]}` : '');
      }

      // --- Pests ---
      if (/害虫|虫|カビ|病気|うどんこ|アブラムシ|カイガラムシ/.test(input)) {
        if (/うどんこ/.test(input)) slots.pest_status = 'うどんこ病';
        else if (/カビ/.test(input)) slots.pest_status = 'カビ発生';
        else if (/アブラムシ/.test(input)) slots.pest_status = 'アブラムシ';
        else if (/カイガラムシ/.test(input)) slots.pest_status = 'カイガラムシ';
        else slots.pest_status = '病害虫確認あり';
      }

      // --- Harvest ---
      const harvestMatch = allText.match(/(\d+)\s*(kg|キロ|個|箱|パック)/i);
      if (harvestMatch && /収穫|とれ|採れ|穫/.test(input)) slots.harvest_amount = harvestMatch[0];

      // --- Cost ---
      const costMatch = allText.match(/(\d+)\s*(円|えん)/);
      if (costMatch) slots.material_cost = costMatch[0];

      // --- Work duration ---
      const durationMatch = allText.match(/(\d+)\s*(時間|じかん)/);
      if (durationMatch) slots.work_duration = durationMatch[0];

      // --- Fuel cost ---
      if (/燃料|ガソリン|軽油|灯油/.test(input)) {
        const fuelAmt = allText.match(/(?:燃料|ガソリン|軽油|灯油)[代費]?\s*(\d+)\s*円/);
        slots.fuel_cost = fuelAmt ? fuelAmt[0] : '燃料費あり';
      }

      // --- Build response: NO DEFAULTS, only actual data ---
      const missingHints: string[] = [];
      if (slots.max_temp === undefined) missingHints.push('気温');
      if (!slots.work_log) missingHints.push('作業内容');

      // house_data: only include if we have ACTUAL measured values
      const hasEnvData = slots.max_temp !== undefined || slots.humidity !== undefined;
      const houseData = hasEnvData ? {
        max_temp: slots.max_temp ?? null,
        min_temp: slots.min_temp ?? null,
        humidity: slots.humidity ?? null,
      } : null;

      const confidence = calcConfidence(slots);
      const adviceText = generateAdvice(slots, confidence);
      const strategicAdvice = generateStrategicAdvice(slots);

      const extracted: string[] = [];
      if (slots.max_temp !== undefined) extracted.push(`気温${slots.max_temp}℃`);
      if (slots.humidity !== undefined) extracted.push(`湿度${slots.humidity}%`);
      if (slots.work_log) extracted.push(slots.work_log);
      if (slots.fertilizer) extracted.push(`施肥: ${slots.fertilizer}`);
      if (slots.harvest_amount) extracted.push(`収穫: ${slots.harvest_amount}`);
      if (slots.work_duration) extracted.push(`作業時間: ${slots.work_duration}`);

      const reply = extracted.length > 0
        ? `お疲れさまです。${extracted.join('、')}で記録しました。`
        : 'お疲れさまです。記録しました。';

      const loc = location || '茂木町ハウス';

      return NextResponse.json({
        status: 'complete',
        reply,
        missing_hints: missingHints.length > 0 ? missingHints : undefined,
        confidence,
        house_data: houseData,
        work_log: slots.work_log || '',
        plant_status: slots.plant_status || '良好',
        advice: adviceText,
        strategic_advice: strategicAdvice,
        fertilizer: slots.fertilizer || undefined,
        pest_status: slots.pest_status && slots.pest_status !== 'なし' ? slots.pest_status : undefined,
        harvest_amount: slots.harvest_amount || undefined,
        material_cost: slots.material_cost || undefined,
        work_duration: slots.work_duration || undefined,
        fuel_cost: slots.fuel_cost || undefined,
        admin_log: [
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
          `【信頼度】${confidence}`,
        ].filter(Boolean).join('\n'),
      });
    }

    // ─── Gemini API ───
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json({ error: "APIキーが未設定です" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const contextStr = (context || [])
      .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
      .join('\n');

    const partialStr = partial ? JSON.stringify(partial) : '{}';

    const prompt = `
あなたはAgri-Buddy、長崎県茂木町の枇杷ハウス栽培に特化した営農AIパートナーです。
温かい対話調で応答してください。

【Silent Completion ルール — 最重要】
**必ず status="complete" を返してください。interview は禁止です。**
足りない項目はデフォルトで埋め、missing_hints で通知するだけ。

【データ検証ルール — 最重要】
- 気温: -20℃〜60℃の範囲外は異常値として除外。house_dataに含めないこと。
- 湿度: 0%〜100%の範囲外は異常値として除外。
- 実測値がない場合はnullを返す。推測値やダミーデータは絶対に使用しない。
- house_data は実測値がある場合のみ返す。ない場合はnullとする。

【抽出ルール】
不足項目への言及をreplyに含めない。抽出できたものだけ返せ。

【抽出対象項目】
1. house_max_temp / house_min_temp / house_humidity（実測値のみ、なければnull）
2. work_log: 作業内容（複数可、数量含む）
3. plant_status: 作物の状態
4. fertilizer: 肥料（銘柄・量）
5. pest_status: 病害虫の有無・種類
6. harvest_amount: 収穫量
7. material_cost: 資材・燃料コスト
8. work_duration: 作業時間
9. fuel_cost: 燃料費

音声テキストの誤変換は文脈から補正してください。
前回までの抽出結果: ${partialStr}

【Confidence-Based Advice — 先輩農家の口調】
- 専門用語は使わず、現場のことばで書く。括弧つき解説は不要。
- 具体的な数値と対策を明記するが、難しい言い回しは避ける。
- "low"（0-1項目）: 「記録しました。詳細を追加すると、具体的な分析が可能になります。」のみ。推測・季節一般論は禁止。
- "medium"（2-4項目）: 入力データのみに基づくアドバイス。入力されていないフィールドへの言及は禁止。
- "high"（5+項目）: データに基づく詳しい分析。温度→暑さ寒さの影響、病害虫→具体的な薬剤名、施肥→効果が出る時期。
- 「現状維持で問題なし」等の無意味な回答は禁止。必ず次にやることを提示。

【Strategic Advice】
次回やったほうがいいこと。入力データに基づく行のみ。季節一般論は禁止。
緊急なら【緊急】をつける。経営に影響するなら「経営注記:」をつける。

【文体ルール】
- 先輩農家が後輩に教えるような口調で書く。
- 「〜が推奨されます」→「〜したほうがいい」「〜がいい」
- 冒頭に今日の作業への称賛を添え、末尾に「次のアクション」一覧を付与すること。

【Probabilistic Advice】
- 断定を避け「〜の可能性がある」「〜したほうがいい（要確認）」表現を使用
- 参考: 長崎県農林技術開発センター, 農研機構, JA長崎せいひ

【会話履歴】
${contextStr}

【今回のユーザー入力】
"${text || ''}"

【出力JSON — status は必ず "complete"】
{
  "status": "complete",
  "reply": "記録完了の報告",
  "missing_hints": ["不足項目"] (optional),
  "confidence": "low" | "medium" | "high",
  "house_data": { "max_temp": N|null, "min_temp": N|null, "humidity": N|null } | null,
  "work_log": "str",
  "plant_status": "str",
  "advice": "confidence に応じたアドバイス",
  "strategic_advice": "次回作業の推奨",
  "fertilizer": "str" (optional),
  "pest_status": "str" (optional),
  "harvest_amount": "str" (optional),
  "material_cost": "str" (optional),
  "work_duration": "str" (optional),
  "fuel_cost": "str" (optional),
  "admin_log": "営農日誌テキスト"
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json|```/g, "").trim();
    return NextResponse.json(JSON.parse(responseText));

  } catch (error) {
    console.error("Diagnosis Error:", error);
    return NextResponse.json(
      { error: "通信中です。少々お待ちください...", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
