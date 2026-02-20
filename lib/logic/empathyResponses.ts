import type { EmotionCategory } from '@/lib/types';

/* ── Tier 1: 短い一言（音声読み上げ用） ── */
const TIER1_NUDGES: Record<string, string[]> = {
  physical: [
    'むりせんでね。',
    'からだ、だいじにしてね。',
    'きょうはこのへんで、じゅうぶん。',
  ],
  weather: [
    'こまめに休憩、わすれんでね。',
    'てんきにむりせず、いきましょう。',
  ],
  isolation: [
    'ひとりでよくがんばってる。',
    'いつでもここにおるよ。',
  ],
  financial: [
    'かんがえすぎんでね。',
    'いっぽずつ、いきましょう。',
  ],
  motivation: [
    'やる気がでないときもある。だいじょうぶ。',
    'きょうはこのくらいで、よか。',
  ],
  resignation: [
    'きもち、わかるよ。',
    'そうおもうときもある。だいじょうぶ。',
  ],
};

/* ── Tier 2: EmpathyCard用コンテンツ ── */
export interface Tier2Content {
  title: string;
  message: string;
  suggestion: string;
}

const TIER2_COMFORT: Record<string, Tier2Content[]> = {
  physical: [
    {
      title: 'からだ、おつかれさま',
      message: '痛みや疲れを感じながらの作業、ほんとうにお疲れさまです。',
      suggestion: '15分だけでも横になって、からだを休めてみませんか。',
    },
    {
      title: 'よくがんばった',
      message: 'からだが悲鳴をあげてるサイン。聞いてあげて。',
      suggestion: 'ストレッチや入浴で、筋肉をほぐしてみて。',
    },
  ],
  weather: [
    {
      title: 'きびしい天気のなかで',
      message: 'この天候での作業、ほんとうに大変だったはず。',
      suggestion: '水分補給と休憩を忘れずに。明日の天気も確認しておきましょう。',
    },
  ],
  isolation: [
    {
      title: 'ひとりでがんばってる',
      message: 'だれにも言えないこと、ここに話してくれてありがとう。',
      suggestion: '地域の農業者交流会やJAの相談窓口、使ってみませんか。',
    },
  ],
  financial: [
    {
      title: 'お金のこと、きついよね',
      message: '経営のプレッシャー、ひとりで抱えなくていい。',
      suggestion: '農業経営アドバイザーや融資相談窓口に、一度話してみるのもあり。',
    },
  ],
  motivation: [
    {
      title: 'やる気が出ないとき',
      message: 'そういう日もある。サボりじゃなくて、こころの休憩日。',
      suggestion: '最低限だけやって、あとは好きなことしましょう。',
    },
  ],
  resignation: [
    {
      title: 'つらいよね',
      message: '報われない気持ち、よくわかる。でも、記録を続けてるだけですごい。',
      suggestion: '信頼できるだれかに、今の気持ちを話してみて。',
    },
  ],
};

export function pickNudge(category: EmotionCategory): string | null {
  const pool = TIER1_NUDGES[category];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getComfort(category: EmotionCategory): Tier2Content {
  const pool = TIER2_COMFORT[category] || TIER2_COMFORT.physical;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getWeatherCare(temp: number): string | null {
  if (temp >= 33) return '気温が高いです。こまめな水分補給と日陰での休憩を。';
  if (temp >= 30) return '暑い日です。15分おきに水を飲んで。';
  if (temp <= 5) return '冷え込みます。防寒をしっかり。温かい飲み物を手元に。';
  return null;
}
