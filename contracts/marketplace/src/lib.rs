#![no_std]
//! Player-to-player market for Stellar Impulse cosmetics.
//!
//! Non-custodial: a listed piece stays in the seller's wallet. Listing approves this contract
//! on the cosmetics contract (one signature); a sale pays the seller and the fee in the same
//! transaction that moves the piece, so a failed step undoes the whole sale.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
/// Storage rent is paid per ledger kept, so a listing lives just past its longest duration.
const LISTING_BUMP: u32 = 31 * DAY_IN_LEDGERS;
const LISTING_THRESHOLD: u32 = LISTING_BUMP - 7 * DAY_IN_LEDGERS;
/// A listing (and its approval) lasts at most this long; the seller can list again.
pub const MAX_LISTING_LEDGERS: u32 = 30 * DAY_IN_LEDGERS;
/// The fee can never exceed 10 %.
pub const MAX_FEE_BPS: u32 = 1_000;
/// One page of `listings`; keeps a read inside the network's per-call entry limits.
pub const MAX_PAGE: u32 = 30;

/// The part of the cosmetics contract the market uses.
#[contractclient(name = "CosmeticsClient")]
pub trait CosmeticsInterface {
    fn approve(
        env: Env,
        approver: Address,
        approved: Address,
        token_id: u32,
        live_until_ledger: u32,
    );
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u32);
    fn owner_of(env: Env, token_id: u32) -> Address;
    fn get_approved(env: Env, token_id: u32) -> Option<Address>;
    fn class_of(env: Env, token_id: u32) -> u32;
}

