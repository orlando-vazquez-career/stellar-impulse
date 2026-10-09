extern crate std;

use super::{fee_for, Error, Marketplace, MarketplaceClient, MAX_LISTING_LEDGERS, MAX_PAGE};
use impulso_cosmetics::{Cosmetics, CosmeticsClient, Family, Slot};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

const SKIN: u32 = 1; // collection, transferable
const EMBLEM: u32 = 3; // merit, bound to its owner
const SHOP_PRICE: i128 = 100;
const PRICE: i128 = 1_000;
const FEE_BPS: u32 = 500;

struct Setup<'a> {
    env: Env,
    pieces: CosmeticsClient<'a>,
    market: MarketplaceClient<'a>,
    xlm: TokenClient<'a>,
    admin: Address,
    treasury: Address,
    seller: Address,
    buyer: Address,
    /// The seller's skin, bought in the shop.
    token: u32,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(1_000);
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let treasury = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let xlm = TokenClient::new(&env, &sac.address());
    let mint = StellarAssetClient::new(&env, &sac.address());
    mint.mint(&seller, &SHOP_PRICE);
    mint.mint(&buyer, &(10 * PRICE));

    let cosmetics_id = env.register(
        Cosmetics,
        (
            admin.clone(),
            minter.clone(),
            treasury.clone(),
            sac.address(),
            String::from_str(&env, "Impulso Cosmetics"),
            String::from_str(&env, "IMPC"),
        ),
    );
    let pieces = CosmeticsClient::new(&env, &cosmetics_id);
    let uri = String::from_str(&env, "/cosmetics/x.json");
    pieces.create_class(
        &SKIN,
        &Slot::Livery,
        &Family::Collection,
        &true,
        &0,
        &SHOP_PRICE,
        &uri,
    );
    pieces.create_class(&EMBLEM, &Slot::Emblem, &Family::Merit, &false, &0, &0, &uri);
    let token = pieces.buy(&seller, &SKIN);

    let market_id = env.register(
        Marketplace,
        (
            admin.clone(),
            cosmetics_id,
            sac.address(),
            treasury.clone(),
            FEE_BPS,
        ),
    );
    let market = MarketplaceClient::new(&env, &market_id);

    Setup {
        env,
        pieces,
        market,
        xlm,
        admin,
        treasury,
        seller,
        buyer,
        token,
    }
}

fn until(s: &Setup, ledgers: u32) -> u32 {
    s.env.ledger().sequence() + ledgers
}

#[test]
fn a_sale_pays_the_seller_and_the_fee_and_moves_the_piece() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    // The seller keeps the piece until it sells: the market only holds an approval.
    assert_eq!(s.pieces.owner_of(&s.token), s.seller);
    assert_eq!(
        s.pieces.get_approved(&s.token),
        Some(s.market.address.clone())
    );
    assert_eq!(s.market.get_listing(&listing).class_id, SKIN);

    let treasury_before = s.xlm.balance(&s.treasury);
    s.market.buy(&s.buyer, &listing, &PRICE);

    let fee = PRICE * FEE_BPS as i128 / 10_000;
    assert_eq!(s.pieces.owner_of(&s.token), s.buyer);
    assert_eq!(s.xlm.balance(&s.seller), PRICE - fee);
    assert_eq!(s.xlm.balance(&s.treasury), treasury_before + fee);
    assert_eq!(s.xlm.balance(&s.buyer), 9 * PRICE);
    assert!(!s.market.get_listing(&listing).active);
    assert_eq!(s.market.listing_of_token(&s.token), None);
    assert_eq!(s.pieces.get_approved(&s.token), None);
}

#[test]
fn listing_and_buying_each_need_one_signature() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1, "only the seller signs a listing");
    assert_eq!(auths[0].0, s.seller);
    // The seller's one signature also covers the approval on the cosmetics contract.
    assert_eq!(auths[0].1.sub_invocations.len(), 1);

    s.market.buy(&s.buyer, &listing, &PRICE);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1, "only the buyer signs a purchase");
    assert_eq!(auths[0].0, s.buyer);
    // Payment to the seller and to the fee recipient, under the same signature.
    assert_eq!(auths[0].1.sub_invocations.len(), 2);
}

#[test]
fn merit_pieces_cannot_be_listed() {
    let s = setup();
    let emblem = s
        .pieces
        .grant(&s.seller, &EMBLEM, &BytesN::from_array(&s.env, &[1; 32]));
    assert!(s
        .market
        .try_list(&s.seller, &emblem, &PRICE, &until(&s, 1_000))
        .is_err());
    assert_eq!(s.market.listings(&0, &MAX_PAGE).len(), 0);
}

#[test]
fn only_the_owner_can_list_a_piece() {
    let s = setup();
    let result = s
        .market
        .try_list(&s.buyer, &s.token, &PRICE, &until(&s, 1_000));
    assert_eq!(result, Err(Ok(Error::NotOwner.into())));
}

