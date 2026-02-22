export interface ConvMessage { role: 'user' | 'assistant'; text: string; }
export interface HouseData { max_temp: number | null; min_temp: number | null; humidity: number | null; }

export interface PartialSlots {
  max_temp?: number; min_temp?: number; humidity?: number;
  work_log?: string; plant_status?: string;
  fertilizer?: string; pest_status?: string;
  harvest_amount?: string; material_cost?: string;
  work_duration?: string; fuel_cost?: string;
  location?: string;
}

export type MissingQuestionKey = 'WORK' | 'HOUSE_TEMP' | 'FERTILIZER' | 'PEST' | 'HARVEST' | 'COST' | 'DURATION';

export interface ApiResponse {
  status: 'complete'; reply: string;
  missing_hints?: string[]; confidence?: Confidence;
  missing_questions?: MissingQuestionKey[];
  house_data?: HouseData | null; work_log?: string; plant_status?: string;
  advice?: string; strategic_advice?: string; admin_log?: string;
  fertilizer?: string; pest_status?: string;
  harvest_amount?: string; material_cost?: string;
  work_duration?: string; fuel_cost?: string;
  estimated_revenue?: number;
  error?: string;
  details?: unknown;
  mentor_mode?: boolean;
}

export type Phase = 'IDLE' | 'LISTENING' | 'REVIEWING' | 'THINKING' | 'FOLLOW_UP' | 'BREATHING' | 'CONFIRM' | 'MENTOR';
export type View = 'record' | 'history';
export interface OutdoorWeather { description: string; temperature: number; code: number; }

export interface LocalRecord {
  id: string; date: string; location: string;
  house_data: HouseData | null; work_log: string; plant_status: string;
  advice: string; admin_log: string;
  fertilizer: string; pest_status: string;
  harvest_amount: string; material_cost: string;
  work_duration: string; fuel_cost: string;
  strategic_advice: string; photo_count: number;
  estimated_profit?: number; raw_transcript?: string;
  synced: boolean; timestamp: number;
}

export interface LastSession { location: string; work: string; date: string; }

export type FollowUpStep = 'WORK' | 'HOUSE_TEMP' | 'FERTILIZER' | 'PEST' | 'HARVEST' | 'COST' | 'DURATION' | 'PHOTO';

export interface ConfirmItem {
  key: string;
  label: string;
  value: string;
}

export type Confidence = 'low' | 'medium' | 'high';

/* ── Empathy / Mental Guard ── */
export type EmotionTier = 0 | 1 | 2 | 3;
export type EmotionCategory = 'physical' | 'weather' | 'isolation' | 'financial' | 'motivation' | 'resignation' | 'sos';

export interface EmotionSignal {
  category: EmotionCategory;
  phrase: string;
  weight: number;
}

export interface EmotionAnalysis {
  tier: EmotionTier;
  score: number;
  signals: EmotionSignal[];
  primaryCategory: EmotionCategory | null;
}

export interface MoodEntry {
  date: string;
  timestamp: number;
  tier: EmotionTier;
  score: number;
  categories: EmotionCategory[];
  weather?: { temp: number; description: string } | null;
}
