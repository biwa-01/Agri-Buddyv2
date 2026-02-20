import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { ConvMessage, PartialSlots } from '@/lib/types';
import { SOS_RE, GEMINI_PROMPT_SECTIONS } from '@/lib/constants';
import { isValidTemp, isValidHumidity } from '@/lib/logic/validation';
import { calcConfidence, generateAdvice, generateStrategicAdvice, generateAdminLog } from '@/lib/logic/advice';
import { correctForLog } from '@/lib/logic/extraction';

export async function POST(req: NextRequest) {
  try {
    const { text, context, partial, location } = await req.json() as {
      text: string;
      context: ConvMessage[];
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
      const allText = correctForLog([
        ...(context || []).map(m => m.text),
        text || '',
      ].join(' '));
      const input = allText.toLowerCase();

      const slots: PartialSlots = { ...(partial || {}) };

      // --- Temperature extraction with VALIDATION ---
      const tempMatches = allText.match(/(\d+)\s*[度℃]/g);
      if (tempMatches) {
        const nums = tempMatches
          .map(t => parseInt(t.replace(/[^\d]/g, '')))
          .filter(isValidTemp);
        if (nums.length >= 2) {
          slots.max_temp = Math.max(...nums);
          slots.min_temp = Math.min(...nums);
        } else if (nums.length === 1) {
          if (slots.max_temp === undefined) slots.max_temp = nums[0];
        }
      }

      // --- Humidity extraction with VALIDATION ---
      const humidMatch = allText.match(/(\d+)\s*[%％パーセント]/);
      if (humidMatch) {
        const hVal = parseInt(humidMatch[1]);
        if (isValidHumidity(hVal)) slots.humidity = hVal;
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

      // --- Estimated revenue ---
      let estimatedRevenue: number | undefined;
      const harvestKgMatch = slots.harvest_amount?.match(/(\d+)\s*(kg|キロ)/i);
      const durationHMatch = slots.work_duration?.match(/(\d+)\s*(時間|じかん)/);
      if (harvestKgMatch || durationHMatch) {
        estimatedRevenue = 0;
        if (harvestKgMatch) estimatedRevenue += parseInt(harvestKgMatch[1]) * 800;
        if (durationHMatch) estimatedRevenue += parseInt(durationHMatch[1]) * 1500;
      }

      // --- Build response: NO DEFAULTS, only actual data ---
      const missingHints: string[] = [];
      if (slots.max_temp === undefined) missingHints.push('気温');
      if (!slots.work_log) missingHints.push('作業内容');

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

      const loc = location || '';
      const adminLogLines = generateAdminLog(slots, loc);

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
        estimated_revenue: estimatedRevenue,
        admin_log: adminLogLines,
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

    const correctedText = correctForLog(text || '');

    const { SYSTEM_ROLE, LOCATION_RULES, DATA_CLEANING_RULES, SILENT_COMPLETION_RULES, VALIDATION_RULES, EXTRACTION_RULES, ADMIN_LOG_RULES, ADVICE_RULES, REVENUE_ESTIMATION_RULES, OUTPUT_SCHEMA } = GEMINI_PROMPT_SECTIONS;

    const prompt = `
${SYSTEM_ROLE}

${LOCATION_RULES}

${DATA_CLEANING_RULES}

${SILENT_COMPLETION_RULES}

${VALIDATION_RULES}

${EXTRACTION_RULES}

${ADMIN_LOG_RULES}

前回までの抽出結果: ${partialStr}

${ADVICE_RULES}

${REVENUE_ESTIMATION_RULES}

【会話履歴】
${contextStr}

【今回のユーザー入力（原文）】
"${text || ''}"

【AI補正済み入力】
"${correctedText}"

${OUTPUT_SCHEMA}
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
