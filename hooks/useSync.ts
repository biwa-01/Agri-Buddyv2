'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { fullSync, forceSync } from '@/lib/client/sync';
import { getUnsynced, markSync, saveAllRecs } from '@/lib/client/storage';

export function useSync(user: User | null, mounted: boolean, onSyncComplete: () => void) {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [pendSync, setPendSync] = useState(0);
  const syncingRef = useRef(false);

  const syncRecs = useCallback(async () => {
    if (!user) {
      const u = getUnsynced(); if (u.length === 0) return;
      u.forEach(r => markSync(r.id)); setPendSync(0);
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      const TIMEOUT = 15_000;
      const merged = await Promise.race([
        fullSync(user.uid),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('sync timeout')), TIMEOUT)),
      ]);
      saveAllRecs(merged);
      setPendSync(0);
      onSyncComplete();
      setSyncStatus('done');
    } catch (err) {
      console.error('[sync]', err);
      setSyncStatus('error');
      setPendSync(getUnsynced().length);
    } finally {
      syncingRef.current = false;
    }
  }, [user, onSyncComplete]);

  const handleForceSync = useCallback(async () => {
    if (!user) return;
    if (syncingRef.current) return;
    if (!window.confirm('ローカルデータをクラウドへ統合しますか？')) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      const TIMEOUT = 15_000;
      const { merged, pushed } = await Promise.race([
        forceSync(user.uid),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('forceSync timeout')), TIMEOUT)),
      ]);
      saveAllRecs(merged);
      setPendSync(0);
      onSyncComplete();
      setSyncStatus('done');
      alert(`${pushed}件の送信を完了しました`);
    } catch (err) {
      console.error('[forceSync]', err);
      setSyncStatus('error');
      alert('同期に失敗しました');
    } finally {
      syncingRef.current = false;
    }
  }, [user, onSyncComplete]);

  // Online/offline listeners
  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendSync(getUnsynced().length);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Auto-sync on online recovery
  useEffect(() => { if (isOnline && mounted) syncRecs(); }, [isOnline, mounted, syncRecs]);
  // Auto-sync on login
  useEffect(() => { if (user && mounted) syncRecs(); }, [user, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  return { syncStatus, isOnline, pendSync, setPendSync, syncRecs, handleForceSync };
}
