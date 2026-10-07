#![cfg(test)]

use super::*;
use soroban_sdk::{
    auth::ContractContext, symbol_short, testutils::Address as _, vec, Env,
};

struct Setup<'a> {
    env: Env,
    policy: AllowlistClient<'a>,
    account: Address,
    nodus: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let policy = AllowlistClient::new(&env, &env.register(Allowlist, ()));
    Setup {
        account: Address::generate(&env),
        nodus: Address::generate(&env),
        policy,
        env,
    }
}

fn rule(s: &Setup, id: u32) -> ContextRule {
    ContextRule {
        id,
        context_type: ContextRuleType::CallContract(s.nodus.clone()),
        name: String::from_str(&s.env, "contador"),
        signers: vec![&s.env],
        signer_ids: vec![&s.env],
        policies: vec![&s.env, s.policy.address.clone()],
        policy_ids: vec![&s.env, 0],
        valid_until: None,
    }
}

fn call(s: &Setup, contract: &Address, fn_name: Symbol) -> Context {
    Context::Contract(ContractContext {
        contract: contract.clone(),
        fn_name,
        args: vec![&s.env],
    })
}

#[test]
fn allows_only_the_listed_functions() {
    let s = setup();
    let functions = vec![&s.env, symbol_short!("register"), symbol_short!("accept")];
    s.policy.install(
        &AllowlistParams {
            functions: functions.clone(),
        },
        &rule(&s, 1),
        &s.account,
    );
    assert_eq!(s.policy.allowed(&s.account, &1), functions);

    let signers = vec![&s.env];
    s.policy
        .enforce(&call(&s, &s.nodus, symbol_short!("register")), &signers, &rule(&s, 1), &s.account);
    s.policy
        .enforce(&call(&s, &s.nodus, symbol_short!("accept")), &signers, &rule(&s, 1), &s.account);

    assert_eq!(
        s.policy
            .try_enforce(&call(&s, &s.nodus, symbol_short!("settle")), &signers, &rule(&s, 1), &s.account)
            .err(),
        Some(Ok(Error::NotAllowed))
    );
    assert_eq!(
        s.policy
            .try_enforce(&call(&s, &s.nodus, symbol_short!("pay")), &signers, &rule(&s, 1), &s.account)
            .err(),
        Some(Ok(Error::NotAllowed))
    );
}

#[test]
fn refuses_what_is_not_a_contract_call() {
    let s = setup();
    s.policy.install(
        &AllowlistParams {
            functions: vec![&s.env, symbol_short!("register")],
        },
        &rule(&s, 1),
        &s.account,
    );
    let creation = Context::CreateContractHostFn(soroban_sdk::auth::CreateContractHostFnContext {
        executable: soroban_sdk::auth::ContractExecutable::Wasm(BytesN::from_array(&s.env, &[1u8; 32])),
        salt: BytesN::from_array(&s.env, &[2u8; 32]),
    });
    assert_eq!(
        s.policy.try_enforce(&creation, &vec![&s.env], &rule(&s, 1), &s.account).err(),
        Some(Ok(Error::NotAllowed))
    );
}

#[test]
fn install_and_uninstall_are_per_account_and_rule() {
    let s = setup();
    let params = AllowlistParams {
        functions: vec![&s.env, symbol_short!("register")],
    };
    assert_eq!(
        s.policy
            .try_install(&AllowlistParams { functions: vec![&s.env] }, &rule(&s, 1), &s.account)
            .err(),
        Some(Ok(Error::EmptyAllowlist))
    );
    s.policy.install(&params, &rule(&s, 1), &s.account);
    assert_eq!(
        s.policy.try_install(&params, &rule(&s, 1), &s.account).err(),
        Some(Ok(Error::AlreadyInstalled))
    );
    // The same rule id on another account is a different installation.
    let other = Address::generate(&s.env);
    s.policy.install(&params, &rule(&s, 1), &other);

    assert_eq!(
        s.policy.try_enforce(&call(&s, &s.nodus, symbol_short!("register")), &vec![&s.env], &rule(&s, 2), &s.account).err(),
        Some(Ok(Error::NotInstalled))
    );

    s.policy.uninstall(&rule(&s, 1), &s.account);
    assert_eq!(s.policy.try_allowed(&s.account, &1).err(), Some(Ok(Error::NotInstalled)));
    assert_eq!(s.policy.allowed(&other, &1).len(), 1);

    // Installing and enforcing are authorized by the account itself.
    assert!(s.env.auths().iter().all(|(address, _)| *address == s.account || *address == other));
}
