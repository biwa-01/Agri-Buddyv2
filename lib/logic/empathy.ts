import type { EmotionCategory, EmotionSignal, EmotionAnalysis, EmotionTier } from '@/lib/types';

/* ── Pattern: [regex, category, weight] ── */
const EMOTION_PATTERNS: [RegExp, EmotionCategory, number][] = [
  // physical (body fatigue / pain)
  [/腰(が)?痛/, 'physical', 2],
  [/足(が)?痛/, 'physical', 1],
  [/体(が)?痛/, 'physical', 2],
  [/頭(が)?痛/, 'physical', 1],
  [/寝不足/, 'physical', 1],
  [/眠(い|たい|れな)/, 'physical', 1],
  [/バテ(た|てる|気味)/, 'physical', 2],
  [/ふらふら/, 'physical', 2],
  [/熱中症/, 'physical', 3],
  [/疲れた|つかれた/, 'physical', 1],
  [/だるい/, 'physical', 1],
  [/きつい/, 'physical', 1],

  // weather stress
  [/暑すぎ|あつすぎ/, 'weather', 1],
  [/寒すぎ|さむすぎ/, 'weather', 1],
  [/雨(が)?続/, 'weather', 1],
  [/台風/, 'weather', 2],
  [/日照り/, 'weather', 1],

  // isolation
  [/一人(で|だ|じゃ)/, 'isolation', 2],
  [/誰も(いない|来ない|手伝)/, 'isolation', 2],
  [/孤独/, 'isolation', 2],
  [/相談(する人|できる人|相手).*(いない|おらん)/, 'isolation', 3],

  // financial
  [/赤字/, 'financial', 2],
  [/お金(が)?ない/, 'financial', 2],
  [/儲から(ない|ん)/, 'financial', 2],
  [/借金/, 'financial', 2],
  [/経営.*(苦|厳|大変)/, 'financial', 2],

  // motivation
  [/やる気.*(ない|出ない|でない)/, 'motivation', 2],
  [/めんどくさい|めんどい/, 'motivation', 1],
  [/やりたくない/, 'motivation', 2],

  // resignation (giving up)
  [/もう(いい|ええ)/, 'resignation', 2],
  [/どうでもいい/, 'resignation', 3],
  [/意味(が)?ない/, 'resignation', 2],
  [/何やっても/, 'resignation', 2],
  [/報われ(ない|ん)/, 'resignation', 2],

  // SOS (critical — any single match → high score)
  [/死にたい|しにたい/, 'sos', 6],
  [/消えたい|きえたい/, 'sos', 6],
  [/助けて|たすけて/, 'sos', 3],
  [/もう無理|もうむり/, 'sos', 3],
  [/辞めたい|やめたい/, 'sos', 3],
  [/しんどい/, 'sos', 3],
  [/つらい|辛い/, 'sos', 3],
  [/限界/, 'sos', 3],
  [/逃げたい|にげたい/, 'sos', 3],
  [/潰れ(そう|る)/, 'sos', 3],
  [/SOS/i, 'sos', 6],
];

function determineTier(score: number, hasSos: boolean): EmotionTier {
  if (score >= 6 || hasSos) return 3;
  if (score >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function analyzeEmotion(text: string): EmotionAnalysis {
  const signals: EmotionSignal[] = [];
  let score = 0;
  let hasSos = false;

  for (const [re, category, weight] of EMOTION_PATTERNS) {
    const match = text.match(re);
    if (match) {
      signals.push({ category, phrase: match[0], weight });
      score += weight;
      if (category === 'sos') hasSos = true;
    }
  }

  const tier = determineTier(score, hasSos);

  // primary category: highest weight signal, tie-break by order
  let primaryCategory: EmotionAnalysis['primaryCategory'] = null;
  if (signals.length > 0) {
    primaryCategory = signals.reduce((a, b) => b.weight > a.weight ? b : a).category;
  }

  return { tier, score, signals, primaryCategory };
}
