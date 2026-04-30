"use client";

export interface UsageLineChartPoint {
  date: string;
  value: number;
}

interface UsageLineChartProps {
  data: UsageLineChartPoint[];
  /** Label for Y axis (e.g. "Requests") */
  valueLabel?: string;
  className?: string;
}

/**
 * Lightweight SVG line chart — no external charting dependency.
 */
export default function UsageLineChart({
  data,
  valueLabel = "Requests",
  className = "",
}: UsageLineChartProps) {
  const width = 640;
  const height = 176;
  const padL = 48;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  if (data.length === 0) {
    return (
      <div
        className={`rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500 ${className}`}
      >
        No data for this period.
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const maxV = Math.max(1, ...values);
  const minV = 0;
  const n = data.length;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) =>
    padT + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const points = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(" ");

  const tickCount = Math.min(5, n);
  const tickStep = Math.max(1, Math.ceil(n / tickCount));
  const xLabels = data
    .map((d, idx) => ({ ...d, idx }))
    .filter((_, i) => i % tickStep === 0 || i === n - 1);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full max-w-full text-zinc-400"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${valueLabel} over time`}
      >
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="none"
          stroke="rgb(39 39 42)"
          strokeWidth={1}
          rx={4}
        />
        <polyline
          fill="none"
          stroke="rgb(52 211 153)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={xAt(i)}
            cy={yAt(d.value)}
            r={3}
            fill="rgb(16 185 129)"
          />
        ))}
        <text x={padL} y={12} className="fill-zinc-500 text-[10px]">
          {valueLabel}
        </text>
        {xLabels.map((d) => (
          <text
            key={`${d.date}-${d.idx}`}
            x={xAt(d.idx)}
            y={height - 10}
            textAnchor="middle"
            className="fill-zinc-500 text-[9px]"
          >
            {d.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
