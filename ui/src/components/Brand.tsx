import { Link } from "../lib/router";

/** Logo mark: a gate holding back water, in a rounded tile. */
export function Mark(props: { size?: number }) {
  const s = props.size ?? 30;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="fg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#075e7b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#fg-mark)" />
      <path d="M5 21c2.2-1.6 4.4-1.6 6.6 0V27H5z" fill="#fff" fillOpacity=".55" />
      <rect x="13.5" y="7" width="5" height="20" rx="2" fill="#fff" />
      <path d="M20.5 24.5c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" strokeOpacity=".8" />
    </svg>
  );
}

export function Brand(props: { to?: string }) {
  return (
    <Link to={props.to ?? "/"} className="brand" aria-label="Floodgate home">
      <Mark />
      <span className="brand-word">Floodgate</span>
    </Link>
  );
}
