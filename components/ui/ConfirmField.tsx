'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import type { ConfirmItem } from '@/lib/types';

const MULTILINE_KEYS = new Set(['admin_log', 'raw_transcript']);

export function ConfirmField({ item, onUpdate }: { item: ConfirmItem; onUpdate: (key: string, val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMultiline = MULTILINE_KEYS.has(item.key);

  useEffect(() => {
    if (editing) {
      if (isMultiline) textareaRef.current?.focus();
      else inputRef.current?.focus();
    }
  }, [editing, isMultiline]);

  return (
    <div className={`flex ${isMultiline ? 'flex-col gap-1' : 'items-center gap-3'} py-3 border-b border-stone-300`}>
      <p className={`text-base font-medium text-stone-400 ${isMultiline ? '' : 'w-20'} shrink-0`}>{item.label}</p>
      <div className="flex-1 min-w-0">
        {editing ? (
          isMultiline ? (
            <textarea ref={textareaRef} value={draft} onChange={e => setDraft(e.target.value)} rows={4}
              className="w-full text-lg font-bold text-stone-900 bg-transparent border-2 border-amber-400 outline-none py-1 px-2 rounded-lg resize-y" />
          ) : (
            <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onUpdate(item.key, draft); setEditing(false); } }}
              className="w-full text-xl font-bold text-stone-900 bg-transparent border-b-2 border-amber-400 outline-none py-1" />
          )
        ) : (
          isMultiline ? (
            <pre className="text-lg font-medium text-stone-900 whitespace-pre-wrap font-sans leading-relaxed">{item.value || '-'}</pre>
          ) : (
            <p className={`text-xl font-bold truncate ${item.value ? 'text-stone-900' : 'text-stone-400'}`}>{item.value || '-'}</p>
          )
        )}
      </div>
      <div className={`${isMultiline ? 'flex justify-end' : ''} shrink-0`}>
        {editing ? (
          <div className="flex gap-1">
            <button onClick={() => { onUpdate(item.key, draft); setEditing(false); }}
              className="p-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 btn-press"><Check className="w-5 h-5" /></button>
            <button onClick={() => { setDraft(item.value); setEditing(false); }}
              className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 btn-press"><X className="w-5 h-5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            className="p-2 rounded-full hover:bg-white/60 text-stone-400 btn-press"><Pencil className="w-5 h-5" /></button>
        )}
      </div>
    </div>
  );
}
