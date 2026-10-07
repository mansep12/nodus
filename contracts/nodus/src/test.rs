#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec, Env, IntoVal,
};

struct Setup<'a> {
    env: Env,
    nodus: NodusClient<'a>,
    token: TokenClient<'a>,
    mint: StellarAssetClient<'a>,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let nodus_id = env.register(Nodus, (sac.address(),));
    Setup {
        nodus: NodusClient::new(&env, &nodus_id),
        token: TokenClient::new(&env, &sac.address()),
        mint: StellarAssetClient::new(&env, &sac.address()),
        env,
    }
}

/// Registers and accepts an obligation, returning its id.
fn owe(s: &Setup, debtor: &Address, creditor: &Address, amount: i128) -> u64 {
    let id = s.nodus.register(creditor, debtor, &amount, &None, &None);
    s.nodus.accept(&id);
    id
}

fn clearing(id: u64, amount: i128) -> Clearing {
    Clearing { id, amount }
}

#[test]
fn settles_a_cycle_moving_only_the_nets() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    // A owes B 100, B owes C 80, C owes A 90.
    let ab = owe(&s, &a, &b, 100);
    let bc = owe(&s, &b, &c, 80);
    let ca = owe(&s, &c, &a, 90);
    s.mint.mint(&a, &10);
    s.mint.mint(&c, &10);

    let moved = s.nodus.settle(&vec![
        &s.env,
        clearing(ab, 100),
        clearing(bc, 80),
        clearing(ca, 90),
    ]);

    // 270 of debt cancelled moving 20: A and C pay 10 each, B receives 20.
    assert_eq!(moved, 20);
    assert_eq!(s.token.balance(&a), 0);
    assert_eq!(s.token.balance(&b), 20);
    assert_eq!(s.token.balance(&c), 0);
    assert_eq!(s.token.balance(&s.nodus.address), 0);
    for id in [ab, bc, ca] {
        assert_eq!(s.nodus.try_obligation(&id), Err(Ok(Error::NotFound)));
    }
}

#[test]
fn clearing_the_common_amount_moves_nothing() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    let ab = owe(&s, &a, &b, 100);
    let bc = owe(&s, &b, &c, 80);
    let ca = owe(&s, &c, &a, 90);

    let moved = s.nodus.settle(&vec![
        &s.env,
        clearing(ab, 80),
        clearing(bc, 80),
        clearing(ca, 80),
    ]);

    assert_eq!(moved, 0);
    assert_eq!(s.nodus.obligation(&ab).amount, 20);
    assert_eq!(s.nodus.try_obligation(&bc), Err(Ok(Error::NotFound)));
    assert_eq!(s.nodus.obligation(&ca).amount, 10);
}

#[test]
fn settles_a_chain_by_paying_end_to_end() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    // A owes B 50 and B owes C 50: A pays C and both debts disappear.
    let ab = owe(&s, &a, &b, 50);
    let bc = owe(&s, &b, &c, 50);
    s.mint.mint(&a, &50);

    let moved = s
        .nodus
        .settle(&vec![&s.env, clearing(ab, 50), clearing(bc, 50)]);

    assert_eq!(moved, 50);
    assert_eq!(s.token.balance(&a), 0);
    assert_eq!(s.token.balance(&b), 0);
    assert_eq!(s.token.balance(&c), 50);
}

#[test]
fn every_party_authorizes_the_same_clearings() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    let ab = owe(&s, &a, &b, 100);
    let bc = owe(&s, &b, &c, 80);
    let ca = owe(&s, &c, &a, 90);
    s.mint.mint(&a, &10);
    s.mint.mint(&c, &10);

    s.nodus.settle(&vec![
        &s.env,
        clearing(ab, 100),
        clearing(bc, 80),
        clearing(ca, 90),
    ]);

    let auths = s.env.auths();
    assert_eq!(auths.len(), 3);
    for party in [&a, &b, &c] {
        assert!(auths.iter().any(|(address, _)| address == party));
    }
    // Net payers also authorize their payment as part of the same tree.
    for (address, invocation) in auths.iter() {
        let pays = *address == a || *address == c;
        assert_eq!(invocation.sub_invocations.len(), usize::from(pays));
    }
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn fails_if_one_party_does_not_authorize() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    let ab = owe(&s, &a, &b, 80);
    let bc = owe(&s, &b, &c, 80);
    let ca = owe(&s, &c, &a, 80);
    let clearings = vec![&s.env, clearing(ab, 80), clearing(bc, 80), clearing(ca, 80)];

    // Only A and B sign; C does not.
    let invoke = MockAuthInvoke {
        contract: &s.nodus.address,
        fn_name: "settle",
        args: (clearings.clone(),).into_val(&s.env),
        sub_invokes: &[],
    };
    s.nodus
        .mock_auths(&[
            MockAuth {
                address: &a,
                invoke: &invoke,
            },
            MockAuth {
                address: &b,
                invoke: &invoke,
            },
        ])
        .settle(&clearings);
}

