#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Env,
};

struct Setup<'a> {
    env: Env,
    vault: FloodgateClient<'a>,
    token: TokenClient<'a>,
    user: Address,
}

fn config() -> Config {
    Config {
        window_secs: 3_600,
        window_cap: 1_000,
        large_threshold: 500,
        delay_secs: 86_400,
    }
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_addr = sac.address();

    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);
    let operator = Address::generate(&env);
    let id = env.register(
        Floodgate,
        (admin, guardian, operator, token_addr.clone(), config()),
    );
    let vault = FloodgateClient::new(&env, &id);

    let depositor = Address::generate(&env);
    StellarAssetClient::new(&env, &token_addr).mint(&depositor, &10_000);
    vault.deposit(&depositor, &10_000);

    let token = TokenClient::new(&env, &token_addr);
    let user = Address::generate(&env);
    Setup {
        env,
        vault,
        token,
        user,
    }
}

#[test]
fn small_release_is_sent_at_once() {
    let s = setup();
    assert_eq!(s.vault.release(&s.user, &200), Release::Sent);
    assert_eq!(s.token.balance(&s.user), 200);
    assert_eq!(s.vault.remaining(), 800);
}

#[test]
fn large_release_is_queued_until_delay() {
    let s = setup();
    let r = s.vault.release(&s.user, &600);
    assert_eq!(r, Release::Queued(0));
    assert_eq!(s.token.balance(&s.user), 0);

    assert_eq!(s.vault.try_execute(&0), Err(Ok(Error::NotReady)));

    s.env.ledger().set_timestamp(1_000_000 + 86_400);
    s.vault.execute(&0);
    assert_eq!(s.token.balance(&s.user), 600);
    assert_eq!(s.vault.queued(&0), None);
}

#[test]
fn window_cap_overflow_is_queued() {
    let s = setup();
    for _ in 0..2 {
        assert_eq!(s.vault.release(&s.user, &400), Release::Sent);
    }
    // 800 used, 300 more would exceed the 1_000 cap.
    assert_eq!(s.vault.release(&s.user, &300), Release::Queued(0));
    assert_eq!(s.token.balance(&s.user), 800);
}

#[test]
fn cap_resets_next_window() {
    let s = setup();
    s.vault.release(&s.user, &400);
    s.vault.release(&s.user, &400);
    s.env.ledger().set_timestamp(1_000_000 + 3_600);
    assert_eq!(s.vault.remaining(), 1_000);
    assert_eq!(s.vault.release(&s.user, &400), Release::Sent);
}

#[test]
fn guardian_cancel_keeps_funds() {
    let s = setup();
    s.vault.release(&s.user, &5_000);
    s.vault.cancel(&0);
    s.env.ledger().set_timestamp(1_000_000 + 86_400);
    assert_eq!(s.vault.try_execute(&0), Err(Ok(Error::NotFound)));
    assert_eq!(s.token.balance(&s.vault.address), 10_000);
}

#[test]
fn pause_blocks_release_and_execute() {
    let s = setup();
    s.vault.release(&s.user, &600);
    s.vault.pause();
    assert_eq!(s.vault.try_release(&s.user, &10), Err(Ok(Error::Paused)));
    s.env.ledger().set_timestamp(1_000_000 + 86_400);
    assert_eq!(s.vault.try_execute(&0), Err(Ok(Error::Paused)));

    s.vault.unpause();
    s.vault.execute(&0);
    assert_eq!(s.token.balance(&s.user), 600);
}

#[test]
fn rejects_bad_amount() {
    let s = setup();
    assert_eq!(
        s.vault.try_release(&s.user, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn release_requires_operator_auth() {
    let s = setup();
    s.vault.release(&s.user, &10);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    // The signer of the release must be the operator, not the recipient.
    assert_ne!(auths[0].0, s.user);
}
