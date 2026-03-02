'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signIn: async () => {}, signOut: async () => {} });

export function useAuth() { return useContext(Ctx); }

const provider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuthInstance();
    getRedirectResult(auth).catch(() => {});
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  const signIn = useCallback(async () => {
    const auth = getAuthInstance();
    try {
      await signInWithPopup(auth, provider);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, provider);
      } else {
        throw e;
      }
    }
  }, []);

  const signOutFn = useCallback(async () => {
    const auth = getAuthInstance();
    await auth.signOut();
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut: signOutFn }}>
      {children}
    </Ctx.Provider>
  );
}
