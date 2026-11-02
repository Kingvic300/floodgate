#![no_std]
//! Floodgate: an outflow circuit breaker vault for Soroban.
//!
//! Funds that leave the vault go through `release`. Small releases inside the
//! per-window cap are paid at once. Large releases, or releases that would push
//! the current window over its cap, are put in a time-locked queue. During the
//! delay a guardian can cancel a queued release or pause the whole vault.
//!
//! Typical users: bridge custody contracts, treasuries, lending reserves,
//! payroll vaults — anything where a compromised operator key should not be
//! able to drain everything in one ledger.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

const DAY_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_LEDGERS;
const QUEUE_BUMP: u32 = 60 * DAY_LEDGERS;
const QUEUE_THRESHOLD: u32 = QUEUE_BUMP - DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Paused = 1,
    InvalidAmount = 2,
    InvalidConfig = 3,
    NotFound = 4,
    NotReady = 5,
}

/// Limits enforced on outflows.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Length of one accounting window, in seconds.
    pub window_secs: u64,
    /// Maximum amount paid out instantly inside one window.
    pub window_cap: i128,
    /// Any single release of this amount or more is always queued.
    pub large_threshold: i128,
    /// How long a queued release waits before anyone can execute it.
    pub delay_secs: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Window {
    pub epoch: u64,
    pub outflow: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueuedRelease {
    pub to: Address,
    pub amount: i128,
    pub release_at: u64,
}

/// Result of a `release` call.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Release {
    /// Funds were transferred in this call.
    Sent,
    /// Funds were queued under this id.
    Queued(u64),
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Guardian,
    Operator,
    Token,
    Config,
    Window,
    Paused,
    NextId,
    Queued(u64),
}

#[contractevent]
pub struct Deposited {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Sent {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Queued {
    #[topic]
    pub id: u64,
    pub to: Address,
    pub amount: i128,
    pub release_at: u64,
}

#[contractevent]
pub struct Executed {
    #[topic]
    pub id: u64,
}

#[contractevent]
pub struct Cancelled {
    #[topic]
    pub id: u64,
}

#[contractevent]
pub struct PausedChanged {
    pub paused: bool,
}

#[contract]
pub struct Floodgate;

#[contractimpl]
impl Floodgate {
    pub fn __constructor(
        env: Env,
        admin: Address,
        guardian: Address,
        operator: Address,
        token: Address,
        config: Config,
    ) -> Result<(), Error> {
        validate(&config)?;
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Guardian, &guardian);
        s.set(&DataKey::Operator, &operator);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Config, &config);
        s.set(&DataKey::Paused, &false);
        s.set(&DataKey::NextId, &0u64);
        Ok(())
    }

