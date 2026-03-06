'use client';

import { collection, getDocs, setDoc, doc, writeBatch } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';
import type { LocalRecord } from '@/lib/types';
import { loadRecs, backupRecords } from '@/lib/client/storage';

/* ── Firestore ⇄ LocalRecord 変換 ── */

function toFirestoreDoc(rec: LocalRecord): Record<string, unknown> {
  // synced はローカル専用フラグ → Firestoreには書かない
  const { synced: _, ...rest } = rec;
  const obj: Record<string, unknown> = { ...rest, updatedAt: Date.now() };
  // Firestoreはundefined値を拒否する → 削除
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

function fromFirestoreDoc(data: Record<string, unknown>): LocalRecord {
  return {
    id: String(data.id ?? ''),
    date: String(data.date ?? ''),
    location: String(data.location ?? ''),
    house_data: (data.house_data as LocalRecord['house_data']) ?? null,
    work_log: String(data.work_log ?? ''),
    plant_status: String(data.plant_status ?? ''),
    advice: String(data.advice ?? ''),
    admin_log: String(data.admin_log ?? ''),
    fertilizer: String(data.fertilizer ?? ''),
    pest_status: String(data.pest_status ?? ''),
    harvest_amount: String(data.harvest_amount ?? ''),
    material_cost: String(data.material_cost ?? ''),
    work_duration: String(data.work_duration ?? ''),
    fuel_cost: String(data.fuel_cost ?? ''),
    strategic_advice: String(data.strategic_advice ?? ''),
    pesticide_detail: String(data.pesticide_detail ?? ''),
    photo_count: Number(data.photo_count ?? 0),
    estimated_profit: typeof data.estimated_profit === 'number' ? data.estimated_profit : undefined,
    raw_transcript: data.raw_transcript ? String(data.raw_transcript) : undefined,
    location_id: data.location_id ? String(data.location_id) : undefined,
    narrative: data.narrative ? String(data.narrative) : undefined,
    insight: data.insight ? String(data.insight) : undefined,
    synced: true,
    timestamp: Number(data.timestamp ?? 0),
  };
}

/* ── Pull: Firestore → LocalRecord[] ── */

async function pullRecords(uid: string): Promise<LocalRecord[]> {
  const db = getDbInstance();
  const snap = await getDocs(collection(db, 'users', uid, 'records'));
  return snap.docs.map(d => fromFirestoreDoc(d.data()));
}

/* ── Push: 単一レコード ── */

export async function pushRecord(uid: string, rec: LocalRecord): Promise<void> {
  const db = getDbInstance();
  const ref = doc(db, 'users', uid, 'records', rec.id);
  await setDoc(ref, toFirestoreDoc(rec));
}

/* ── Push: バッチ書き込み（500件上限考慮） ── */

async function pushRecordsBatch(uid: string, recs: LocalRecord[]): Promise<void> {
  const db = getDbInstance();
  const BATCH_LIMIT = 500;
  for (let i = 0; i < recs.length; i += BATCH_LIMIT) {
    const chunk = recs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const rec of chunk) {
      if (!rec.id) continue; // 空IDスキップ
      const ref = doc(db, 'users', uid, 'records', rec.id);
      batch.set(ref, toFirestoreDoc(rec));
    }
    try {
      await batch.commit();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error('[pushRecordsBatch] batch.commit failed', {
        code: err.code, message: err.message,
        chunkIndex: i / BATCH_LIMIT,
        ids: chunk.map(r => r.id),
      });
      throw e;
    }
  }
}

/* ── Merge: local + remote → 統合結果 ── */

function mergeRecords(local: LocalRecord[], remote: LocalRecord[]): { merged: LocalRecord[]; toPush: LocalRecord[] } {
  const map = new Map<string, LocalRecord>();
  const toPush: LocalRecord[] = [];

  // リモート全件投入
  for (const r of remote) {
    map.set(r.id, { ...r, synced: true });
  }

  // ローカルをイテレート
  for (const l of local) {
    const existing = map.get(l.id);
    if (!existing) {
      // リモートにない → 追加（要プッシュ）
      map.set(l.id, { ...l, synced: false });
      toPush.push(l);
    } else if (l.timestamp >= existing.timestamp) {
      // ローカルが新しい → ローカル優先（要プッシュ）
      map.set(l.id, { ...l, synced: false });
      toPush.push(l);
    }
    // それ以外: リモート維持
  }

  const merged = Array.from(map.values()).map(r => ({ ...r, synced: true }));
  return { merged, toPush };
}

/* ── Force Sync: backup → pull → merge → 全件push → 統合結果返却 ── */

export async function forceSync(uid: string): Promise<{ merged: LocalRecord[]; pushed: number }> {
  try {
    backupRecords();
    const [remote, local] = await Promise.all([
      pullRecords(uid),
      Promise.resolve(loadRecs()),
    ]);

    const { merged } = mergeRecords(local, remote);

    // 差分ではなく merged 全件をクラウドへ送信
    await pushRecordsBatch(uid, merged);

    return { merged, pushed: merged.length };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error('[forceSync] failed', { code: err.code, message: err.message });
    throw e;
  }
}

/* ── Full Sync: backup → pull → merge → push差分 → 統合結果返却 ── */

export async function fullSync(uid: string): Promise<LocalRecord[]> {
  try {
    backupRecords();
    const [remote, local] = await Promise.all([
      pullRecords(uid),
      Promise.resolve(loadRecs()),
    ]);

    const { merged, toPush } = mergeRecords(local, remote);

    if (toPush.length > 0) {
      await pushRecordsBatch(uid, toPush);
    }

    return merged;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error('[fullSync] failed', { code: err.code, message: err.message });
    throw e;
  }
}
