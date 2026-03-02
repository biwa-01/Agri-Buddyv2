'use client';

import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/client/auth';
import { CARD_FLAT } from '@/lib/constants';

export function LoginButton() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return null;

  if (user) {
    const name = user.displayName?.split(' ')[0] || 'User';
    return (
      <button
        onClick={signOut}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold ${CARD_FLAT} btn-press`}
      >
        <span className="text-stone-700 max-w-[5rem] truncate">{name}</span>
        <LogOut className="w-3.5 h-3.5 text-stone-500" />
      </button>
    );
  }

  return (
    <button
      onClick={signIn}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold ${CARD_FLAT} btn-press`}
    >
      <LogIn className="w-3.5 h-3.5 text-stone-500" />
      <span className="text-stone-700">ログイン</span>
    </button>
  );
}