    /// Move `amount` of the vault token from `from` into the vault.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        positive(amount)?;
        bump(&env);
        token_client(&env).transfer(&from, env.current_contract_address(), &amount);
        Deposited { from, amount }.publish(&env);
        Ok(())
    }

    /// Pay `amount` to `to`. Only the operator can call this.
    ///
    /// Pays at once when the amount is under `large_threshold` and fits in
    /// the current window's remaining cap. Otherwise queues it.
    pub fn release(env: Env, to: Address, amount: i128) -> Result<Release, Error> {
        read_addr(&env, DataKey::Operator).require_auth();
        not_paused(&env)?;
        positive(amount)?;
        bump(&env);

        let config = read_config(&env);
        let mut window = current_window(&env, &config);
        let fits = window.outflow + amount <= config.window_cap;

        if amount < config.large_threshold && fits {
            window.outflow += amount;
            env.storage().instance().set(&DataKey::Window, &window);
            token_client(&env).transfer(&env.current_contract_address(), &to, &amount);
            Sent { to, amount }.publish(&env);
            return Ok(Release::Sent);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        let release_at = env.ledger().timestamp() + config.delay_secs;
        let item = QueuedRelease {
            to: to.clone(),
            amount,
            release_at,
        };
        let key = DataKey::Queued(id);
        env.storage().persistent().set(&key, &item);
        env.storage()
            .persistent()
            .extend_ttl(&key, QUEUE_THRESHOLD, QUEUE_BUMP);
        Queued {
            id,
            to,
            amount,
            release_at,
        }
        .publish(&env);
        Ok(Release::Queued(id))
    }

    /// Pay out a queued release after its delay. Anyone can call this.
    ///
    /// Queued payouts do not count against the window cap: the delay is the
    /// protection for them.
    pub fn execute(env: Env, id: u64) -> Result<(), Error> {
        not_paused(&env)?;
        bump(&env);
        let key = DataKey::Queued(id);
        let item: QueuedRelease = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        if env.ledger().timestamp() < item.release_at {
            return Err(Error::NotReady);
        }
        env.storage().persistent().remove(&key);
        token_client(&env).transfer(&env.current_contract_address(), &item.to, &item.amount);
        Executed { id }.publish(&env);
        Ok(())
    }

    /// Cancel a queued release. Funds stay in the vault. Guardian only.
    pub fn cancel(env: Env, id: u64) -> Result<(), Error> {
        read_addr(&env, DataKey::Guardian).require_auth();
        bump(&env);
        let key = DataKey::Queued(id);
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotFound);
        }
        env.storage().persistent().remove(&key);
        Cancelled { id }.publish(&env);
        Ok(())
    }

    /// Stop all releases and executions. Guardian only.
    pub fn pause(env: Env) {
        read_addr(&env, DataKey::Guardian).require_auth();
        set_paused(&env, true);
    }

    /// Resume. Admin only, so a single compromised guardian key cannot
    /// pause and unpause at will.
    pub fn unpause(env: Env) {
        read_addr(&env, DataKey::Admin).require_auth();
        set_paused(&env, false);
    }

    pub fn set_config(env: Env, config: Config) -> Result<(), Error> {
        read_addr(&env, DataKey::Admin).require_auth();
        validate(&config)?;
        env.storage().instance().set(&DataKey::Config, &config);
        bump(&env);
        Ok(())
    }

    pub fn set_operator(env: Env, operator: Address) {
        read_addr(&env, DataKey::Admin).require_auth();
        env.storage().instance().set(&DataKey::Operator, &operator);
        bump(&env);
    }

    pub fn set_guardian(env: Env, guardian: Address) {
        read_addr(&env, DataKey::Admin).require_auth();
        env.storage().instance().set(&DataKey::Guardian, &guardian);
        bump(&env);
    }

    pub fn set_admin(env: Env, admin: Address) {
        read_addr(&env, DataKey::Admin).require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump(&env);
    }

    // ---- views ----

    pub fn config(env: Env) -> Config {
        read_config(&env)
    }

    pub fn paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Amount that can still be paid instantly in the current window.
    pub fn remaining(env: Env) -> i128 {
        let config = read_config(&env);
        config.window_cap - current_window(&env, &config).outflow
    }

    pub fn queued(env: Env, id: u64) -> Option<QueuedRelease> {
        env.storage().persistent().get(&DataKey::Queued(id))
    }

    pub fn token(env: Env) -> Address {
        read_addr(&env, DataKey::Token)
    }
}

fn validate(c: &Config) -> Result<(), Error> {
    if c.window_secs == 0 || c.window_cap <= 0 || c.large_threshold <= 0 || c.delay_secs == 0 {
        return Err(Error::InvalidConfig);
    }
    Ok(())
}

fn positive(amount: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    Ok(())
}

fn not_paused(env: &Env) -> Result<(), Error> {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    if paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
    bump(env);
    PausedChanged { paused }.publish(env);
}

fn current_window(env: &Env, config: &Config) -> Window {
    let epoch = env.ledger().timestamp() / config.window_secs;
    match env.storage().instance().get::<_, Window>(&DataKey::Window) {
        Some(w) if w.epoch == epoch => w,
        _ => Window { epoch, outflow: 0 },
    }
}

fn read_config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn read_addr(env: &Env, key: DataKey) -> Address {
    env.storage().instance().get(&key).unwrap()
}

fn token_client(env: &Env) -> token::TokenClient<'_> {
    token::TokenClient::new(env, &read_addr(env, DataKey::Token))
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

#[cfg(test)]
mod test;
