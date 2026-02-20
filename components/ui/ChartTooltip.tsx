'use client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-stone-200/50 text-sm">
      <p className="font-bold text-stone-600 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => p.value != null && (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.dataKey === 'max_temp' ? '最高' : '最低'}: {p.value}℃
        </p>
      ))}
    </div>
  );
}
