import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel, callWithRetry } from '@/lib/gemini';

import type { ConvMessage, OutdoorWeather } from '@/lib/types';
import { SOS_RE, GEMINI_PROMPT_SECTIONS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const { text, context, location, outdoor, knownLocations } = await req.json() as {
      text: string;
      context: ConvMessage[];
      location?: string;
      outdoor?: OutdoorWeather | null;
      knownLocations?: string[];
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
    const model = getGeminiModel();

    const contextStr = (context || [])
      .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
      .join('\n');

    const { SYSTEM_ROLE, LOCATION_RULES, DATA_CLEANING_RULES, SILENT_COMPLETION_RULES, VALIDATION_RULES, EXTRACTION_RULES, ADVICE_RULES, REVENUE_ESTIMATION_RULES, OUTPUT_SCHEMA } = GEMINI_PROMPT_SECTIONS;

    const weatherSection = outdoor
      ? `\n【本日の天気】${outdoor.description} ${outdoor.temperature}℃\n`
      : '';

    const locationSection = location
      ? `\n【現在の記録場所】${location}\n`
      : '';

    const locList = (knownLocations && knownLocations.length > 0)
      ? knownLocations.join(', ')
      : 'なし（初回利用）';
    const extractionWithLocs = EXTRACTION_RULES.replace('{locationList}', locList);

    const prompt = `
${SYSTEM_ROLE}

${LOCATION_RULES}

${DATA_CLEANING_RULES}

${SILENT_COMPLETION_RULES}

${VALIDATION_RULES}

${extractionWithLocs}

${ADVICE_RULES}

${REVENUE_ESTIMATION_RULES}
${weatherSection}${locationSection}
【会話履歴】
${contextStr}

【今回のユーザー入力（原文）】
"${text || ''}"

${OUTPUT_SCHEMA}
`;

    console.log('[diagnose] prompt:', prompt.length, 'chars');

    // 30秒タイムアウト + 429リトライ
    const callGemini = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        return await model.generateContent(prompt, { signal: ctrl.signal });
      } finally { clearTimeout(timer); }
    };

    let result;
    try {
      result = await callWithRetry(callGemini);
    } catch (retryErr) {
      const e = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error('[diagnose] fail:', e);
      return NextResponse.json(
        { error: 'AIが少し混み合っています。30秒ほど待ってからもう一度お話しください' },
        { status: 502 }
      );
    }
    const responseText = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(responseText);

    // デバッグ: 抽出判定の内訳をログ出力
    const filled = Object.entries(parsed)
      .filter(([k, v]) => v != null && v !== '' && !['status','reply','missing_hints','missing_questions','confidence','advice','strategic_advice','admin_log','estimated_revenue'].includes(k))
      .map(([k]) => k);
    console.log('[diagnose] filled:', filled.join(', '));
    console.log('[diagnose] missing_questions:', (parsed.missing_questions || []).join(', '));
    console.log('[diagnose] confidence:', parsed.confidence);

    return NextResponse.json(parsed);

  } catch (error) {
    console.error("Diagnosis Error:", error);
    return NextResponse.json(
      { error: "通信中です。少々お待ちください..." },
      { status: 500 }
    );
  }
}
