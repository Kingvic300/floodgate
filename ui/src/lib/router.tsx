import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

/** Minimal hash router. Works on any static host with no rewrite rules. */
function current(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

export function useRoute(): string {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => {
      setRoute(current());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function Link(props: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { to, children, ...rest } = props;
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}

/** Scroll to an in-page section without touching the hash route. */
export function scrollToId(id: string): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
