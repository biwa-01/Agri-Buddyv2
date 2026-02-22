import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";

export function getGeminiModel() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("APIキーが未設定です");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

/** 429時にretryDelayを読んで1回リトライ。それ以外のエラーはそのままthrow */
export async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (is429(err)) {
      const delay = extractRetryDelay(err);
      console.warn(`[gemini] 429 hit, waiting ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return await fn();
    }
    throw err;
  }
}

function is429(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED');
  }
  return false;
}

function extractRetryDelay(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retryDelay["\s:]+(\d+)/i);
  return match ? Number(match[1]) * 1000 : 5000;
}
