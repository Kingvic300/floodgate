import { Brand } from "../components/Brand";
import { Icon, type IconName } from "../components/Icon";
import { ProductShot } from "../components/ProductShot";
import { Link, navigate, scrollToId } from "../lib/router";
import { useWallet } from "../lib/wallet";

const REPO = "https://github.com/Kingvic300/floodgate";

const DRAINS = [
  { amount: "$625M", name: "Ronin bridge", when: "Mar 2022", how: "Five stolen validator keys. The bridge was emptied in two transactions." },
  { amount: "$320M", name: "Wormhole", when: "Feb 2022", how: "A bypassed signature check minted 120,000 wrapped ETH, withdrawn at once." },
  { amount: "$190M", name: "Nomad bridge", when: "Aug 2022", how: "A faulty upgrade let hundreds of wallets copy the exploit within hours." },
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "releases", title: "Operator requests a payout", body: "Your bridge or treasury calls release. It is the only way funds leave." },
  { icon: "check", title: "Small payouts settle now", body: "Under the single-release limit and within this window's cap? Paid in the same transaction." },
  { icon: "lock", title: "Large payouts wait", body: "Bigger amounts, or anything over the cap, enter a time-locked queue. Funds stay put." },
  { icon: "pause", title: "Guardian can step in", body: "During the wait, the guardian cancels a payout or pauses the vault." },
];

const FEATURES: { icon: IconName; title: string; body: string; wide?: boolean }[] = [
  {
    icon: "overview",
    title: "Rate-limited payouts",
    body: "Set an instant cap per time window. Everyday flow is untouched. A stolen key can take one window's cap, never the pool.",
    wide: true,
  },
  {
    icon: "lock",
    title: "Time-locked queue",
    body: "Large releases wait a delay you choose, in public, with an on-chain event the moment they are requested.",
    wide: true,
  },
  { icon: "pause", title: "One-tap kill switch", body: "The guardian can pause everything. Only the admin can resume." },
  { icon: "controls", title: "Separated roles", body: "Admin, guardian and operator are different keys with different powers." },
  { icon: "wallet", title: "Any Soroban token", body: "Works with any standard token, including XLM and USDC asset contracts." },
  { icon: "github", title: "Open source", body: "Apache-2.0. Read every line, fork it, or contribute through Drips Wave." },
];

const FAQ = [
  {
    q: "Does Floodgate hold my funds?",
    a: "Funds sit in the Floodgate contract you deploy. Nobody operates it for you. The admin, guardian and operator are addresses you choose, such as a multisig.",
  },
  {
    q: "What stops an attacker who steals the operator key?",
    a: "They can take at most what fits under the current window's cap. Anything larger waits in the queue, where the guardian can cancel it.",
  },
  {
    q: "What if the guardian key is stolen?",
    a: "The guardian can only pause and cancel. It cannot move funds or resume the vault, so the worst case is a freeze the admin can lift.",
  },
  {
    q: "Which tokens does it support?",
    a: "Any Soroban token that follows the standard token interface, including Stellar assets such as XLM and USDC. Version 0.1 holds one token per vault.",
  },
  {
    q: "Is it audited?",
    a: "Not yet. Version 0.1 is open source with unit tests. An audit through the Stellar Community Fund Audit Bank is on the roadmap. Do not hold real funds in it before then.",
  },
];

