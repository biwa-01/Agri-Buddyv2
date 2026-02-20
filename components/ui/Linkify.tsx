'use client';

/**
 * Linkify — renders URLs as links AND **bold** markers as styled fact/advice blocks.
 * - **text** → bold, stone-900, sans-serif (fact)
 * - plain text → normal weight, serif (advice)
 * - URLs → amber link
 */
export function Linkify({ text }: { text: string }) {
  // Split by **bold** markers and URLs
  const re = /(\*\*[^*]+\*\*|https?:\/\/[^\s）)]+)/g;
  const parts = text.split(re);

  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          const inner = p.slice(2, -2);
          return (
            <span key={i} className="block text-xl font-black text-stone-900 font-sans mb-1">
              {inner}
            </span>
          );
        }
        if (/^https?:\/\//.test(p)) {
          return (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer"
              className="text-amber-600 underline underline-offset-2 hover:text-amber-500 break-all">
              {p}
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
