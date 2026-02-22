import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface CurrentItem {
  key: string;
  label: string;
  value: string;
}

export async function POST(req: NextRequest) {
  try {
    const { text, currentItems } = await req.json() as {
      text: string;
      currentItems: CurrentItem[];
    };

    if (!text?.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json({ error: 'APIキー未設定' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const itemsList = currentItems
      .filter(i => i.key !== 'raw_transcript' && i.key !== 'admin_log')
      .map(i => `${i.label}(key="${i.key}"): ${i.value || '(空)'}`)
      .join('\n');

    const prompt = `あなたは営農日誌の修正アシスタント。
ユーザーが音声で修正指示を出した。現在の記録内容と照合し、
変更すべきフィールドと新しい値をJSON配列で返せ。

【現在の記録】
${itemsList}

【ユーザーの修正指示】
"${text}"

【ルール】
- 変更対象のkeyと新しいvalueのみ返す。変更なしのフィールドは含めない
- 否定表現（「なし」「やってない」）は value を空文字列にする
- 曖昧な指示でも文脈から特定フィールドを推定する
  例: 「さっきの20本じゃなくて30本」→ 収穫量フィールドを更新
- 数値の単位は元のフォーマットに合わせる（℃, %, kg等）
- keyは必ず現在の記録に存在するものを使う

出力はJSON以外を含めないこと:
{ "corrections": [{ "key": "...", "value": "..." }] }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(responseText);

    return NextResponse.json({
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
    });
  } catch (error) {
    console.error("Voice Correction Error:", error);
    return NextResponse.json(
      { error: "修正解析に失敗しました", corrections: [] },
      { status: 500 }
    );
  }
}
