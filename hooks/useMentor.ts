'use client';

import { useState, useRef } from 'react';
import type { EmotionAnalysis } from '@/lib/types';

export function useMentor() {
  const [mentorDraft, setMentorDraft] = useState('');
  const [mentorCopied, setMentorCopied] = useState(false);
  const [mentorStep, setMentorStep] = useState<'comfort' | 'ask' | 'sheet'>('comfort');
  const [consultSheet, setConsultSheet] = useState('');
  const [empathyCard, setEmpathyCard] = useState<EmotionAnalysis | null>(null);

  const sosDetectedRef = useRef(false);
  const tier2DetectedRef = useRef<EmotionAnalysis | null>(null);
  const normalEmotionRef = useRef<EmotionAnalysis | null>(null);

  return {
    mentorDraft, setMentorDraft,
    mentorCopied, setMentorCopied,
    mentorStep, setMentorStep,
    consultSheet, setConsultSheet,
    empathyCard, setEmpathyCard,
    sosDetectedRef, tier2DetectedRef, normalEmotionRef,
  };
}
