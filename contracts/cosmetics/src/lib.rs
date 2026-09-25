#![no_std]
// create_class mirrors every class field; a struct argument would hide them from the CLI.
#![allow(clippy::too_many_arguments)]

//! Cosmetic ownership for Impulso Stellar.
//!
//! Each cosmetic piece is a non-fungible token that belongs to a class (for example
//! "livery Aurora Andina"). The token interface mirrors the Stellar NFT shape
//! (`balance`, `owner_of`, `transfer`, `transfer_from`, `approve`, `approve_for_all`,
//! `token_uri`, ...) so a marketplace contract can list and settle transferable pieces
//! through `approve` + `transfer_from`. Merit and veteran pieces are soulbound.
//! Nothing here is read by the simulation: cosmetics never change gameplay.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, String, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const PERSISTENT_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP - 7 * DAY_IN_LEDGERS;
/// Bounds the per-owner token list so reads stay cheap.
pub const MAX_TOKENS_PER_OWNER: u32 = 200;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ClassExists = 1,
    ClassNotFound = 2,
    TokenNotFound = 3,
    NotOwner = 4,
    NotAuthorized = 5,
    NotTransferable = 6,
    NotForSale = 7,
    SupplyExhausted = 8,
    RewardAlreadyClaimed = 9,
    InvalidClass = 10,
    InvalidPrice = 11,
    InvalidLedger = 12,
    InventoryFull = 13,
    SelfTransfer = 14,
    Overflow = 15,
}

/// Equipment slot shown in the hangar.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Slot {
    Livery = 0,
    Trail = 1,
    Emblem = 2,
}

/// Brief v0.3 families: merit (earned, never sold), veteran (not transferable),
/// collection (primary sale, transferable).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Family {
    Merit = 0,
    Veteran = 1,
    Collection = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CosmeticClass {
    pub slot: Slot,
    pub family: Family,
    pub transferable: bool,
    /// 0 means unlimited.
    pub supply_cap: u32,
    pub minted: u32,
    /// Price in the payment token's smallest unit. 0 means not for sale.
    pub price: i128,
    /// Off-chain metadata (name, image). Ownership lives on chain; art does not.
    pub uri: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenData {
    pub owner: Address,
    pub class_id: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct Approval {
    approved: Address,
    live_until_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Minter,
    Treasury,
    PaymentToken,
    Name,
    Symbol,
    NextTokenId,
    Class(u32),
    Token(u32),
    OwnerTokens(Address),
    Approval(u32),
    Operator(Address, Address),
    Reward(BytesN<32>),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub token_id: u32,
    pub class_id: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub approver: Address,
    #[topic]
    pub token_id: u32,
    pub approved: Address,
    pub live_until_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApproveForAll {
    #[topic]
    pub owner: Address,
    pub operator: Address,
    pub live_until_ledger: u32,
}

#[contract]
pub struct Cosmetics;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn instance_address(env: &Env, key: &DataKey) -> Address {
    env.storage().instance().get(key).unwrap()
}

fn read_class(env: &Env, class_id: u32) -> CosmeticClass {
    let key = DataKey::Class(class_id);
    let class: CosmeticClass = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::ClassNotFound));
    bump(env, &key);
    class
}

fn write_class(env: &Env, class_id: u32, class: &CosmeticClass) {
    let key = DataKey::Class(class_id);
    env.storage().persistent().set(&key, class);
    bump(env, &key);
}

fn read_token(env: &Env, token_id: u32) -> TokenData {
    let key = DataKey::Token(token_id);
    let data: TokenData = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::TokenNotFound));
    bump(env, &key);
    data
}

fn read_owner_tokens(env: &Env, owner: &Address) -> Vec<u32> {
    let key = DataKey::OwnerTokens(owner.clone());
    match env.storage().persistent().get(&key) {
        Some(tokens) => {
            bump(env, &key);
            tokens
        }
        None => Vec::new(env),
    }
}

fn write_owner_tokens(env: &Env, owner: &Address, tokens: &Vec<u32>) {
    let key = DataKey::OwnerTokens(owner.clone());
    if tokens.is_empty() {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, tokens);
        bump(env, &key);
    }
}

fn add_owned(env: &Env, owner: &Address, token_id: u32) {
    let mut tokens = read_owner_tokens(env, owner);
    if tokens.len() >= MAX_TOKENS_PER_OWNER {
        panic_with_error!(env, Error::InventoryFull);
    }
    tokens.push_back(token_id);
    write_owner_tokens(env, owner, &tokens);
}

fn remove_owned(env: &Env, owner: &Address, token_id: u32) {
    let mut tokens = read_owner_tokens(env, owner);
    if let Some(index) = tokens.first_index_of(token_id) {
        tokens.remove(index);
    }
    write_owner_tokens(env, owner, &tokens);
}

fn operator_live(env: &Env, owner: &Address, operator: &Address) -> bool {
    let key = DataKey::Operator(owner.clone(), operator.clone());
    match env.storage().persistent().get::<_, u32>(&key) {
        Some(live_until) => live_until >= env.ledger().sequence(),
        None => false,
    }
}

