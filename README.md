# Floodgate

**An outflow circuit breaker vault for Soroban.**

Floodgate holds tokens and controls how fast they can leave. Small payouts go through at once. Large payouts, and payouts that would exceed a per-window cap, wait in a time-locked queue. While a payout waits, a guardian can cancel it or pause the vault.

If an operator key is stolen, the attacker can take at most one window's cap before someone notices. Everything else sits in the queue where the guardian can stop it.

## Who it is for

- **Bridges and cross-chain custody.** Bridge hacks usually drain the whole pool in minutes. A rate limit turns a total loss into a bounded one.
- **Treasuries and DAOs.** Routine spending stays fast, and big transfers get a review period.
- **Lending reserves, payroll vaults and anchors.** Any contract where one key can move large balances.

The pattern is the Soroban version of ERC-7265 (circuit breaker) and of the flow limits inside Axelar's Interchain Token Service. Floodgate makes it a standalone, reusable contract that any project can put in front of its funds.

## How it works

```
operator ──release(to, amount)──► Floodgate
                                    │
            amount < large_threshold│ and fits window cap?
                 ┌──────── yes ─────┴───── no ────────┐
                 ▼                                     ▼
          transfer now                    queue (id, release_at = now + delay)
                                                       │
                              guardian: cancel(id) / pause()
                                                       │
                                anyone after delay: execute(id)
```

### Roles

| Role | Can do |
|---|---|
| `admin` | `set_config`, `set_operator`, `set_guardian`, `set_admin`, `unpause` |
| `guardian` | `pause`, `cancel` |
| `operator` | `release` |
| anyone | `deposit` (with own auth), `execute` after the delay |

The guardian can pause but not unpause. A stolen guardian key can freeze funds but cannot move them.

### Config

| Field | Meaning |
|---|---|
| `window_secs` | Length of one accounting window |
| `window_cap` | Max amount paid instantly per window |
| `large_threshold` | Any single release of this size or more is queued |
| `delay_secs` | Wait time for queued releases |

### Contract interface

```rust
fn __constructor(admin, guardian, operator, token, config: Config)
fn deposit(from: Address, amount: i128) -> Result<(), Error>
fn release(to: Address, amount: i128) -> Result<Release, Error>   // Release::Sent | Release::Queued(id)
fn execute(id: u64) -> Result<(), Error>
fn cancel(id: u64) -> Result<(), Error>
fn pause()
fn unpause()
fn set_config(config: Config) -> Result<(), Error>
fn set_operator(a) / set_guardian(a) / set_admin(a)
fn config() -> Config
fn paused() -> bool
fn remaining() -> i128          // instant capacity left this window
fn queued(id: u64) -> Option<QueuedRelease>
fn token() -> Address
```

Events: `deposited`, `sent`, `queued`, `executed`, `cancelled`, `paused_changed`.

## Known limits (v0.1)

- **Fixed windows.** Windows reset on a fixed schedule, so up to two caps can leave around a window boundary. A sliding window is on the roadmap.
- **One token per vault.** Deploy one vault per token for now.
- **Queued payouts skip the cap.** The delay protects them instead. A guardian must watch the `queued` event.
- **No audit yet.** Do not hold real funds in this contract until it has an audit.

## Build and test

Requirements: Rust stable, `rustup target add wasm32v1-none`, and stellar-cli v25.2.0 or newer.

```sh
cargo test               # 9 unit tests, native
stellar contract build   # wasm in target/wasm32v1-none/release/
```

## Web UI

`ui/` holds Floodgate Console: a web console that shows how much can leave the vault now, lists waiting releases, and runs deposit, release, pay out, cancel, pause and resume through Freighter. See [ui/README.md](ui/README.md).

```sh
cd ui && npm install && npm run dev
```

## Roadmap

1. **v0.1 (now):** single-token vault, fixed windows, queue, pause, cancel. Unit tests.
2. **v0.2:** sliding window, multi-token vault, per-recipient caps, testnet deployment and a TypeScript client.
3. **v0.3:** a guardian watcher bot that alerts on queued releases, a reference integration with a bridge or treasury, and an audit through the SCF Audit Bank.
4. **v1.0:** mainnet release and integrations with ecosystem projects.

See [WAVE_ISSUES.md](WAVE_ISSUES.md) for open work sized for Drips Wave contributors.

## License

Apache-2.0
