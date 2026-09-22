#![no_std]

use soroban_sdk::{contract, contractimpl};

/// A buildable interface marker. Cosmetic ownership and payments are not implemented.
#[contract]
pub struct Cosmetics;

#[contractimpl]
impl Cosmetics {
    /// Version of this scaffold's interface; does not read or write storage.
    pub fn version() -> u32 {
        1
    }
}

#[cfg(test)]
mod test {
    use super::{Cosmetics, CosmeticsClient};
    use soroban_sdk::Env;

    #[test]
    fn exposes_version_through_the_contract_host() {
        let env = Env::default();
        let contract_id = env.register(Cosmetics, ());
        let client = CosmeticsClient::new(&env, &contract_id);

        assert_eq!(client.version(), 1);
        assert!(env.auths().is_empty());
    }
}
