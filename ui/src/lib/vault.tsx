import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addr, describeError, loadJSON, read, saveJSON, scValToNative, server, sym, u64 } from "./stellar";
import { useWallet } from "./wallet";
import { DEMO_VAULT, demoData } from "./demo";

export const ERRORS: Record<number, string> = {
  1: "The vault is paused. Only the admin can resume it.",
  2: "The amount must be more than zero.",
  3: "Those limits are not valid. Every value must be above zero.",
  4: "No waiting release has that number. It may already be paid or cancelled.",
  5: "This release is still locked. Try again after it unlocks.",
};

export interface Config {
  window_secs: bigint;
  window_cap: bigint;
  large_threshold: bigint;
  delay_secs: bigint;
}

export interface VaultState {
  token: string;
  symbol: string;
  decimals: number;
  config: Config;
  paused: boolean;
  remaining: bigint;
  balance: bigint;
  ledgerTime: number;
  ledger: number;
  fetchedAt: number;
}

export type ReleaseStatus = "locked" | "ready" | "paid" | "cancelled" | "closed";

export interface QueueItem {
  id: bigint;
  to: string;
  amount: bigint;
  releaseAt: number;
  status: ReleaseStatus;
  queuedAt: string;
  txHash: string;
}

export type ActivityKind = "deposited" | "sent" | "queued" | "executed" | "cancelled" | "paused_changed";

export interface Activity {
  id: string;
  kind: ActivityKind;
  at: string;
  ledger: number;
  txHash: string;
  account?: string;
  amount?: bigint;
  releaseId?: bigint;
  paused?: boolean;
  releaseAt?: number;
}

export interface SavedVault {
  id: string;
  label: string;
}