fn approved_live(env: &Env, token_id: u32) -> Option<Address> {
    let approval: Option<Approval> = env.storage().persistent().get(&DataKey::Approval(token_id));
    approval
        .filter(|a| a.live_until_ledger >= env.ledger().sequence())
        .map(|a| a.approved)
}

fn require_transferable(env: &Env, class_id: u32) {
    if !read_class(env, class_id).transferable {
        panic_with_error!(env, Error::NotTransferable);
    }
}

fn mint(env: &Env, to: &Address, class_id: u32) -> u32 {
    let mut class = read_class(env, class_id);
    if class.supply_cap != 0 && class.minted >= class.supply_cap {
        panic_with_error!(env, Error::SupplyExhausted);
    }
    class.minted = class
        .minted
        .checked_add(1)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    write_class(env, class_id, &class);

    let token_id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextTokenId)
        .unwrap_or(1);
    let next = token_id
        .checked_add(1)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    env.storage().instance().set(&DataKey::NextTokenId, &next);

    let key = DataKey::Token(token_id);
    env.storage().persistent().set(
        &key,
        &TokenData {
            owner: to.clone(),
            class_id,
        },
    );
    bump(env, &key);
    add_owned(env, to, token_id);

    Mint {
        to: to.clone(),
        token_id,
        class_id,
    }
    .publish(env);
    token_id
}

fn move_token(env: &Env, from: &Address, to: &Address, token_id: u32) {
    let mut data = read_token(env, token_id);
    if data.owner != *from {
        panic_with_error!(env, Error::NotOwner);
    }
    if from == to {
        panic_with_error!(env, Error::SelfTransfer);
    }
    require_transferable(env, data.class_id);

    env.storage()
        .persistent()
        .remove(&DataKey::Approval(token_id));
    remove_owned(env, from, token_id);
    add_owned(env, to, token_id);
    data.owner = to.clone();
    let key = DataKey::Token(token_id);
    env.storage().persistent().set(&key, &data);
    bump(env, &key);

    Transfer {
        from: from.clone(),
        to: to.clone(),
        token_id,
    }
    .publish(env);
}