#[test]
fn rejects_invalid_settlements() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let accepted = owe(&s, &a, &b, 100);
    let pending = s.nodus.register(&a, &b, &40, &None, &None);

    let settle = |clearings: Vec<Clearing>| s.nodus.try_settle(&clearings);

    assert_eq!(settle(vec![&s.env]), Err(Ok(Error::EmptySettlement)));
    assert_eq!(
        settle(vec![&s.env, clearing(pending, 40)]),
        Err(Ok(Error::NotAccepted))
    );
    assert_eq!(
        settle(vec![&s.env, clearing(accepted, 101)]),
        Err(Ok(Error::ExceedsObligation))
    );
    assert_eq!(
        settle(vec![&s.env, clearing(accepted, 0)]),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        settle(vec![&s.env, clearing(accepted, 10), clearing(accepted, 10)]),
        Err(Ok(Error::UnsortedClearings))
    );
    assert_eq!(
        settle(vec![&s.env, clearing(99, 10)]),
        Err(Ok(Error::NotFound))
    );
    // Nothing changed.
    assert_eq!(s.nodus.obligation(&accepted).amount, 100);
}

#[test]
fn register_accept_and_cancel() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));

    assert_eq!(
        s.nodus.try_register(&b, &a, &0, &None, &None),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.nodus.try_register(&b, &b, &10, &None, &None),
        Err(Ok(Error::SameParty))
    );

    let reference = BytesN::from_array(&s.env, &[7u8; 32]);
    let id = s.nodus.register(&b, &a, &10, &Some(reference.clone()), &Some(1_800_000_000));
    assert_eq!(
        s.nodus.obligation(&id),
        Obligation {
            debtor: a.clone(),
            creditor: b.clone(),
            amount: 10,
            accepted: false,
            reference: Some(reference),
            due: Some(1_800_000_000),
        }
    );
    assert_eq!(s.nodus.count(), 1);
    s.nodus.accept(&id);
    assert!(s.nodus.obligation(&id).accepted);
    assert_eq!(s.nodus.try_accept(&id), Err(Ok(Error::AlreadyAccepted)));

    s.nodus.cancel(&id);
    assert_eq!(s.nodus.try_obligation(&id), Err(Ok(Error::NotFound)));
}

#[test]
fn the_debtor_can_reject_what_it_has_not_accepted() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let pending = s.nodus.register(&b, &a, &10, &None, &None);
    let accepted = owe(&s, &a, &b, 20);

    s.nodus.reject(&pending);
    // Rejecting is the debtor's call, not the creditor's.
    assert_eq!(s.env.auths()[0].0, a);
    assert_eq!(s.nodus.try_obligation(&pending), Err(Ok(Error::NotFound)));

    // Once accepted, only the creditor can make it go away.
    assert_eq!(s.nodus.try_reject(&accepted), Err(Ok(Error::AlreadyAccepted)));
    assert_eq!(s.nodus.obligation(&accepted).amount, 20);
    assert_eq!(s.nodus.try_reject(&99), Err(Ok(Error::NotFound)));
}

#[test]
fn the_debtor_pays_what_is_left_directly() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let id = owe(&s, &a, &b, 100);
    let pending = s.nodus.register(&b, &a, &5, &None, &None);
    s.mint.mint(&a, &100);

    assert_eq!(s.nodus.try_pay(&pending, &5), Err(Ok(Error::NotAccepted)));
    assert_eq!(s.nodus.try_pay(&id, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(s.nodus.try_pay(&id, &101), Err(Ok(Error::ExceedsObligation)));
    assert_eq!(s.nodus.try_pay(&99, &1), Err(Ok(Error::NotFound)));

    s.nodus.pay(&id, &30);
    // The payment is authorized by the debtor, with the transfer underneath.
    let (address, invocation) = s.env.auths()[0].clone();
    assert_eq!(address, a);
    assert_eq!(invocation.sub_invocations.len(), 1);
    assert_eq!(s.nodus.obligation(&id).amount, 70);
    assert_eq!(s.token.balance(&a), 70);
    assert_eq!(s.token.balance(&b), 30);

    s.nodus.pay(&id, &70);
    assert_eq!(s.nodus.try_obligation(&id), Err(Ok(Error::NotFound)));
    assert_eq!(s.token.balance(&a), 0);
    assert_eq!(s.token.balance(&b), 100);
    assert_eq!(s.token.balance(&s.nodus.address), 0);
}

#[test]
fn keep_alive_extends_the_life_of_obligations() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let id = owe(&s, &a, &b, 10);
    let key = DataKey::Obligation(id);
    let ttl = || s.env.as_contract(&s.nodus.address, || s.env.storage().persistent().get_ttl(&key));

    // Nearly a year goes by: the obligation is close to its expiry.
    s.env.ledger().with_mut(|ledger| ledger.sequence_number += TTL_EXTEND_TO - 100);
    let before = ttl();
    assert!(before < TTL_THRESHOLD);

    // Unknown ids are ignored.
    s.nodus.keep_alive(&vec![&s.env, id, 99]);
    assert_eq!(ttl(), TTL_EXTEND_TO);
    assert!(ttl() > before);
}
