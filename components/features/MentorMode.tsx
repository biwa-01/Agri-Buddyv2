'use client';

import { HandHeart, PhoneCall, Check } from 'lucide-react';
import { GLASS, CARD_FLAT } from '@/lib/constants';

type MentorStep = 'comfort' | 'ask' | 'sheet';

interface MentorModeProps {
  mentorStep: MentorStep;
  mentorDraft: string;
  mentorCopied: boolean;
  consultSheet: string;
  setMentorStep: (step: MentorStep) => void;
  setMentorCopied: (v: boolean) => void;
  onReset: () => void;
}

export function MentorMode({
  mentorStep, mentorDraft, mentorCopied, consultSheet,
  setMentorStep, setMentorCopied, onReset,
}: MentorModeProps) {
  return (
    <section className="mx-5 mb-4 fade-up">
      <div className={`p-5 rounded-2xl ${GLASS}`}>
        {mentorStep === 'comfort' && (
          <>
            <div className="flex flex-col items-center gap-4 py-6">
              <HandHeart className="w-16 h-16 text-amber-600" />
              <p className="text-xl font-bold text-stone-800 text-center leading-relaxed">
                きもちを受けとめています...
              </p>
              {mentorDraft && (
                <div className={`w-full p-4 rounded-xl ${CARD_FLAT}`}>
                  <p className="text-lg font-medium text-stone-600">{mentorDraft}</p>
                </div>
              )}
            </div>
          </>
        )}
        {mentorStep === 'ask' && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <HandHeart className="w-12 h-12 text-amber-600" />
              <p className="text-xl font-bold text-stone-800 text-center leading-relaxed mb-2">
                行政や相談窓口に<br/>相談しますか？
              </p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setMentorStep('sheet')}
                  className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                  <PhoneCall className="w-6 h-6" /> はい
                </button>
                <button onClick={onReset}
                  className="flex-1 py-5 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                  いいえ
                </button>
              </div>
            </div>
          </>
        )}
        {mentorStep === 'sheet' && (
          <>
            <h2 className="font-display text-2xl font-bold text-stone-900 tracking-wider mb-4">営農相談シート</h2>
            <pre className="text-lg text-stone-700 whitespace-pre-wrap leading-relaxed font-sans mb-5">{consultSheet}</pre>
            <div className="flex gap-3">
              <button onClick={() => {
                navigator.clipboard.writeText(consultSheet);
                setMentorCopied(true);
                setTimeout(() => setMentorCopied(false), 2000);
              }}
                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#FF6B00] text-white text-xl font-bold shadow-lg btn-press flex items-center justify-center gap-2">
                {mentorCopied ? <><Check className="w-6 h-6" /> コピー済</> : <><PhoneCall className="w-5 h-5" /> コピーして相談</>}
              </button>
              <button onClick={onReset}
                className="py-4 px-6 rounded-2xl bg-stone-200/80 text-stone-600 text-xl font-bold btn-press flex items-center justify-center gap-2">
                やめる
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
