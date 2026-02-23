import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel, callWithRetry } from '@/lib/gemini';
import { GEMINI_PROMPT_SECTIONS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as {
      items: { key: string; label: string; value: string }[];
    };

    const model = getGeminiModel();

    const fieldsStr = items
      .filter(it => it.value && it.value.trim())
      .map(it => `${it.label}: ${it.value}`)
      .join('\n');

    const prompt = `あなたはプロの営農日誌作成エンジンである。

【絶対ルール】
1. 提供された構造化データに記載のない情報を絶対に含めるな。推測・補完・一般論は厳禁。
2. データにある事実のみを、プロの営農日誌として体言止めで整理せよ。
3. 全てのフィールド値を漏れなく含めること。場所・作業内容・肥料・温度等、提供された全項目を反映。

${GEMINI_PROMPT_SECTIONS.ADMIN_LOG_RULES}

【具体例】
入力:
  場所: 学校の下の畑
  作業内容: シャインマスカット定植用の穴掘り。直径1m×深さ30cm、9穴、間隔8m
  肥料: 堆肥 約10kg/穴（局所施肥）。石灰 全面散布。BMようりん 2袋
  最高気温: 28℃

出力:
{ "admin_log": "■学校の下の畑\\n・作業: シャインマスカット定植穴掘り 直径1m×深さ30cm 9穴 間隔8m\\n・資材: 堆肥 約10kg/穴 局所施肥、石灰 全面散布、BMようりん 2袋\\n・環境: 最高28℃" }

【自己検閲 — 出力前に必ず実行】
生成したadmin_logが以下を満たすか検証し、満たさない場合は修正してから出力:
✓ 「場所」フィールドの値がadmin_logに含まれているか
✓ 「作業内容」の主要な事実（作業種別、対象作物、数量）が全て含まれているか
✓ 「肥料」の全銘柄・全数量が含まれているか
✓ 提供されていない情報を追加していないか
✓ 体言止めになっているか（「〜した」「〜です」が含まれていないか）

【構造化データ（これが唯一の情報源）】
${fieldsStr}

【出力JSON】
{ "admin_log": "体言止め・箇条書きの営農日誌テキスト" }`;

    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    console.error('Admin-log generation error:', error);
    return NextResponse.json({ error: '日誌生成に失敗' }, { status: 500 });
  }
}
