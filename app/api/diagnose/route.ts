import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { ConvMessage, PartialSlots, OutdoorWeather } from '@/lib/types';
import { SOS_RE, GEMINI_PROMPT_SECTIONS } from '@/lib/constants';
import { calcConfidence, generateAdvice, generateStrategicAdvice, generateAdminLog } from '@/lib/logic/advice';
import { correctForLog } from '@/lib/logic/extraction';

export async function POST(req: NextRequest) {
  try {
    const { text, context, partial, location, outdoor } = await req.json() as {
      text: string;
      context: ConvMessage[];
      partial?: PartialSlots;
      location?: string;
      outdoor?: OutdoorWeather | null;
    };

    // ─── SOS Detection (server-side double check) ───
    if (SOS_RE.test(text || '')) {
      return NextResponse.json({
        status: 'complete',
        reply: 'きもち、うけとめました。ひとりでかかえこまないで。',
        mentor_mode: true,
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

    const { SYSTEM_ROLE, LOCATION_RULES, DATA_CLEANING_RULES, SILENT_COMPLETION_RULES, VALIDATION_RULES, EXTRACTION_RULES, MISSING_QUESTIONS_RULES, ADMIN_LOG_RULES, ADVICE_RULES, REVENUE_ESTIMATION_RULES, OUTPUT_SCHEMA } = GEMINI_PROMPT_SECTIONS;

    const weatherSection = outdoor
      ? `\n【本日の天気】${outdoor.description} ${outdoor.temperature}℃\n`
      : '';

    const prompt = `
${SYSTEM_ROLE}

${LOCATION_RULES}

${DATA_CLEANING_RULES}

${SILENT_COMPLETION_RULES}

${VALIDATION_RULES}

${EXTRACTION_RULES}

${MISSING_QUESTIONS_RULES}

${ADMIN_LOG_RULES}

前回までの抽出結果: ${partialStr}

${ADVICE_RULES}

${REVENUE_ESTIMATION_RULES}
${weatherSection}
【会話履歴】
${contextStr}

【今回のユーザー入力（原文）】
"${text || ''}"

${OUTPUT_SCHEMA}
`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().replace(/```json|```/g, "").trim();
      return NextResponse.json(JSON.parse(responseText));
    } catch (geminiError) {
      // ─── Gemini失敗時フォールバック: ローカル関数で最低限の応答 ───
      console.error("Gemini API Error (fallback to local):", geminiError);

      const allText = correctForLog([
        ...(context || []).map(m => m.text),
        text || '',
      ].join(' '));

      const slots: PartialSlots = { ...(partial || {}) };

      // 最低限の抽出: 作業内容
      if (!slots.work_log && allText.trim().length > 2) {
        slots.work_log = allText.trim().slice(0, 80);
      }

      const loc = location || '';
      const confidence = calcConfidence(slots);
      const adviceText = generateAdvice(slots, confidence);
      const strategicAdvice = generateStrategicAdvice(slots);
      const adminLogLines = generateAdminLog(slots, loc);

      return NextResponse.json({
        status: 'complete',
        reply: 'AI解析に一時的に接続できませんでした。ローカル処理で記録します。',
        confidence,
        work_log: slots.work_log || '',
        plant_status: slots.plant_status || '良好',
        advice: adviceText,
        strategic_advice: strategicAdvice,
        admin_log: adminLogLines,
        fertilizer: slots.fertilizer || undefined,
        pest_status: slots.pest_status || undefined,
        harvest_amount: slots.harvest_amount || undefined,
        material_cost: slots.material_cost || undefined,
        work_duration: slots.work_duration || undefined,
        fuel_cost: slots.fuel_cost || undefined,
      });
    }

  } catch (error) {
    console.error("Diagnosis Error:", error);
    return NextResponse.json(
      { error: "通信中です。少々お待ちください...", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