export function Landing() {
  const { address, enterDemo } = useWallet();
  const appLink = address ? "/app" : "/connect";
  const demo = () => {
    enterDemo();
    navigate("/app");
  };

  return (
    <div className="mk">
      <div className="announce">
        Open source and live on Stellar testnet.{" "}
        <a href={REPO} target="_blank" rel="noreferrer">
          Read the contract
        </a>
      </div>
      <header className="mk-nav">
        <div className="nav-card">
          <div className="row tight">
            <Brand />
            <span className="nav-tag">v0.1</span>
          </div>
          <nav className="nav-pills" aria-label="Sections">
            <button className="mk-navlink" onClick={() => scrollToId("how")}>
              How it works
            </button>
            <button className="mk-navlink" onClick={() => scrollToId("features")}>
              Features
            </button>
            <button className="mk-navlink" onClick={() => scrollToId("dev")}>
              Developers
            </button>
            <button className="mk-navlink" onClick={() => scrollToId("faq")}>
              FAQ
            </button>
          </nav>
          <div className="row tight nav-right">
            <button className="nav-text hide-sm" onClick={demo}>
              Live demo
            </button>
            <Link to={appLink} className="btn primary">
              {address ? "Open console" : "Launch app"}
            </Link>
          </div>
        </div>
      </header>

      <section className="mk-hero">
        <div className="hero-grid-bg" aria-hidden="true" />
        <div className="mk-inner hero-layout">
          <div className="hero-copy">
            <h1>Stop a drain before it empties the vault.</h1>
            <p className="mk-lede">
              Floodgate caps how fast funds can leave a Soroban contract. Everyday payouts go through at once. Large ones wait
              in a public queue where a guardian can stop them.
            </p>
            <div className="row">
              <Link to={appLink} className="btn primary big">
                Launch the console <Icon name="releases" size={18} />
              </Link>
              <button className="btn ghost big" onClick={demo}>
                Explore the live demo
              </button>
            </div>
            <p className="hero-meta">The demo uses sample data. No wallet needed to try it.</p>
          </div>
          <ProductShot />
        </div>
      </section>

      <section className="mk-strip">
        <div className="mk-inner strip-row">
          <span className="strip-label">Built for</span>
          {["Cross-chain bridges", "DAO treasuries", "Lending reserves", "Payroll vaults", "Anchors"].map((x) => (
            <span key={x} className="strip-item">
              {x}
            </span>
          ))}
        </div>
      </section>

      <section className="mk-section" aria-labelledby="drains-title">
        <div className="mk-inner">
          <div className="sec-head">
            <h2 id="drains-title">Over $1.1 billion left three bridges in one go.</h2>
            <p className="sec-lede">
              Bridge losses rarely trickle out. The whole pool leaves before anyone can react. A rate limit bounds the loss no
              matter how the attacker got in.
            </p>
          </div>
          <div className="drain-grid">
            {DRAINS.map((d) => (
              <article key={d.name} className="drain-card">
                <div className="drain-top">
                  <span className="drain-amount">{d.amount}</span>
                  <span className="pill red">Drained in one go</span>
                </div>
                <h3>
                  {d.name} <span>{d.when}</span>
                </h3>
                <p>{d.how}</p>
              </article>
            ))}
          </div>
          <p className="fineprint">Approximate USD values at the time, from public post-mortems.</p>
        </div>
      </section>

      <section id="how" className="mk-section soft" aria-labelledby="how-title">
        <div className="mk-inner">
          <div className="sec-head">
            <h2 id="how-title">Every payout passes through the gate.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step-card">
                <div className="step-top">
                  <span className="step-icon">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="step-n">Step {i + 1}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mk-section" aria-labelledby="feat-title">
        <div className="mk-inner">
          <div className="sec-head">
            <h2 id="feat-title">Safety that stays out of the way.</h2>
          </div>
          <div className="bento">
            {FEATURES.map((f) => (
              <article key={f.title} className={f.wide ? "bento-card wide" : "bento-card"}>
                <span className="bento-icon">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="dev" className="mk-section soft" aria-labelledby="dev-title">
        <div className="mk-inner dev-grid">
          <div>
            <h2 id="dev-title">Three roles. Four numbers. One call.</h2>
            <p className="sec-lede">
              Deploy with an admin, a guardian, an operator, a token and four limits. Then send your payouts through
              <code> release</code>.
            </p>
            <ul className="role-list">
              <li>
                <strong>Operator</strong>
                <span>Requests releases. Usually your bridge or treasury contract.</span>
              </li>
              <li>
                <strong>Guardian</strong>
                <span>Cancels waiting releases and pauses. A watcher bot or council.</span>
              </li>
              <li>
                <strong>Admin</strong>
                <span>Resumes, changes limits and roles. A multisig.</span>
              </li>
            </ul>
          </div>
          <div className="code-card">
            <div className="code-tabs">
              <span className="on">deploy.sh</span>
            </div>
            <pre>
              <code>
                <span className="c"># 10,000 USDC per hour instant cap, 24 h wait for large releases</span>
                {"\n"}
                <span className="k">stellar</span> contract deploy --wasm floodgate.wasm \{"\n"}
                {"  "}-- --admin <span className="v">$MULTISIG</span> --guardian <span className="v">$WATCHER</span> \{"\n"}
                {"     "}--operator <span className="v">$BRIDGE</span> --token <span className="v">$USDC</span> \{"\n"}
                {"     "}--config <span className="s">{"'{\"window_secs\":3600,\"window_cap\":\"100000000000\","}</span>
                {"\n"}
                {"               "}
                <span className="s">{"\"large_threshold\":\"50000000000\",\"delay_secs\":86400}'"}</span>
                {"\n\n"}
                <span className="c"># Pay out: small amounts settle now, large ones queue</span>
                {"\n"}
                <span className="k">stellar</span> contract invoke --id <span className="v">$VAULT</span> -- \{"\n"}
                {"  "}release --to <span className="v">$USER</span> --amount 2500000000
              </code>
            </pre>
          </div>
        </div>
      </section>

      <section id="faq" className="mk-section" aria-labelledby="faq-title">
        <div className="mk-inner faq-grid">
          <div className="sec-head left">
            <h2 id="faq-title">Questions, answered.</h2>
            <p className="sec-lede">
              Something else? Open an issue on{" "}
              <a href={REPO} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q} className="faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-inner">
        <div className="cta-card">
          <div className="cta-glow" aria-hidden="true" />
          <h2>Put a gate in front of your funds.</h2>
          <p>Deploy a vault in minutes. Try the console with sample data first.</p>
          <div className="row center">
            <Link to={appLink} className="btn white big">
              Launch app
            </Link>
            <button className="btn glass big" onClick={demo}>
              Explore the demo
            </button>
          </div>
        </div>
      </section>

      <footer className="mk-foot">
        <div className="mk-inner foot-row">
          <Brand />
          <span>Open source under Apache-2.0. Built on Stellar Soroban.</span>
          <div className="row tight">
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`${REPO}/blob/main/WAVE_ISSUES.md`} target="_blank" rel="noreferrer">
              Contribute
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
