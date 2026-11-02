import { Icon, type IconName } from "../components/Icon";
import { explorerTx, fromUnits, short, timeAgo } from "../lib/stellar";
import type { Activity, VaultState } from "../lib/vault";
import { useWallet } from "../lib/wallet";

const META: Record<Activity["kind"], { icon: IconName; tone: string }> = {
  deposited: { icon: "in", tone: "in" },
  sent: { icon: "releases", tone: "out" },
  queued: { icon: "lock", tone: "wait" },
  executed: { icon: "check", tone: "out" },
  cancelled: { icon: "x", tone: "stop" },
  paused_changed: { icon: "pause", tone: "stop" },
};

function sentence(a: Activity, s: VaultState): string {
  const amt = a.amount !== undefined ? `${fromUnits(a.amount, s.decimals)} ${s.symbol}` : "";
  switch (a.kind) {
    case "deposited":
      return `${short(a.account ?? "")} deposited ${amt}`;
    case "sent":
      return `${amt} paid to ${short(a.account ?? "")}`;
    case "queued":
      return `Release #${a.releaseId} of ${amt} to ${short(a.account ?? "")} is waiting`;
    case "executed":
      return `Release #${a.releaseId} paid out`;
    case "cancelled":
      return `Release #${a.releaseId} cancelled by the guardian`;
    case "paused_changed":
      return a.paused ? "Vault paused" : "Vault resumed";
  }
}

export function ActivityList(props: { items: Activity[]; state: VaultState; limit?: number; empty?: string }) {
  const { net } = useWallet();
  const items = props.limit ? props.items.slice(0, props.limit) : props.items;
  if (items.length === 0) return <p className="empty-line">{props.empty ?? "No activity in the RPC's event window yet."}</p>;
  return (
    <ol className="timeline">
      {items.map((a) => {
        const m = META[a.kind];
        const link = explorerTx(net, a.txHash);
        return (
          <li key={a.id} className={`tl-item ${m.tone}`}>
            <span className="tl-icon">
              <Icon name={m.icon} size={16} />
            </span>
            <span className="tl-text">{sentence(a, props.state)}</span>
            <span className="tl-time" title={new Date(a.at).toLocaleString()}>
              {timeAgo(a.at)}
            </span>
            {link && (
              <a className="tl-link" href={link} target="_blank" rel="noreferrer" aria-label="View transaction">
                <Icon name="external" size={14} />
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
