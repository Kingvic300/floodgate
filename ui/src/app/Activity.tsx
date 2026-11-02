import { useState } from "react";
import { useVault, type ActivityKind } from "../lib/vault";
import { ActivityList } from "./ActivityList";
import { LoadError, Skeleton } from "./Overview";
import { AddVault } from "./shared";

const GROUPS: { id: string; label: string; kinds: ActivityKind[] }[] = [
  { id: "all", label: "Everything", kinds: [] },
  { id: "in", label: "Deposits", kinds: ["deposited"] },
  { id: "out", label: "Payouts", kinds: ["sent", "executed"] },
  { id: "wait", label: "Queue", kinds: ["queued", "cancelled"] },
  { id: "stop", label: "Pauses", kinds: ["paused_changed"] },
];

export function ActivityPage() {
  const { state, activity, activeId, error } = useVault();
  const [group, setGroup] = useState("all");

  if (!activeId) return <AddVault />;
  if (error && !state) return <LoadError text={error} />;
  if (!state) return <Skeleton />;

  const g = GROUPS.find((x) => x.id === group)!;
  const items = g.kinds.length ? activity.filter((a) => g.kinds.includes(a.kind)) : activity;

  // Group by calendar day for scanning.
  const days = new Map<string, typeof items>();
  for (const a of items) {
    const d = new Date(a.at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    days.set(d, [...(days.get(d) ?? []), a]);
  }

  return (
    <div className="page">
      <p className="page-lede">
        Every event the vault emitted within the RPC server's retention window, newest first. SDF's testnet RPC keeps about
        seven days.
      </p>
      <div className="filter-row" role="tablist" aria-label="Filter activity">
        {GROUPS.map((x) => (
          <button key={x.id} role="tab" aria-selected={group === x.id} className={group === x.id ? "chip on" : "chip"} onClick={() => setGroup(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <ActivityList items={[]} state={state} />
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="day">
            <h2 className="day-title">{day}</h2>
            <ActivityList items={list} state={state} />
          </section>
        ))
      )}
    </div>
  );
}
