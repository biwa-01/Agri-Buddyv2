import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { ConvMessage, PartialSlots, OutdoorWeather } from '@/lib/types';
import { SOS_RE, GEMINI_PROMPT_SECTIONS } from '@/lib/constants';

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

    // 30秒タイムアウト + 1回リトライ
    const callGemini = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const result = await model.generateContent(prompt, { signal: ctrl.signal });
        return result;
      } finally { clearTimeout(timer); }
    };

    let result;
    try {
      result = await callGemini();
    } catch (firstErr) {
      console.warn('Gemini 1st attempt failed, retrying...', firstErr);
      await new Promise(r => setTimeout(r, 2000));
      try {
        result = await callGemini();
      } catch (retryErr) {
        console.error('Gemini retry failed:', retryErr);
        return NextResponse.json(
          { error: '解析に失敗しました。もう一度、短めに話してみてください。' },
          { status: 502 }
        );
      }
    }
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
