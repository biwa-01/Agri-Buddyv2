import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel, callWithRetry } from '@/lib/gemini';

const MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

interface OcrSlots {
  work_log?: string;
  fertilizer?: string;
  material_cost?: string;
  harvest_amount?: string;
  work_duration?: string;
  date?: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return NextResponse.json({ error: '画像が必要です' }, { status: 400 });
    }

    if (MOCK) {
      return NextResponse.json({
        raw_text: '2月17日 灌水・ハウス管理 有機肥料2kg散布 収穫5kg 作業3時間',
        slots: {
          work_log: '灌水・ハウス管理',
          fertilizer: '有機肥料 2kg',
          harvest_amount: '5kg',
          work_duration: '3時間',
          date: new Date().toISOString().split('T')[0],
        } as OcrSlots,
      });
    }

    const model = getGeminiModel();

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const result = await callWithRetry(() => model.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      {
        text: `あなたは営農日誌のOCRアシスタントです。画像に含まれる手書きまたは印刷されたテキストを読み取り、以下のJSON形式で返してください。

最重要ルール: 読み取れない部分はnullとし、推測は絶対に禁止です。

抽出対象:
- raw_text: 画像内の全テキスト（読み取れた部分のみ）
- slots: 以下のフィールドを可能な限り抽出
  - work_log: 作業内容（例: "灌水・剪定"）
  - fertilizer: 肥料情報（例: "有機肥料 2kg"）
  - material_cost: 資材費（例: "3000円"）
  - harvest_amount: 収穫量（例: "5kg"）
  - work_duration: 作業時間（例: "3時間"）
  - date: 日付（例: "2026-02-16"）

JSONのみを返してください。マークダウンのコードブロックは不要です。
{
  "raw_text": "...",
  "slots": { ... }
}`,
      },
    ]));

    const text = result.response.text().trim();
    const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        raw_text: parsed.raw_text || '',
        slots: parsed.slots || {},
      });
    } catch {
      return NextResponse.json({
        raw_text: cleaned,
        slots: {},
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'OCR処理に失敗しました';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
