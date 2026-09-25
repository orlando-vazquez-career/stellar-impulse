extern crate std;

use super::{Cosmetics, CosmeticsClient, Error, Family, Slot};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

const LIVERY: u32 = 1; // collection, transferable, sold
const EMBLEM_FIRST_WIN: u32 = 2; // merit, soulbound, reward only
const TRAIL_LIMITED: u32 = 3; // collection, supply cap 1
const PRICE: i128 = 100;

struct Setup<'a> {
    env: Env,
    client: CosmeticsClient<'a>,
    token: TokenClient<'a>,
    admin: Address,
    minter: Address,
    treasury: Address,
    player: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let treasury = Address::generate(&env);
    let player = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address()).mint(&player, &1_000);
    let token = TokenClient::new(&env, &sac.address());

    let contract_id = env.register(
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
    let client = CosmeticsClient::new(&env, &contract_id);
    let uri = |s: &str| String::from_str(&env, s);
    client.create_class(
        &LIVERY,
        &Slot::Livery,
        &Family::Collection,
        &true,
        &0,
        &PRICE,
        &uri("ipfs://aurora-andina"),
    );
    client.create_class(
        &EMBLEM_FIRST_WIN,
        &Slot::Emblem,
        &Family::Merit,
        &false,
        &0,
        &0,
        &uri("ipfs://primera-victoria"),
    );
    client.create_class(
        &TRAIL_LIMITED,
        &Slot::Trail,
        &Family::Collection,
        &true,
        &1,
        &PRICE,
        &uri("ipfs://pulso-violeta"),
    );

    Setup {
        env,
        client,
        token,
        admin,
        minter,
        treasury,
        player,
    }
}

