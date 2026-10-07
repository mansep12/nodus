//! Nodus: multilateral netting of trade debts.
//!
//! Creditors register what they are owed and debtors accept it. `settle` takes
//! a set of accepted obligations, requires the authorization of every party
//! involved, cancels the obligations and moves only each party's net balance
//! in the settlement token. Everything happens in one transaction or not at all.
//! What a settlement leaves owed can be paid directly with `pay`.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
    Map, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Token,
    NextId,
    Obligation(u64),
}

/// A debt of `amount` that `debtor` owes to `creditor`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Obligation {
    pub debtor: Address,
    pub creditor: Address,
    /// Outstanding amount, in units of the settlement token.
    pub amount: i128,
    /// Only obligations accepted by the debtor can be settled or paid.
    pub accepted: bool,
    /// Hash of the document behind the debt (an invoice, a contract), if any.
    pub reference: Option<BytesN<32>>,
    /// When the debt falls due, as a Unix timestamp, if agreed.
    pub due: Option<u64>,
}

/// How much of obligation `id` a settlement cancels.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Clearing {
    pub id: u64,
    pub amount: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    SameParty = 2,
    NotFound = 3,
    AlreadyAccepted = 4,
    NotAccepted = 5,
    EmptySettlement = 6,
    /// Clearings must be sorted by strictly increasing obligation id.
    UnsortedClearings = 7,
    ExceedsObligation = 8,
}

#[contractevent]
pub struct Registered {
    #[topic]
    pub id: u64,
    pub creditor: Address,
    pub debtor: Address,
    pub amount: i128,
    pub reference: Option<BytesN<32>>,
    pub due: Option<u64>,
}

#[contractevent]
pub struct Accepted {
    #[topic]
    pub id: u64,
}

/// The debtor refused an obligation before accepting it.
#[contractevent]
pub struct Rejected {
    #[topic]
    pub id: u64,
}

#[contractevent]
pub struct Cancelled {
    #[topic]
    pub id: u64,
}

/// Part of an obligation was paid directly by the debtor.
#[contractevent]
pub struct Paid {
    #[topic]
    pub id: u64,
    pub amount: i128,
    pub remaining: i128,
}

/// Part of an obligation was cancelled by a settlement.
#[contractevent]
pub struct Cleared {
    #[topic]
    pub id: u64,
    pub amount: i128,
    pub remaining: i128,
}

/// Summary of a settlement: `cleared` of debt cancelled moving only `moved`.
#[contractevent]
pub struct Settled {
    pub cleared: i128,
    pub moved: i128,
    pub parties: u32,
}

#[contract]
pub struct Nodus;

