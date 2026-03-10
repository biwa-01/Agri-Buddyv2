'use client';

import { useState, useCallback, useRef } from 'react';

export function useCelebration() {
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebExiting, setCelebExiting] = useState(false);
  const [celebrationProfit, setCelebrationProfit] = useState(0);
  const [profitPreview, setProfitPreview] = useState<{ total: number; details: string[]; message: string; praise: string; marketTip: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCelebration = useCallback((profit: number) => {
    setCelebrationProfit(profit);
    setShowCelebration(true);
    setCelebExiting(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCelebExiting(true);
      timerRef.current = setTimeout(() => {
        setShowCelebration(false);
        setCelebExiting(false);
      }, 500);
    }, 3500);
  }, []);

  return {
    showCelebration, celebExiting, celebrationProfit,
    profitPreview, setProfitPreview,
    triggerCelebration,
  };
}