fn reward(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

#[test]
fn buy_charges_treasury_and_mints_to_buyer() {
    let s = setup();
    let id = s.client.buy(&s.player, &LIVERY);

    assert_eq!(s.client.owner_of(&id), s.player);
    assert_eq!(s.client.balance(&s.player), 1);
    assert!(s.client.has_class(&s.player, &LIVERY));
    assert_eq!(s.token.balance(&s.player), 1_000 - PRICE);
    assert_eq!(s.token.balance(&s.treasury), PRICE);
    assert_eq!(
        s.client.token_uri(&id),
        String::from_str(&s.env, "ipfs://aurora-andina")
    );
    assert_eq!(s.client.get_class(&LIVERY).minted, 1);
}

#[test]
fn grant_requires_minter_and_is_idempotent() {
    let s = setup();
    let id = s
        .client
        .grant(&s.player, &EMBLEM_FIRST_WIN, &reward(&s.env, 7));
    assert_eq!(s.env.auths()[0].0, s.minter);
    assert_eq!(s.client.class_of(&id), EMBLEM_FIRST_WIN);
    assert!(s.client.is_reward_claimed(&reward(&s.env, 7)));

    let again = s
        .client
        .try_grant(&s.player, &EMBLEM_FIRST_WIN, &reward(&s.env, 7));
    assert_eq!(again, Err(Ok(Error::RewardAlreadyClaimed.into())));
    assert_eq!(s.client.balance(&s.player), 1);
}

#[test]
fn merit_pieces_cannot_be_bought_moved_or_listed() {
    let s = setup();
    let other = Address::generate(&s.env);
    let id = s
        .client
        .grant(&s.player, &EMBLEM_FIRST_WIN, &reward(&s.env, 1));

    assert_eq!(
        s.client.try_buy(&s.player, &EMBLEM_FIRST_WIN),
        Err(Ok(Error::NotForSale.into()))
    );
    assert_eq!(
        s.client.try_transfer(&s.player, &other, &id),
        Err(Ok(Error::NotTransferable.into()))
    );
    assert_eq!(
        s.client.try_approve(&s.player, &other, &id, &1_000),
        Err(Ok(Error::NotTransferable.into()))
    );
}

#[test]
fn marketplace_settles_through_approve_and_transfer_from() {
    let s = setup();
    let market = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let id = s.client.buy(&s.player, &LIVERY);

    s.client.approve(&s.player, &market, &id, &1_000);
    assert_eq!(s.client.get_approved(&id), Some(market.clone()));

    s.client.transfer_from(&market, &s.player, &buyer, &id);
    assert_eq!(s.client.owner_of(&id), buyer);
    assert_eq!(s.client.balance(&s.player), 0);
    assert_eq!(s.client.tokens_of(&buyer).len(), 1);
    // Approval does not survive a change of owner.
    assert_eq!(s.client.get_approved(&id), None);
    assert_eq!(
        s.client.try_transfer_from(&market, &buyer, &s.player, &id),
        Err(Ok(Error::NotAuthorized.into()))
    );
}

#[test]
fn operator_approval_covers_all_tokens_and_can_be_revoked() {
    let s = setup();
    let market = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let id = s.client.buy(&s.player, &LIVERY);

    s.client.approve_for_all(&s.player, &market, &1_000);
    assert!(s.client.is_approved_for_all(&s.player, &market));
    s.client.approve_for_all(&s.player, &market, &0);
    assert!(!s.client.is_approved_for_all(&s.player, &market));
    assert_eq!(
        s.client.try_transfer_from(&market, &s.player, &buyer, &id),
        Err(Ok(Error::NotAuthorized.into()))
    );
}

#[test]
fn expired_approval_is_ignored() {
    let s = setup();
    let market = Address::generate(&s.env);
    let id = s.client.buy(&s.player, &LIVERY);
    s.client.approve(&s.player, &market, &id, &50);

    s.env.ledger().with_mut(|l| l.sequence_number = 51);
    assert_eq!(s.client.get_approved(&id), None);
    assert_eq!(
        s.client.try_transfer_from(&market, &s.player, &market, &id),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        s.client.try_approve(&s.player, &market, &id, &10),
        Err(Ok(Error::InvalidLedger.into()))
    );
}

#[test]
fn only_owner_can_transfer() {
    let s = setup();
    let thief = Address::generate(&s.env);
    let id = s.client.buy(&s.player, &LIVERY);
    assert_eq!(
        s.client.try_transfer(&thief, &thief, &id),
        Err(Ok(Error::NotOwner.into()))
    );
    assert_eq!(
        s.client.try_transfer(&s.player, &s.player, &id),
        Err(Ok(Error::SelfTransfer.into()))
    );
    assert_eq!(
        s.client.try_owner_of(&999),
        Err(Ok(Error::TokenNotFound.into()))
    );
}

#[test]
fn supply_cap_is_enforced() {
    let s = setup();
    s.client.buy(&s.player, &TRAIL_LIMITED);
    assert_eq!(
        s.client.try_buy(&s.player, &TRAIL_LIMITED),
        Err(Ok(Error::SupplyExhausted.into()))
    );
}

#[test]
fn class_rules_are_validated() {
    let s = setup();
    let uri = String::from_str(&s.env, "ipfs://x");
    assert_eq!(
        s.client.try_create_class(
            &LIVERY,
            &Slot::Livery,
            &Family::Collection,
            &true,
            &0,
            &1,
            &uri
        ),
        Err(Ok(Error::ClassExists.into()))
    );
    assert_eq!(
        s.client
            .try_create_class(&10, &Slot::Emblem, &Family::Merit, &true, &0, &0, &uri),
        Err(Ok(Error::InvalidClass.into()))
    );
    assert_eq!(
        s.client
            .try_create_class(&11, &Slot::Emblem, &Family::Merit, &false, &0, &5, &uri),
        Err(Ok(Error::InvalidClass.into()))
    );
    assert_eq!(
        s.client
            .try_create_class(&12, &Slot::Trail, &Family::Veteran, &true, &0, &0, &uri),
        Err(Ok(Error::InvalidClass.into()))
    );
    assert_eq!(
        s.client
            .try_create_class(&13, &Slot::Trail, &Family::Collection, &true, &0, &-1, &uri),
        Err(Ok(Error::InvalidPrice.into()))
    );
    assert_eq!(
        s.client.try_get_class(&99),
        Err(Ok(Error::ClassNotFound.into()))
    );
}

#[test]
fn admin_controls_classes_and_price() {
    let s = setup();
    s.client.set_price(&LIVERY, &0);
    assert_eq!(s.env.auths()[0].0, s.admin);
    assert_eq!(
        s.client.try_buy(&s.player, &LIVERY),
        Err(Ok(Error::NotForSale.into()))
    );
}

#[test]
#[should_panic]
fn create_class_without_admin_auth_fails() {
    let s = setup();
    s.env.set_auths(&[]);
    s.client.create_class(
        &20,
        &Slot::Livery,
        &Family::Collection,
        &true,
        &0,
        &1,
        &String::from_str(&s.env, "ipfs://x"),
    );
}

#[test]
fn metadata_and_version() {
    let s = setup();
    assert_eq!(
        s.client.name(),
        String::from_str(&s.env, "Impulso Cosmetics")
    );
    assert_eq!(s.client.symbol(), String::from_str(&s.env, "IMPC"));
    assert_eq!(s.client.version(), 2);
}