#[contractimpl]
impl Nodus {
    /// `token` is the asset in which net balances and payments are made.
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// The creditor records that `debtor` owes them `amount`, optionally
    /// pointing at the document behind it and the date it falls due.
    pub fn register(
        env: Env,
        creditor: Address,
        debtor: Address,
        amount: i128,
        reference: Option<BytesN<32>>,
        due: Option<u64>,
    ) -> Result<u64, Error> {
        creditor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if creditor == debtor {
            return Err(Error::SameParty);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        write_obligation(
            &env,
            id,
            &Obligation {
                debtor: debtor.clone(),
                creditor: creditor.clone(),
                amount,
                accepted: false,
                reference: reference.clone(),
                due,
            },
        );
        extend_instance(&env);

        Registered {
            id,
            creditor,
            debtor,
            amount,
            reference,
            due,
        }
        .publish(&env);
        Ok(id)
    }

    /// The debtor acknowledges the obligation, making it eligible for settlement.
    pub fn accept(env: Env, id: u64) -> Result<(), Error> {
        let mut obligation = read_obligation(&env, id)?;
        obligation.debtor.require_auth();
        if obligation.accepted {
            return Err(Error::AlreadyAccepted);
        }
        obligation.accepted = true;
        write_obligation(&env, id, &obligation);
        extend_instance(&env);

        Accepted { id }.publish(&env);
        Ok(())
    }

    /// The debtor refuses an obligation it has not accepted, which removes it.
    pub fn reject(env: Env, id: u64) -> Result<(), Error> {
        let obligation = read_obligation(&env, id)?;
        obligation.debtor.require_auth();
        if obligation.accepted {
            return Err(Error::AlreadyAccepted);
        }
        env.storage().persistent().remove(&DataKey::Obligation(id));
        extend_instance(&env);

        Rejected { id }.publish(&env);
        Ok(())
    }

    /// The creditor withdraws an obligation (forgiven, or paid elsewhere).
    pub fn cancel(env: Env, id: u64) -> Result<(), Error> {
        let obligation = read_obligation(&env, id)?;
        obligation.creditor.require_auth();
        env.storage().persistent().remove(&DataKey::Obligation(id));
        extend_instance(&env);

        Cancelled { id }.publish(&env);
        Ok(())
    }

    /// The debtor pays `amount` of an accepted obligation to the creditor in
    /// the settlement token. What a settlement leaves owed gets paid this way.
    pub fn pay(env: Env, id: u64, amount: i128) -> Result<(), Error> {
        let mut obligation = read_obligation(&env, id)?;
        obligation.debtor.require_auth();
        if !obligation.accepted {
            return Err(Error::NotAccepted);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if amount > obligation.amount {
            return Err(Error::ExceedsObligation);
        }

        token::TokenClient::new(&env, &read_token(&env)).transfer(
            &obligation.debtor,
            &obligation.creditor,
            &amount,
        );
        obligation.amount -= amount;
        if obligation.amount == 0 {
            env.storage().persistent().remove(&DataKey::Obligation(id));
        } else {
            write_obligation(&env, id, &obligation);
        }
        extend_instance(&env);

        Paid {
            id,
            amount,
            remaining: obligation.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Cancels `clearings` and pays only the net balance of each party.
    ///
    /// A party's net is what they stop being owed minus what they stop owing.
    /// Parties with a negative net pay it in; parties with a positive net are
    /// paid out, so nobody ends up better or worse off than before. Every party
    /// must authorize the exact same set of clearings. Returns the total moved.
    pub fn settle(env: Env, clearings: Vec<Clearing>) -> Result<i128, Error> {
        if clearings.is_empty() {
            return Err(Error::EmptySettlement);
        }

        let mut nets: Map<Address, i128> = Map::new(&env);
        let mut updated: Vec<(Clearing, Obligation)> = Vec::new(&env);
        let mut cleared: i128 = 0;
        let mut previous: Option<u64> = None;

        for clearing in clearings.iter() {
            if previous.is_some_and(|id| clearing.id <= id) {
                return Err(Error::UnsortedClearings);
            }
            previous = Some(clearing.id);

            let mut obligation = read_obligation(&env, clearing.id)?;
            if !obligation.accepted {
                return Err(Error::NotAccepted);
            }
            if clearing.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            if clearing.amount > obligation.amount {
                return Err(Error::ExceedsObligation);
            }

            let creditor_net = nets.get(obligation.creditor.clone()).unwrap_or(0);
            nets.set(obligation.creditor.clone(), creditor_net + clearing.amount);
            let debtor_net = nets.get(obligation.debtor.clone()).unwrap_or(0);
            nets.set(obligation.debtor.clone(), debtor_net - clearing.amount);

            cleared += clearing.amount;
            obligation.amount -= clearing.amount;
            updated.push_back((clearing, obligation));
        }

        for party in nets.keys() {
            party.require_auth();
        }

        for (clearing, obligation) in updated.iter() {
            if obligation.amount == 0 {
                env.storage()
                    .persistent()
                    .remove(&DataKey::Obligation(clearing.id));
            } else {
                write_obligation(&env, clearing.id, &obligation);
            }
            Cleared {
                id: clearing.id,
                amount: clearing.amount,
                remaining: obligation.amount,
            }
            .publish(&env);
        }

        // Net payers pay in first so the contract can pay out without holding funds
        // of its own; its balance is the same before and after.
        let token = token::TokenClient::new(&env, &read_token(&env));
        let contract = env.current_contract_address();
        let mut moved: i128 = 0;
        for (party, net) in nets.iter() {
            if net < 0 {
                token.transfer(&party, &contract, &-net);
                moved -= net;
            }
        }
        for (party, net) in nets.iter() {
            if net > 0 {
                token.transfer(&contract, &party, &net);
            }
        }
        extend_instance(&env);

        Settled {
            cleared,
            moved,
            parties: nets.len(),
        }
        .publish(&env);
        Ok(moved)
    }

    /// Keeps the given obligations from expiring. Anyone may call it; it does
    /// nothing for obligations that no longer exist.
    pub fn keep_alive(env: Env, ids: Vec<u64>) {
        for id in ids.iter() {
            let key = DataKey::Obligation(id);
            if env.storage().persistent().has(&key) {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
        }
        extend_instance(&env);
    }

    pub fn obligation(env: Env, id: u64) -> Result<Obligation, Error> {
        read_obligation(&env, id)
    }

    /// How many obligations have been registered: ids run from 0 to this, exclusive.
    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn token(env: Env) -> Address {
        read_token(&env)
    }
}

fn read_token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

fn read_obligation(env: &Env, id: u64) -> Result<Obligation, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Obligation(id))
        .ok_or(Error::NotFound)
}

fn write_obligation(env: &Env, id: u64, obligation: &Obligation) {
    let key = DataKey::Obligation(id);
    env.storage().persistent().set(&key, obligation);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