/// Numbered from 101 so a failure inside the cosmetics contract (codes 1-16) is never mistaken
/// for a market error when both surface as `Error(Contract, #n)`.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ListingNotFound = 101,
    ListingInactive = 102,
    ListingExpired = 103,
    NotSeller = 104,
    NotOwner = 105,
    PriceTooLow = 106,
    PriceAboveMax = 107,
    SelfPurchase = 108,
    NotApproved = 109,
    FeeTooHigh = 110,
    InvalidLedger = 111,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Cosmetics,
    PaymentToken,
    FeeRecipient,
    FeeBps,
    NextListing,
    Listing(u32),
    /// The open listing of a token, if any.
    TokenListing(u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub listing_id: u32,
    pub seller: Address,
    pub token_id: u32,
    pub class_id: u32,
    /// Price in stroops, paid by the buyer; the seller receives it minus the fee.
    pub price: i128,
    pub live_until_ledger: u32,
    pub active: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listed {
    #[topic]
    pub seller: Address,
    #[topic]
    pub token_id: u32,
    pub listing_id: u32,
    pub price: i128,
    pub live_until_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cancelled {
    #[topic]
    pub seller: Address,
    pub listing_id: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Sold {
    #[topic]
    pub seller: Address,
    #[topic]
    pub buyer: Address,
    pub listing_id: u32,
    pub token_id: u32,
    pub price: i128,
    pub fee: i128,
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LISTING_THRESHOLD, LISTING_BUMP);
}

fn instance_address(env: &Env, key: &DataKey) -> Address {
    env.storage().instance().get(key).unwrap()
}

fn cosmetics(env: &Env) -> CosmeticsClient<'_> {
    CosmeticsClient::new(env, &instance_address(env, &DataKey::Cosmetics))
}

fn read_listing(env: &Env, listing_id: u32) -> Listing {
    env.storage()
        .persistent()
        .get(&DataKey::Listing(listing_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::ListingNotFound))
}

fn write_listing(env: &Env, listing: &Listing) {
    let key = DataKey::Listing(listing.listing_id);
    env.storage().persistent().set(&key, listing);
    bump(env, &key);
}

/// Marks a listing closed and frees its token for a new listing.
fn close(env: &Env, mut listing: Listing) {
    listing.active = false;
    write_listing(env, &listing);
    env.storage()
        .persistent()
        .remove(&DataKey::TokenListing(listing.token_id));
}

/// Floor of `price * fee_bps / 10_000`: rounding always favours the seller.
pub fn fee_for(price: i128, fee_bps: u32) -> i128 {
    price * fee_bps as i128 / 10_000
}

#[contract]
pub struct Marketplace;

#[contractimpl]
impl Marketplace {
    pub fn __constructor(
        env: Env,
        admin: Address,
        cosmetics: Address,
        payment_token: Address,
        fee_recipient: Address,
        fee_bps: u32,
    ) {
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Cosmetics, &cosmetics);
        storage.set(&DataKey::PaymentToken, &payment_token);
        storage.set(&DataKey::FeeRecipient, &fee_recipient);
        storage.set(&DataKey::FeeBps, &fee_bps);
        storage.set(&DataKey::NextListing, &1u32);
        bump_instance(&env);
    }

    pub fn version() -> u32 {
        1
    }

    /// Lists a collection piece. The seller signs once: this call also approves the market on
    /// the cosmetics contract until `live_until_ledger`. Listing the same token again replaces
    /// the previous listing.
    pub fn list(
        env: Env,
        seller: Address,
        token_id: u32,
        price: i128,
        live_until_ledger: u32,
    ) -> u32 {
        seller.require_auth();
        bump_instance(&env);
        if price <= 0 {
            panic_with_error!(&env, Error::PriceTooLow);
        }
        let now = env.ledger().sequence();
        if live_until_ledger <= now || live_until_ledger > now + MAX_LISTING_LEDGERS {
            panic_with_error!(&env, Error::InvalidLedger);
        }
        let pieces = cosmetics(&env);
        if pieces.owner_of(&token_id) != seller {
            panic_with_error!(&env, Error::NotOwner);
        }
        // Merit pieces are rejected here by the cosmetics contract (NotTransferable).
        pieces.approve(
            &seller,
            &env.current_contract_address(),
            &token_id,
            &live_until_ledger,
        );

        if let Some(previous) = env
            .storage()
            .persistent()
            .get::<_, u32>(&DataKey::TokenListing(token_id))
        {
            close(&env, read_listing(&env, previous));
        }
        let listing_id: u32 = env.storage().instance().get(&DataKey::NextListing).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextListing, &(listing_id + 1));
        let listing = Listing {
            listing_id,
            seller: seller.clone(),
            token_id,
            class_id: pieces.class_of(&token_id),
            price,
            live_until_ledger,
            active: true,
        };
        write_listing(&env, &listing);
        let token_key = DataKey::TokenListing(token_id);
        env.storage().persistent().set(&token_key, &listing_id);
        bump(&env, &token_key);

        Listed {
            seller,
            token_id,
            listing_id,
            price,
            live_until_ledger,
        }
        .publish(&env);
        listing_id
    }

    /// The seller withdraws a listing and the market's approval on the piece.
    pub fn cancel(env: Env, seller: Address, listing_id: u32) {
        seller.require_auth();
        bump_instance(&env);
        let listing = read_listing(&env, listing_id);
        if listing.seller != seller {
            panic_with_error!(&env, Error::NotSeller);
        }
        if !listing.active {
            panic_with_error!(&env, Error::ListingInactive);
        }
        let pieces = cosmetics(&env);
        // Revoke only while the seller still owns the piece and the approval is ours.
        if pieces.owner_of(&listing.token_id) == seller
            && pieces.get_approved(&listing.token_id) == Some(env.current_contract_address())
        {
            pieces.approve(
                &seller,
                &env.current_contract_address(),
                &listing.token_id,
                &0,
            );
        }
        close(&env, listing);
        Cancelled { seller, listing_id }.publish(&env);
    }

    /// Buys a listing. `max_price` protects the buyer if the price changed after they looked.
    /// XLM goes buyer → seller (minus fee) and buyer → fee recipient; then the piece moves.
    pub fn buy(env: Env, buyer: Address, listing_id: u32, max_price: i128) {
        buyer.require_auth();
        bump_instance(&env);
        let listing = read_listing(&env, listing_id);
        if !listing.active {
            panic_with_error!(&env, Error::ListingInactive);
        }
        if listing.live_until_ledger < env.ledger().sequence() {
            panic_with_error!(&env, Error::ListingExpired);
        }
        if listing.price > max_price {
            panic_with_error!(&env, Error::PriceAboveMax);
        }
        if listing.seller == buyer {
            panic_with_error!(&env, Error::SelfPurchase);
        }
        let pieces = cosmetics(&env);
        let market = env.current_contract_address();
        if pieces.owner_of(&listing.token_id) != listing.seller {
            panic_with_error!(&env, Error::NotOwner);
        }
        if pieces.get_approved(&listing.token_id) != Some(market.clone()) {
            panic_with_error!(&env, Error::NotApproved);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();
        let fee = fee_for(listing.price, fee_bps);
        let payment = token::Client::new(&env, &instance_address(&env, &DataKey::PaymentToken));
        payment.transfer(&buyer, &listing.seller, &(listing.price - fee));
        if fee > 0 {
            let fee_recipient = instance_address(&env, &DataKey::FeeRecipient);
            payment.transfer(&buyer, &fee_recipient, &fee);
        }
        pieces.transfer_from(&market, &listing.seller, &buyer, &listing.token_id);

        let (seller, token_id, price) = (listing.seller.clone(), listing.token_id, listing.price);
        close(&env, listing);
        Sold {
            seller,
            buyer,
            listing_id,
            token_id,
            price,
            fee,
        }
        .publish(&env);
    }

    /// Admin only; at most `MAX_FEE_BPS`.
    pub fn set_fee(env: Env, fee_bps: u32) {
        instance_address(&env, &DataKey::Admin).require_auth();
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        bump_instance(&env);
    }

    pub fn fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap()
    }

    pub fn get_listing(env: Env, listing_id: u32) -> Listing {
        read_listing(&env, listing_id)
    }

    /// The open listing of a token, if any.
    pub fn listing_of_token(env: Env, token_id: u32) -> Option<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenListing(token_id))
    }

    /// Open, unexpired listings with an id greater than `start_after`, oldest first, at most
    /// `limit` (capped at `MAX_PAGE`). Page by passing the last id seen.
    pub fn listings(env: Env, start_after: u32, limit: u32) -> Vec<Listing> {
        let next: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextListing)
            .unwrap_or(1);
        let now = env.ledger().sequence();
        let limit = limit.min(MAX_PAGE);
        let mut found = Vec::new(&env);
        let mut id = start_after.saturating_add(1);
        let mut scanned = 0u32;
        // Closed listings still cost a read, so the scan itself is bounded too.
        while id < next && found.len() < limit && scanned < MAX_PAGE * 3 {
            if let Some(listing) = env
                .storage()
                .persistent()
                .get::<_, Listing>(&DataKey::Listing(id))
            {
                if listing.active && listing.live_until_ledger >= now {
                    found.push_back(listing);
                }
            }
            id += 1;
            scanned += 1;
        }
        found
    }

    /// Ids handed out so far; `listings` pages below this.
    pub fn next_listing_id(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextListing)
            .unwrap_or(1)
    }
}

#[cfg(test)]
mod test;