#[test]
fn listing_rules_are_enforced() {
    let s = setup();
    assert_eq!(
        s.market
            .try_list(&s.seller, &s.token, &0, &until(&s, 1_000)),
        Err(Ok(Error::PriceTooLow.into()))
    );
    assert_eq!(
        s.market
            .try_list(&s.seller, &s.token, &PRICE, &s.env.ledger().sequence()),
        Err(Ok(Error::InvalidLedger.into()))
    );
    assert_eq!(
        s.market.try_list(
            &s.seller,
            &s.token,
            &PRICE,
            &until(&s, MAX_LISTING_LEDGERS + 1)
        ),
        Err(Ok(Error::InvalidLedger.into()))
    );
}

#[test]
fn a_piece_that_left_the_seller_cannot_be_sold() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    let friend = Address::generate(&s.env);
    s.pieces.transfer(&s.seller, &friend, &s.token);

    assert_eq!(
        s.market.try_buy(&s.buyer, &listing, &PRICE),
        Err(Ok(Error::NotOwner.into()))
    );
    assert_eq!(
        s.xlm.balance(&s.buyer),
        10 * PRICE,
        "a failed sale charges nothing"
    );
}

#[test]
fn a_cancelled_listing_cannot_be_bought_and_loses_its_approval() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    assert_eq!(
        s.market.try_cancel(&s.buyer, &listing),
        Err(Ok(Error::NotSeller.into()))
    );
    s.market.cancel(&s.seller, &listing);

    assert_eq!(s.pieces.get_approved(&s.token), None);
    assert_eq!(
        s.market.try_buy(&s.buyer, &listing, &PRICE),
        Err(Ok(Error::ListingInactive.into()))
    );
    assert_eq!(
        s.market.try_cancel(&s.seller, &listing),
        Err(Ok(Error::ListingInactive.into()))
    );
}

#[test]
fn a_sold_listing_cannot_be_bought_twice() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    s.market.buy(&s.buyer, &listing, &PRICE);
    let third = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.xlm.address).mint(&third, &PRICE);
    assert_eq!(
        s.market.try_buy(&third, &listing, &PRICE),
        Err(Ok(Error::ListingInactive.into()))
    );
}

#[test]
fn an_expired_listing_cannot_be_bought() {
    let s = setup();
    let listing = s.market.list(&s.seller, &s.token, &PRICE, &until(&s, 10));
    s.env
        .ledger()
        .set_sequence_number(s.env.ledger().sequence() + 11);
    assert_eq!(
        s.market.try_buy(&s.buyer, &listing, &PRICE),
        Err(Ok(Error::ListingExpired.into()))
    );
    assert_eq!(s.market.listings(&0, &MAX_PAGE).len(), 0);
}

#[test]
fn the_buyer_is_protected_and_cannot_buy_from_themselves() {
    let s = setup();
    let listing = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    assert_eq!(
        s.market.try_buy(&s.buyer, &listing, &(PRICE - 1)),
        Err(Ok(Error::PriceAboveMax.into()))
    );
    assert_eq!(
        s.market.try_buy(&s.seller, &listing, &PRICE),
        Err(Ok(Error::SelfPurchase.into()))
    );
}

#[test]
fn listing_again_replaces_the_previous_listing() {
    let s = setup();
    let first = s
        .market
        .list(&s.seller, &s.token, &PRICE, &until(&s, 1_000));
    let second = s
        .market
        .list(&s.seller, &s.token, &(PRICE * 2), &until(&s, 1_000));
    assert!(!s.market.get_listing(&first).active);
    assert_eq!(s.market.listing_of_token(&s.token), Some(second));
    let open = s.market.listings(&0, &MAX_PAGE);
    assert_eq!(open.len(), 1);
    assert_eq!(open.get(0).unwrap().price, PRICE * 2);
}

#[test]
fn listings_page_through_open_offers() {
    let s = setup();
    let mint = StellarAssetClient::new(&s.env, &s.xlm.address);
    let mut ids = std::vec::Vec::new();
    for _ in 0..4 {
        let owner = Address::generate(&s.env);
        mint.mint(&owner, &SHOP_PRICE);
        let token = s.pieces.buy(&owner, &SKIN);
        ids.push(s.market.list(&owner, &token, &PRICE, &until(&s, 1_000)));
    }
    let first_page = s.market.listings(&0, &2);
    assert_eq!(first_page.len(), 2);
    let last = first_page.get(1).unwrap().listing_id;
    let second_page = s.market.listings(&last, &2);
    assert_eq!(second_page.len(), 2);
    assert_eq!(second_page.get(1).unwrap().listing_id, *ids.last().unwrap());
    assert_eq!(s.market.next_listing_id(), ids.last().unwrap() + 1);
}

#[test]
fn the_fee_is_bounded_and_rounds_for_the_seller() {
    let s = setup();
    assert_eq!(fee_for(999, 500), 49);
    assert_eq!(
        s.market.try_set_fee(&1_001),
        Err(Ok(Error::FeeTooHigh.into()))
    );
    s.market.set_fee(&250);
    // Only the admin signed the change.
    assert_eq!(s.env.auths()[0].0, s.admin);
    assert_eq!(s.market.fee_bps(), 250);
}

#[test]
#[should_panic]
fn the_constructor_rejects_a_fee_above_ten_percent() {
    let env = Env::default();
    let any = Address::generate(&env);
    env.register(
        Marketplace,
        (any.clone(), any.clone(), any.clone(), any, 1_001u32),
    );
}

#[test]
fn version_is_one() {
    let s = setup();
    assert_eq!(s.market.version(), 1);
}
