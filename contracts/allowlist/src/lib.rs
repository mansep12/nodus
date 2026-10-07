//! A policy for OpenZeppelin smart accounts that lets the signers of a context
//! rule call only the listed functions of a contract.
//!
//! Nodus installs it on a rule of type `CallContract(nodus)` so that a business
//! can give someone a key that registers, accepts and rejects debts but can
//! never sign a settlement or move money.
#![no_std]

use soroban_sdk::{
    auth::Context, contract, contracterror, contractevent, contractimpl, contracttype,
    Address, Bytes, BytesN, Env, String, Symbol, Vec,
};

// The types the account hands a policy, mirrored from OpenZeppelin's
// `stellar-accounts` 0.7 so that they decode exactly what it sends.

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Signer {
    Delegated(Address),
    External(Address, Bytes),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContextRuleType {
    Default,
    CallContract(Address),
    CreateContract(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContextRule {
    pub id: u32,
    pub context_type: ContextRuleType,
    pub name: String,
    pub signers: Vec<Signer>,
    pub signer_ids: Vec<u32>,
    pub policies: Vec<Address>,
    pub policy_ids: Vec<u32>,
    pub valid_until: Option<u32>,
}

/// What the policy is installed with: the functions the rule may call.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistParams {
    pub functions: Vec<Symbol>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// The functions allowed for one rule of one account.
    Allowed(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInstalled = 3300,
    AlreadyInstalled = 3301,
    NotAllowed = 3302,
    EmptyAllowlist = 3303,
}

#[contractevent]
pub struct Installed {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub functions: Vec<Symbol>,
}

#[contractevent]
pub struct Uninstalled {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

#[contract]
pub struct Allowlist;

#[contractimpl]
impl Allowlist {
    /// Called by the account when the policy is added to `context_rule`.
    pub fn install(
        env: Env,
        install_params: AllowlistParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) -> Result<(), Error> {
        smart_account.require_auth();
        let key = DataKey::Allowed(smart_account.clone(), context_rule.id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyInstalled);
        }
        if install_params.functions.is_empty() {
            return Err(Error::EmptyAllowlist);
        }
        env.storage()
            .persistent()
            .set(&key, &install_params.functions);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Installed {
            smart_account,
            context_rule_id: context_rule.id,
            functions: install_params.functions,
        }
        .publish(&env);
        Ok(())
    }

    /// Called by the account for every authorization under the rule: the
    /// context must be a call to one of the allowed functions.
    pub fn enforce(
        env: Env,
        context: Context,
        _authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) -> Result<(), Error> {
        smart_account.require_auth();
        let allowed = Self::allowed(env.clone(), smart_account, context_rule.id)?;
        let permitted = match context {
            Context::Contract(call) => allowed.contains(call.fn_name),
            _ => false,
        };
        if permitted {
            Ok(())
        } else {
            Err(Error::NotAllowed)
        }
    }

    /// Called by the account when the policy or the rule is removed.
    pub fn uninstall(env: Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Allowed(smart_account.clone(), context_rule.id));

        Uninstalled {
            smart_account,
            context_rule_id: context_rule.id,
        }
        .publish(&env);
    }

    /// The functions the rule `context_rule_id` of `smart_account` may call.
    pub fn allowed(env: Env, smart_account: Address, context_rule_id: u32) -> Result<Vec<Symbol>, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Allowed(smart_account, context_rule_id))
            .ok_or(Error::NotInstalled)
    }
}

#[cfg(test)]
mod test;