interface VaultContextValue {
  vaults: SavedVault[];
  activeId?: string;
  setActive: (id: string) => void;
  addVault: (v: SavedVault) => void;
  removeVault: (id: string) => void;
  state?: VaultState;
  queue: QueueItem[];
  activity: Activity[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  now: number;
}

const Ctx = createContext<VaultContextValue | null>(null);
const KINDS: ActivityKind[] = ["deposited", "sent", "queued", "executed", "cancelled", "paused_changed"];
const STORE = "floodgate.vaults";

interface Stored {
  vaults: SavedVault[];
  activeId?: string;
}

export function VaultProvider(props: { children: ReactNode }) {
  const { net, demo } = useWallet();
  const envId = import.meta.env.VITE_CONTRACT_ID as string | undefined;
  const [stored, setStored] = useState<Stored>(() => {
    const s = loadJSON<Stored>(STORE, { vaults: [] });
    if (envId && !s.vaults.some((v) => v.id === envId)) s.vaults = [{ id: envId, label: "Default vault" }, ...s.vaults];
    if (!s.activeId && s.vaults[0]) s.activeId = s.vaults[0].id;
    return s;
  });
  const [state, setState] = useState<VaultState>();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => saveJSON(STORE, stored), [stored]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const id = demo ? DEMO_VAULT : stored.activeId;

  const refresh = useCallback(async () => {
    if (demo) {
      const d = demoData();
      setState(d.state);
      setQueue(d.queue);
      setActivity(d.activity);
      return;
    }
    if (!id || !net.rpcUrl) return;
    setLoading(true);
    setError(undefined);
    try {
      const [token, config, paused, remaining, latest] = await Promise.all([
        read(net, id, "token") as Promise<string>,
        read(net, id, "config") as Promise<Config>,
        read(net, id, "paused") as Promise<boolean>,
        read(net, id, "remaining") as Promise<bigint>,
        server(net.rpcUrl).getLatestLedger(),
      ]);
      const [symbol, decimals, balance] = await Promise.all([
        read(net, token, "symbol").catch(() => "tokens") as Promise<string>,
        read(net, token, "decimals").catch(() => 7) as Promise<number>,
        read(net, token, "balance", [addr(id)]).catch(() => 0n) as Promise<bigint>,
      ]);
      const ledgerTime = Number(latest.closeTime);
      setState({
        token,
        symbol: symbol === "native" ? "XLM" : symbol,
        decimals: Number(decimals),
        config,
        paused,
        remaining: BigInt(remaining),
        balance: BigInt(balance),
        ledgerTime,
        ledger: latest.sequence,
        fetchedAt: Date.now(),
      });

      const acts = await loadActivity(net, id, latest.sequence);
      setActivity(acts);
      setQueue(await buildQueue(net, id, acts, ledgerTime));
    } catch (e) {
      setState(undefined);
      setError(describeError(e, ERRORS));
    } finally {
      setLoading(false);
    }
  }, [id, net, demo]);

  useEffect(() => {
    setState(undefined);
    setQueue([]);
    setActivity([]);
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo<VaultContextValue>(
    () => ({
      vaults: demo ? [{ id: DEMO_VAULT, label: "Demo bridge reserve" }] : stored.vaults,
      activeId: id,
      setActive: (activeId) => setStored((s) => ({ ...s, activeId })),
      addVault: (v) =>
        setStored((s) => ({
          vaults: [...s.vaults.filter((x) => x.id !== v.id), v],
          activeId: v.id,
        })),
      removeVault: (rid) =>
        setStored((s) => {
          const vaults = s.vaults.filter((x) => x.id !== rid);
          return { vaults, activeId: s.activeId === rid ? vaults[0]?.id : s.activeId };
        }),
      state,
      queue,
      activity,
      loading,
      error,
      refresh,
      now,
    }),
    [stored, id, state, queue, activity, loading, error, refresh, now, demo],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useVault(): VaultContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault outside VaultProvider");
  return v;
}

/** Ledger time, advanced locally between refreshes. */
export function ledgerNow(state: VaultState | undefined, now: number): number {
  return state ? state.ledgerTime + Math.floor((now - state.fetchedAt) / 1000) : Math.floor(now / 1000);
}

async function loadActivity(net: ReturnType<typeof useWallet>["net"], id: string, latest: number): Promise<Activity[]> {
  // Each event's first topic is its name. paused_changed has no other topics.
  const withId = {
    type: "contract" as const,
    contractIds: [id],
    topics: KINDS.filter((k) => k !== "paused_changed").map((k) => [sym(k).toXDR("base64"), "*"]),
  };
  const pauses = { type: "contract" as const, contractIds: [id], topics: [[sym("paused_changed").toXDR("base64")]] };
  const filters = [withId, pauses];
  const s = server(net.rpcUrl);
  let res;
  try {
    res = await s.getEvents({ filters, startLedger: Math.max(1, latest - 100_000), limit: 500 });
  } catch {
    res = await s.getEvents({ filters, startLedger: Math.max(1, latest - 10_000), limit: 500 });
  }

  const out: Activity[] = [];
  for (const ev of res.events) {
    const kind = scValToNative(ev.topic[0]) as ActivityKind;
    if (!KINDS.includes(kind)) continue;
    const t1 = ev.topic[1] ? scValToNative(ev.topic[1]) : undefined;
    const data = (scValToNative(ev.value) ?? {}) as Record<string, unknown>;
    const a: Activity = { id: ev.id, kind, at: ev.ledgerClosedAt, ledger: ev.ledger, txHash: ev.txHash };
    if (kind === "deposited" || kind === "sent") {
      a.account = t1 as string;
      a.amount = BigInt(data.amount as bigint);
    } else if (kind === "queued") {
      a.releaseId = BigInt(t1 as bigint);
      a.account = data.to as string;
      a.amount = BigInt(data.amount as bigint);
      a.releaseAt = Number(data.release_at as bigint);
    } else if (kind === "executed" || kind === "cancelled") {
      a.releaseId = BigInt(t1 as bigint);
    } else if (kind === "paused_changed") {
      a.paused = Boolean(data.paused);
    }
    out.push(a);
  }
  return out.reverse();
}

async function buildQueue(
  net: ReturnType<typeof useWallet>["net"],
  id: string,
  acts: Activity[],
  ledgerTime: number,
): Promise<QueueItem[]> {
  const ended = new Map<string, ReleaseStatus>();
  for (const a of acts) {
    if (a.kind === "executed") ended.set(String(a.releaseId), "paid");
    if (a.kind === "cancelled") ended.set(String(a.releaseId), "cancelled");
  }
  const items: QueueItem[] = [];
  for (const a of acts) {
    if (a.kind !== "queued" || a.releaseId === undefined) continue;
    items.push({
      id: a.releaseId,
      to: a.account ?? "",
      amount: a.amount ?? 0n,
      releaseAt: a.releaseAt ?? 0,
      status: ended.get(String(a.releaseId)) ?? "locked",
      queuedAt: a.at,
      txHash: a.txHash,
    });
  }
  await Promise.all(
    items.map(async (item) => {
      const live = (await read(net, id, "queued", [u64(item.id)]).catch(() => undefined)) as
        | { release_at: bigint }
        | undefined;
      if (live) {
        item.releaseAt = Number(live.release_at);
        item.status = ledgerTime >= item.releaseAt ? "ready" : "locked";
      } else if (item.status === "locked") {
        item.status = "closed";
      }
    }),
  );
  return items.sort((a, b) => Number(b.id - a.id));
}
