/**
 * River staff gauge. The water level is how much has left the vault in the
 * current window. The top of the board is the window cap.
 */
export function Gauge(props: { cap: bigint; used: bigint; threshold: bigint; paused: boolean }) {
  const { cap, used, threshold, paused } = props;
  const frac = cap > 0n ? Math.min(1, Math.max(0, Number((used * 10_000n) / cap) / 10_000)) : 0;
  const thresholdFrac = cap > 0n ? Number((threshold * 10_000n) / cap) / 10_000 : 1;

  const top = 24;
  const height = 400;
  const bottom = top + height;
  const bands = 10;
  const band = height / bands;
  const level = bottom - height * frac;
  const pct = Math.round(frac * 100);

  return (
    <figure className="gauge" aria-label={`${pct}% of this window's limit has been released${paused ? ". The vault is paused." : ""}`}>
      <svg viewBox="0 0 180 448" role="img" aria-hidden="true">
        <rect className="board" x="52" y={top} width="64" height={height} rx="2" />
        {Array.from({ length: bands }, (_, i) => {
          const y = bottom - (i + 1) * band;
          const cls = i % 2 === 0 ? "mark ink" : "mark red";
          return (
            <g key={i} className={cls}>
              <rect x="58" y={y + 4} width="9" height={band - 8} />
              <rect x="58" y={y + 4} width="30" height="6" />
              <rect x="58" y={y + band / 2 - 3} width="22" height="6" />
              <rect x="58" y={y + band - 10} width="30" height="6" />
              {(i + 1) % 2 === 0 && (
                <text x="124" y={y + 6} className="tick-label">
                  {(i + 1) * 10}%
                </text>
              )}
            </g>
          );
        })}

        {thresholdFrac < 1 && (
          <g className="threshold">
            <line x1="40" x2="124" y1={bottom - height * thresholdFrac} y2={bottom - height * thresholdFrac} />
            <text x="38" y={bottom - height * thresholdFrac + 4} textAnchor="end">
              single
            </text>
          </g>
        )}

        <g className={paused ? "water still" : "water"} style={{ ["--rise" as string]: `${bottom - level}px` }}>
          <path
            d={`M0 ${level} q 22 -7 45 0 t 45 0 t 45 0 t 45 0 V ${bottom + 24} H 0 Z`}
          />
        </g>

        {paused && <rect className="gate" x="44" y={top - 10} width="80" height="14" rx="2" />}
        <text x="84" y={top - 14} textAnchor="middle" className="cap-label">
          limit
        </text>
      </svg>
      <figcaption>
        <span className="gauge-pct">{pct}%</span> of this window's limit used
      </figcaption>
    </figure>
  );
}