#[contractimpl]
impl Cosmetics {
    /// Roles are separate: `admin` manages classes and roles, `minter` is the game
    /// server that grants rewards, `treasury` receives primary sales.
    pub fn __constructor(
        env: Env,
        admin: Address,
        minter: Address,
        treasury: Address,
        payment_token: Address,
        name: String,
        symbol: String,
    ) {
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Minter, &minter);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::PaymentToken, &payment_token);
        storage.set(&DataKey::Name, &name);
        storage.set(&DataKey::Symbol, &symbol);
        storage.set(&DataKey::NextTokenId, &1u32);
        bump_instance(&env);
    }

    pub fn version() -> u32 {
        2
    }

    // ----- Administration -----------------------------------------------------

    pub fn create_class(
        env: Env,
        class_id: u32,
        slot: Slot,
        family: Family,
        transferable: bool,
        supply_cap: u32,
        price: i128,
        uri: String,
    ) {
        instance_address(&env, &DataKey::Admin).require_auth();
        bump_instance(&env);
        if env.storage().persistent().has(&DataKey::Class(class_id)) {
            panic_with_error!(&env, Error::ClassExists);
        }
        validate_class(&env, family, transferable, price);
        write_class(
            &env,
            class_id,
            &CosmeticClass {
                slot,
                family,
                transferable,
                supply_cap,
                minted: 0,
                price,
                uri,
            },
        );
    }

    /// 0 withdraws the class from primary sale.
    pub fn set_price(env: Env, class_id: u32, price: i128) {
        instance_address(&env, &DataKey::Admin).require_auth();
        bump_instance(&env);
        let mut class = read_class(&env, class_id);
        validate_class(&env, class.family, class.transferable, price);
        class.price = price;
        write_class(&env, class_id, &class);
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        instance_address(&env, &DataKey::Admin).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
    }

    pub fn set_minter(env: Env, new_minter: Address) {
        instance_address(&env, &DataKey::Admin).require_auth();
        env.storage().instance().set(&DataKey::Minter, &new_minter);
        bump_instance(&env);
    }

    pub fn set_treasury(env: Env, new_treasury: Address) {
        instance_address(&env, &DataKey::Admin).require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Treasury, &new_treasury);
        bump_instance(&env);
    }

    // ----- Acquisition --------------------------------------------------------

    /// Server reward. `reward_id` makes the grant idempotent: a second claim with
    /// the same id fails instead of minting twice.
    pub fn grant(env: Env, to: Address, class_id: u32, reward_id: BytesN<32>) -> u32 {
        instance_address(&env, &DataKey::Minter).require_auth();
        bump_instance(&env);
        let key = DataKey::Reward(reward_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::RewardAlreadyClaimed);
        }
        env.storage().persistent().set(&key, &true);
        bump(&env, &key);
        mint(&env, &to, class_id)
    }

    /// Primary sale at a fixed price, signed by the buyer. Payment goes to treasury.
    pub fn buy(env: Env, buyer: Address, class_id: u32) -> u32 {
        buyer.require_auth();
        bump_instance(&env);
        let class = read_class(&env, class_id);
        if class.price <= 0 {
            panic_with_error!(&env, Error::NotForSale);
        }
        let payment = instance_address(&env, &DataKey::PaymentToken);
        let treasury = instance_address(&env, &DataKey::Treasury);
        token::Client::new(&env, &payment).transfer(&buyer, &treasury, &class.price);
        mint(&env, &buyer, class_id)
    }

    // ----- NFT interface (marketplace-facing) ---------------------------------

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u32) {
        from.require_auth();
        bump_instance(&env);
        move_token(&env, &from, &to, token_id);
    }

    /// Used by a marketplace after the seller approved it.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u32) {
        spender.require_auth();
        bump_instance(&env);
        let allowed = spender == from
            || approved_live(&env, token_id) == Some(spender.clone())
            || operator_live(&env, &from, &spender);
        if !allowed {
            panic_with_error!(&env, Error::NotAuthorized);
        }
        move_token(&env, &from, &to, token_id);
    }

    /// `live_until_ledger = 0` revokes. Soulbound pieces cannot be approved, so
    /// they can never be listed on a marketplace.
    pub fn approve(
        env: Env,
        approver: Address,
        approved: Address,
        token_id: u32,
        live_until_ledger: u32,
    ) {
        approver.require_auth();
        bump_instance(&env);
        let data = read_token(&env, token_id);
        if data.owner != approver && !operator_live(&env, &data.owner, &approver) {
            panic_with_error!(&env, Error::NotAuthorized);
        }
        require_transferable(&env, data.class_id);
        let key = DataKey::Approval(token_id);
        if live_until_ledger == 0 {
            env.storage().persistent().remove(&key);
        } else {
            if live_until_ledger < env.ledger().sequence() {
                panic_with_error!(&env, Error::InvalidLedger);
            }
            env.storage().persistent().set(
                &key,
                &Approval {
                    approved: approved.clone(),
                    live_until_ledger,
                },
            );
            bump(&env, &key);
        }
        Approve {
            approver,
            token_id,
            approved,
            live_until_ledger,
        }
        .publish(&env);
    }

    /// `live_until_ledger = 0` revokes.
    pub fn approve_for_all(env: Env, owner: Address, operator: Address, live_until_ledger: u32) {
        owner.require_auth();
        bump_instance(&env);
        let key = DataKey::Operator(owner.clone(), operator.clone());
        if live_until_ledger == 0 {
            env.storage().persistent().remove(&key);
        } else {
            if live_until_ledger < env.ledger().sequence() {
                panic_with_error!(&env, Error::InvalidLedger);
            }
            env.storage().persistent().set(&key, &live_until_ledger);
            bump(&env, &key);
        }
        ApproveForAll {
            owner,
            operator,
            live_until_ledger,
        }
        .publish(&env);
    }

    pub fn get_approved(env: Env, token_id: u32) -> Option<Address> {
        read_token(&env, token_id);
        approved_live(&env, token_id)
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        operator_live(&env, &owner, &operator)
    }

    pub fn balance(env: Env, owner: Address) -> u32 {
        read_owner_tokens(&env, &owner).len()
    }

    pub fn owner_of(env: Env, token_id: u32) -> Address {
        read_token(&env, token_id).owner
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn token_uri(env: Env, token_id: u32) -> String {
        let data = read_token(&env, token_id);
        read_class(&env, data.class_id).uri
    }

    // ----- Game queries -------------------------------------------------------

    /// Token ids owned by `owner`, for the hangar inventory.
    pub fn tokens_of(env: Env, owner: Address) -> Vec<u32> {
        read_owner_tokens(&env, &owner)
    }

    pub fn class_of(env: Env, token_id: u32) -> u32 {
        read_token(&env, token_id).class_id
    }

    pub fn get_class(env: Env, class_id: u32) -> CosmeticClass {
        read_class(&env, class_id)
    }

    /// What the server checks before letting a player equip a piece.
    pub fn has_class(env: Env, owner: Address, class_id: u32) -> bool {
        read_owner_tokens(&env, &owner)
            .iter()
            .any(|id| read_token(&env, id).class_id == class_id)
    }

    pub fn is_reward_claimed(env: Env, reward_id: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Reward(reward_id))
    }
}

fn validate_class(env: &Env, family: Family, transferable: bool, price: i128) {
    if price < 0 {
        panic_with_error!(env, Error::InvalidPrice);
    }
    // Only collection pieces trade; merit is earned, never bought.
    if transferable && family != Family::Collection {
        panic_with_error!(env, Error::InvalidClass);
    }
    if family == Family::Merit && price > 0 {
        panic_with_error!(env, Error::InvalidClass);
    }
}

#[cfg(test)]
mod test;
