import { useState } from "react";
import { Icon } from "../components/Icon";
import { duration, explorerTx, fromUnits, short, timeAgo, u64 } from "../lib/stellar";
import { ledgerNow, useVault, type ReleaseStatus } from "../lib/vault";
import { useWallet } from "../lib/wallet";
import { LoadError, Skeleton } from "./Overview";
import { AddVault, Copy, Notice, useAction } from "./shared";

type Filter = "waiting" | "paid" | "cancelled" | "all";

const STATUS: Record<ReleaseStatus, string> = {
  locked: "Locked",
  ready: "Ready to pay",
  paid: "Paid",
  cancelled: "Cancelled",
  closed: "Closed",
};

export function Releases() {
  const { state, queue, activeId, error, now } = useVault();
  const { net } = useWallet();
  const { run, busy, msg, setMsg, label } = useAction();
  const [filter, setFilter] = useState<Filter>("waiting");

  if (!activeId) return <AddVault />;
  if (error && !state) return <LoadError text={error} />;
  if (!state) return <Skeleton />;

  const t = ledgerNow(state, now);
  const rows = queue.filter((q) => {
    const waiting = q.status === "locked" || q.status === "ready";
    if (filter === "waiting") return waiting;
    if (filter === "paid") return q.status === "paid";
    if (filter === "cancelled") return q.status === "cancelled";
    return true;
  });
  const counts = {
    waiting: queue.filter((q) => q.status === "locked" || q.status === "ready").length,
    paid: queue.filter((q) => q.status === "paid").length,
    cancelled: queue.filter((q) => q.status === "cancelled").length,
    all: queue.length,
  };

  return (
    <div className="page">
      <p className="page-lede">
        Releases at or above {fromUnits(state.config.large_threshold, state.decimals)} {state.symbol}, or over the window cap,
        wait {duration(Number(state.config.delay_secs))} here. Anyone can pay one out after its timer. The guardian can cancel
        one at any time.
      </p>

      <div className="filter-row" role="tablist" aria-label="Filter releases">
        {(["waiting", "paid", "cancelled", "all"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>
            {f === "waiting" ? "Waiting" : f === "paid" ? "Paid" : f === "cancelled" ? "Cancelled" : "All"}
            <span className="chip-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      <Notice msg={msg} onClose={() => setMsg(null)} />

      {rows.length === 0 ? (
        <div className="empty-state small">
          <Icon name="lock" size={28} />
          <p>
            {filter === "waiting"
              ? "Nothing is waiting. Large releases show up here while their timer runs."
              : "No releases match this filter in the RPC's event window."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Recipient</th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col">Requested</th>
                <th scope="col">Unlock</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const open = q.status === "locked" || q.status === "ready";
                const ready = open && t >= q.releaseAt;
                const st: ReleaseStatus = open ? (ready ? "ready" : "locked") : q.status;
                const progress = open && !ready ? 1 - (q.releaseAt - t) / Number(state.config.delay_secs) : 1;
                const link = explorerTx(net, q.txHash);
                return (
                  <tr key={String(q.id)} className={open ? "" : "muted-row"}>
                    <td className="mono">{String(q.id)}</td>
                    <td>
                      <span className="mono">{short(q.to, 5)}</span> <Copy text={q.to} label="Copy recipient" />
                    </td>
                    <td className="num strong">
                      {fromUnits(q.amount, state.decimals)} {state.symbol}
                    </td>
                    <td>
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer">
                          {timeAgo(q.queuedAt)}
                        </a>
                      ) : (
                        timeAgo(q.queuedAt)
                      )}
                    </td>
                    <td>
                      {open ? (
                        <div className="unlock">
                          <span>{ready ? "Unlocked" : `in ${duration(q.releaseAt - t)}`}</span>
                          <span className="bar" aria-hidden="true">
                            <span style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%` }} />
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`tag ${st}`}>{STATUS[st]}</span>
                    </td>
                    <td>
                      {open && (
                        <div className="row-actions">
                          <button
                            className="btn small primary"
                            disabled={!ready || state.paused || !!busy}
                            onClick={() => void run(`execute-${q.id}`, "execute", () => [u64(q.id)], () => `Release #${q.id} paid out.`)}
                          >
                            {label(`execute-${q.id}`, "Pay out")}
                          </button>
                          <button
                            className="btn small danger"
                            disabled={!!busy}
                            onClick={() =>
                              void run(`cancel-${q.id}`, "cancel", () => [u64(q.id)], () => `Release #${q.id} cancelled. The funds stay in the vault.`)
                            }
                          >
                            {label(`cancel-${q.id}`, "Cancel")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
