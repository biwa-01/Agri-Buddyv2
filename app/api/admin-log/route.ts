import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_PROMPT_SECTIONS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as {
      items: { key: string; label: string; value: string }[];
    };

    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json({ error: 'APIキー未設定' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const fieldsStr = items
      .filter(it => it.value && it.value.trim())
      .map(it => `${it.label}: ${it.value}`)
      .join('\n');

    const prompt = `${GEMINI_PROMPT_SECTIONS.ADMIN_LOG_RULES}

${GEMINI_PROMPT_SECTIONS.DATA_CLEANING_RULES}

以下のフィールドから営農日誌(admin_log)を生成せよ。JSON形式で返すこと。

【フィールド】
${fieldsStr}

【出力JSON】
{ "admin_log": "体言止め・箇条書きの営農日誌テキスト" }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    console.error('Admin-log generation error:', error);
    return NextResponse.json({ error: '日誌生成に失敗' }, { status: 500 });
  }
}
