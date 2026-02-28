import type { LocalRecord, LastSession, LocationMaster, EmotionAnalysis, MoodEntry, OutdoorWeather } from '@/lib/types';
import { SK_RECORDS, SK_SESSION, SK_DEEP_CLEANED, SK_MOOD, SK_LOCATIONS, MEDIA_DB, MEDIA_STORE } from '@/lib/constants';
import { isValidTemp, isValidHumidity } from '@/lib/logic/validation';
import { normalizeLocationName } from '@/lib/logic/extraction';

/* ── helpers ── */
function normalizeDate(s: string): string {
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

/* ── localStorage ── */
export function loadRecs(): LocalRecord[] {
  try {
    const raw: unknown[] = JSON.parse(localStorage.getItem(SK_RECORDS) || '[]');
    return raw.filter((r): r is LocalRecord => {
      try { return r != null && typeof r === 'object' && 'id' in r && 'date' in r; }
      catch { return false; }
    }).flatMap(r => {
      try {
        const dateStr = typeof r.date === 'number'
          ? new Date(r.date).toISOString().split('T')[0]
          : String(r.date ?? new Date().toISOString().split('T')[0]);
        return [{
          ...r,
          id: String(r.id ?? `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          date: normalizeDate(dateStr),
          location: String(r.location ?? ''),
          work_log: String(r.work_log ?? ''),
          plant_status: String(r.plant_status ?? '良好'),
          advice: String(r.advice ?? ''),
          admin_log: String(r.admin_log ?? ''),
          fertilizer: String(r.fertilizer ?? ''),
          pest_status: String(r.pest_status ?? ''),
          harvest_amount: String(r.harvest_amount ?? ''),
          material_cost: String(r.material_cost ?? ''),
          work_duration: String(r.work_duration ?? ''),
          fuel_cost: String(r.fuel_cost ?? ''),
          strategic_advice: String(r.strategic_advice ?? ''),
          pesticide_detail: String(r.pesticide_detail ?? ''),
          photo_count: r.photo_count ?? 0,
          synced: r.synced ?? false,
          timestamp: r.timestamp ?? 0,
          house_data: r.house_data ?? null,
          estimated_profit: typeof r.estimated_profit === 'number' ? r.estimated_profit : (r.estimated_profit != null ? Number(r.estimated_profit) || undefined : undefined),
        }];
      } catch { return []; }
    });
  } catch { return []; }
}
export function saveRecLS(r: LocalRecord) { const rs = loadRecs(); rs.push(r); localStorage.setItem(SK_RECORDS, JSON.stringify(rs)); }
export function markSync(id: string) { const rs = loadRecs(); localStorage.setItem(SK_RECORDS, JSON.stringify(rs.map(r => r.id === id ? { ...r, synced: true } : r))); }
export function getUnsynced() { return loadRecs().filter(r => !r.synced); }
export function loadSession(): LastSession | null { try { return JSON.parse(localStorage.getItem(SK_SESSION) || 'null'); } catch { return null; } }
export function saveSession(s: LastSession) { localStorage.setItem(SK_SESSION, JSON.stringify(s)); }

/* ── Sanitize ── */
export function sanitizeRecords() {
  try {
    const recs = loadRecs();
    let dirty = false;
    const cleaned = recs.map(r => {
      if (!r.house_data) return r;
      let changed = false;
      const hd = { ...r.house_data };
      if (hd.max_temp !== null && !isValidTemp(hd.max_temp)) { hd.max_temp = null; changed = true; }
      if (hd.min_temp !== null && !isValidTemp(hd.min_temp)) { hd.min_temp = null; changed = true; }
      if (hd.humidity !== null && !isValidHumidity(hd.humidity)) { hd.humidity = null; changed = true; }
      const allNull = hd.max_temp === null && hd.min_temp === null && hd.humidity === null;
      if (changed) { dirty = true; return { ...r, house_data: allNull ? null : hd }; }
      return r;
    });
    if (dirty) localStorage.setItem(SK_RECORDS, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

/* ── Deep Clean (one-time migration) ── */
export function deepClean() {
  try {
    const CURRENT_CLEAN_VERSION = '2';
    if (localStorage.getItem(SK_DEEP_CLEANED) === CURRENT_CLEAN_VERSION) return;
    const recs = loadRecs();
    let dirty = false;
    const cleaned = recs.map(r => {
      let changed = false;
      if (r.house_data) {
        const hd = { ...r.house_data };
        if (typeof hd.max_temp === 'string') { const n = parseFloat(hd.max_temp); hd.max_temp = isNaN(n) ? null : n; changed = true; }
        if (typeof hd.min_temp === 'string') { const n = parseFloat(hd.min_temp); hd.min_temp = isNaN(n) ? null : n; changed = true; }
        if (typeof hd.humidity === 'string') { const n = parseFloat(hd.humidity); hd.humidity = isNaN(n) ? null : n; changed = true; }
        if (hd.max_temp !== null && !isValidTemp(hd.max_temp)) { hd.max_temp = null; changed = true; }
        if (hd.min_temp !== null && !isValidTemp(hd.min_temp)) { hd.min_temp = null; changed = true; }
        if (hd.humidity !== null && !isValidHumidity(hd.humidity)) { hd.humidity = null; changed = true; }
        const allNull = hd.max_temp === null && hd.min_temp === null && hd.humidity === null;
        if (changed) { dirty = true; return { ...r, house_data: allNull ? null : hd }; }
      }
      return r;
    }).filter(r => {
      const hasData = r.work_log || r.plant_status !== '良好' || r.fertilizer || r.pest_status ||
        r.harvest_amount || r.material_cost || r.work_duration || r.fuel_cost || r.house_data ||
        r.admin_log || r.raw_transcript;
      const age = Date.now() - (r.timestamp || 0);
      if (!hasData && age > 30 * 24 * 60 * 60 * 1000) { dirty = true; return false; }
      return true;
    });
    if (dirty) localStorage.setItem(SK_RECORDS, JSON.stringify(cleaned));
    localStorage.setItem(SK_DEEP_CLEANED, CURRENT_CLEAN_VERSION);
  } catch { /* ignore */ }
}

/* ── Location Master ── */
export function loadLocationMaster(): LocationMaster[] {
  try { return JSON.parse(localStorage.getItem(SK_LOCATIONS) || '[]'); }
  catch { return []; }
}

export function saveLocationMaster(masters: LocationMaster[]) {
  localStorage.setItem(SK_LOCATIONS, JSON.stringify(masters));
}

export function addLocation(name: string, alias?: string): LocationMaster {
  const masters = loadLocationMaster();
  const normalized = normalizeLocationName(name);
  if (!normalized) return masters[0] || { id: '', name: '', aliases: [], createdAt: 0 };
  const existing = masters.find(m => m.name === normalized);
  if (existing) {
    if (alias && !existing.aliases.includes(alias)) {
      existing.aliases.push(alias);
      saveLocationMaster(masters);
    }
    return existing;
  }
  const newLoc: LocationMaster = {
    id: crypto.randomUUID().slice(0, 8),
    name: normalized,
    aliases: alias && alias !== normalized ? [alias] : [],
    createdAt: Date.now(),
  };
  masters.push(newLoc);
  saveLocationMaster(masters);
  return newLoc;
}

export function findLocationByName(name: string): LocationMaster | undefined {
  const normalized = normalizeLocationName(name);
  return loadLocationMaster().find(m =>
    m.name === normalized || m.aliases.some(a => normalizeLocationName(a) === normalized)
  );
}

export function getLocationNames(): string[] {
  return loadLocationMaster().map(m => m.name);
}

export function migrateLocations() {
  if (loadLocationMaster().length > 0) return;
  const recs = loadRecs();
  const seen = new Set<string>();
  for (const r of recs) {
    const loc = r.location;
    if (!loc || loc === '場所未定' || seen.has(loc)) continue;
    const normalized = normalizeLocationName(loc);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    addLocation(normalized, loc !== normalized ? loc : undefined);
  }
}

/* ── IndexedDB Media Storage ── */
export function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('recordId', 'recordId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMediaBlob(recordId: string, blob: Blob, type: string): Promise<number> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.add({ recordId, blob, type, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function loadMediaForRecord(recordId: string): Promise<{ id: number; blob: Blob; type: string }[]> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAll(recordId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMediaForRecord(recordId: string): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAllKeys(recordId);
    req.onsuccess = () => {
      const keys = req.result;
      keys.forEach(k => store.delete(k));
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateMediaRecordId(oldId: string, newId: string): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const idx = store.index('recordId');
    const req = idx.getAll(oldId);
    req.onsuccess = () => {
      const items = req.result;
      items.forEach(item => { item.recordId = newId; store.put(item); });
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── Mood (empathy) ── */
const MOOD_MAX_DAYS = 90;

function loadMoodRaw(): MoodEntry[] {
  try { return JSON.parse(localStorage.getItem(SK_MOOD) || '[]'); } catch { return []; }
}

export function saveMoodEntry(emotion: EmotionAnalysis, weather: OutdoorWeather | null) {
  const entries = loadMoodRaw();
  const now = Date.now();
  const cutoff = now - MOOD_MAX_DAYS * 24 * 60 * 60 * 1000;
  const trimmed = entries.filter(e => e.timestamp > cutoff);
  trimmed.push({
    date: new Date().toISOString().split('T')[0],
    timestamp: now,
    tier: emotion.tier,
    score: emotion.score,
    categories: [...new Set(emotion.signals.map(s => s.category))],
    weather: weather ? { temp: weather.temperature, description: weather.description } : null,
  });
  localStorage.setItem(SK_MOOD, JSON.stringify(trimmed));
}

export function loadMood(): MoodEntry[] { return loadMoodRaw(); }

export function getMoodTrend(days: number): MoodEntry[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadMoodRaw().filter(e => e.timestamp > cutoff);
}

/* ── Calendar ── */
export function getCalDays(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let d = 1; d <= dim; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
