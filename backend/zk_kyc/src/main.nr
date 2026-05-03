use std::hash::pedersen_hash;

// Noir main function
fn main(
    // Private inputs
    age: u32,
    kyc_verified: bool,
    sanctioned: bool,
    wallet: Field,
    secret: Field,

    // Public input
    expected_wallet_hash: pub Field
) -> pub [Field; 5] {

    // ================= CONDITIONS =================
    assert(age >= 18);
    assert(kyc_verified);
    assert(!sanctioned);

    // ================= WALLET HASH =================
    let wallet_hash = pedersen_hash([wallet]);

    assert(wallet_hash == expected_wallet_hash);

    // ================= NULLIFIER =================
    let nullifier = pedersen_hash([wallet, secret]);

    // Flags (must be used, otherwise warning)
    let age_flag = 1;
    let kyc_flag = 1;
    let sanction_flag = 0;

    // Noir returns LAST expression (no return keyword)
    [
        nullifier,
        age_flag,
        kyc_flag,
        sanction_flag,
        wallet_hash
    ]
}