import { Gauge } from "./Gauge";
import { Icon } from "./Icon";

const U = 10_000_000n;

const STAGES = [
  { t: "Requested", s: "Operator asked" },
  { t: "Over limit", s: "48,000 ≥ 5,000" },
  { t: "Queued", s: "Release #14" },
  { t: "Guardian window", s: "19 h left" },
  { t: "Paid", s: "After the wait" },
];

const ROWS = [
  { id: "14", to: "GCKF…MTGG", amt: "48,000.00", st: "Locked 19 h", tone: "amber" },
  { id: "13", to: "GDQN…KTL3", amt: "7,500.00", st: "Locked 2 h", tone: "amber" },
  { id: "12", to: "GBRP…OX2H", amt: "12,000.00", st: "Ready", tone: "green" },
  { id: "11", to: "GAHK…DB4A", amt: "250,000.00", st: "Cancelled", tone: "red" },
];

/** Hero product card with two floating detail cards. Static sample data. */
export function ProductShot() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="pcard">
        <div className="pcard-head">
          <div>
            <div className="pcard-kicker">Bridge reserve · USDC</div>
            <div className="pcard-title">
              Release #14 of <mark>48,000 USDC</mark> is held for <mark>24 hours</mark>
            </div>
          </div>
          <span className="pill amber">
            <span className="dot" /> Waiting
          </span>
        </div>
        <ol className="stepper">
          {STAGES.map((s, i) => (
            <li key={s.t} className={i < 3 ? "done" : i === 3 ? "now" : ""}>
              <span className="stepper-dot">{i < 3 ? <Icon name="check" size={12} /> : null}</span>
              <span className="stepper-t">{s.t}</span>
              <span className="stepper-s">{s.s}</span>
            </li>
          ))}
        </ol>
        <div className="pcard-table">
          {ROWS.map((r) => (
            <div key={r.id} className="pcard-row">
              <span className="muted">#{r.id}</span>
              <span className="mono">{r.to}</span>
              <span className={`pill ${r.tone}`}>{r.st}</span>
              <span className="num">{r.amt} USDC</span>
            </div>
          ))}
          <div className="pcard-row total">
            <span>Held in vault</span>
            <span className="num">2,418,550.00 USDC</span>
          </div>
        </div>
      </div>

      <div className="float float-left">
        <Gauge cap={10_000n * U} used={6_180n * U} threshold={5_000n * U} paused={false} size={112} />
        <div>
          <div className="float-title">3,820 USDC left this hour</div>
          <div className="float-sub">Instant cap resets in 24 min</div>
        </div>
      </div>

      <div className="float float-right">
        <div className="float-kicker">Guardian on watch</div>
        <div className="float-person">
          <span className="avatar a1">SC</span>
          <div>
            <div className="float-title">Security council</div>
            <div className="mono float-sub">GA7Q…3KZP</div>
          </div>
          <span className="pill ghost">Can cancel</span>
        </div>
        <div className="float-person">
          <span className="avatar a2">MS</span>
          <div>
            <div className="float-title">Treasury multisig</div>
            <div className="mono float-sub">GB2X…91TD</div>
          </div>
          <span className="pill ghost">Admin</span>
        </div>
      </div>
    </div>
  );
}
