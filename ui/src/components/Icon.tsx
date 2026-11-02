const PATHS: Record<string, string> = {
  overview: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  releases: "M4 12h11m0 0-4-4m4 4-4 4M20 5v14",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  controls: "M12 3v6m0 6v6M5 7v14M5 3v1m14 3v14M19 3v1M2 7h6M9 15h6m1-8h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5L9 5.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.5 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm14 7h.01",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "m5 12 5 5 9-10",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 1 1 8 0v3",
  pause: "M8 5v14m8-14v14",
  play: "m7 5 12 7-12 7z",
  plus: "M12 5v14M5 12h14",
  in: "M20 12H9m0 0 4-4m-4 4 4 4M4 5v14",
  x: "M6 6l12 12M18 6 6 18",
  github: "M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5 5 0 0 0-1.4-3.5 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C6 2.2 4.9 2.5 4.9 2.5a4.7 4.7 0 0 0-.1 3.5 5 5 0 0 0-1.4 3.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V22",
  menu: "M4 7h16M4 12h16M4 17h16",
  logout: "M15 12H4m0 0 4-4m-4 4 4 4M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5",
};

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; className?: string }) {
  const s = props.size ?? 20;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}
