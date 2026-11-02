import { useId } from "react";

/**
 * Arc gauge: how much of this window's instant cap has been paid out.
 * A tick marks the single-release limit.
 */
export function Gauge(props: { cap: bigint; used: bigint; threshold: bigint; paused: boolean; size?: number }) {
  const { cap, used, threshold, paused } = props;
  const gid = useId().replace(/:/g, "");
  const frac = cap > 0n ? Math.min(1, Math.max(0, Number((used * 10_000n) / cap) / 10_000)) : 0;
  const tFrac = cap > 0n ? Math.min(1, Number((threshold * 10_000n) / cap) / 10_000) : 1;
  const pct = Math.round(frac * 100);

  const r = 96;
  const cx = 120;
  const cy = 118;
  const len = Math.PI * r;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const angle = Math.PI * (1 - tFrac);
  const tx = cx + Math.cos(angle) * r;
  const ty = cy - Math.sin(angle) * r;

  return (
    <figure className="gauge" style={{ width: props.size ?? 240 }}>
      <svg viewBox="0 0 240 136" role="img" aria-label={`${pct}% of this window's cap used${paused ? ". Vault paused." : ""}`}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={paused ? "#f1a3a3" : "#38bdf8"} />
            <stop offset="1" stopColor={paused ? "#dc2626" : "#0b7ea3"} />
          </linearGradient>
        </defs>
        <path d={arc} className="g-track" />
        <path
          d={arc}
          className="g-value"
          stroke={`url(#g${gid})`}
          strokeDasharray={`${len} ${len}`}
          style={{ ["--off" as string]: `${len}`, strokeDashoffset: len * (1 - frac) }}
        />
        {tFrac < 1 && (
          <g className="g-tick">
            <line x1={tx} y1={ty} x2={cx + Math.cos(angle) * (r - 22)} y2={cy - Math.sin(angle) * (r - 22)} />
          </g>
        )}
        <text x={cx} y={cy - 18} className="g-pct">
          {pct}%
        </text>
        <text x={cx} y={cy + 2} className="g-sub">
          of window cap used
        </text>
      </svg>
    </figure>
  );
}
