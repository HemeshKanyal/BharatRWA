//! BharatRWA Token-2022 transfer hook.
//!
//! Token-2022 calls `execute` on every transfer of a mint whose transfer-hook
//! extension points here. The transfer is rejected unless:
//! - the source owner has a valid (approved, unexpired) allowlist entry, and
//! - the destination owner has a valid allowlist entry.
//!
//! Exception: when the transfer authority is the mint's permanent delegate
//! (issuer forced transfer, e.g. court order), only the destination is
//! checked. This mirrors ERC-7943 `forcedTransfer`, which may bypass the
//! sender check but SHOULD still check `canReceive(to)`.
//!
//! The allowlist entries are PDAs of the compliance program, seeded by
//! ["allowlist", mint, owner]. Their addresses are declared in the
//! extra-account-metas account so wallets and clients can resolve them.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        permanent_delegate::PermanentDelegate, transfer_hook::TransferHookAccount,
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as SplTokenAccount, Mint as SplMint},
};
use anchor_spl::token_interface::{Mint, TokenAccount};
use compliance::{AllowlistEntry, ALLOWLIST_SEED};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_discriminator::SplDiscriminate;

declare_id!("AtGeNjNoNobDCBP6gvtgDK1gvsWkQe2Xm3F5RziJkS88");

pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// Index of each account in the `execute` instruction, as defined by the
/// transfer-hook interface (0-4) and our extra-account-metas list (5-7).
mod idx {
    pub const SOURCE: u8 = 0;
    pub const MINT: u8 = 1;
    pub const DESTINATION: u8 = 2;
    pub const COMPLIANCE_PROGRAM: u8 = 5;
}

/// Byte range of the `owner` field inside an SPL token account.
const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;

#[program]
pub mod transfer_hook {
    use super::*;

    /// Create the extra-account-metas PDA for a mint. Its contents are fixed
    /// by this program, so it is safe for anyone to pay for it.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let metas = extra_account_metas()?;
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
        Ok(())
    }

    /// Called by Token-2022 during `transfer_checked`.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        assert_is_transferring(&ctx.accounts.source_token.to_account_info())?;

        let now = Clock::get()?.unix_timestamp;
        let forced = is_permanent_delegate(
            &ctx.accounts.mint.to_account_info(),
            ctx.accounts.owner.key,
        )?;

        if !forced {
            require!(
                entry_is_valid(&ctx.accounts.source_entry, now)?,
                HookError::SourceNotAllowlisted
            );
        }
        require!(
            entry_is_valid(&ctx.accounts.destination_entry, now)?,
            HookError::DestinationNotAllowlisted
        );
        Ok(())
    }
}

/// The accounts Token-2022 must append when invoking `execute`, after the
/// standard five (source, mint, destination, owner, extra-account-metas):
///   5: compliance program id
///   6: source owner's allowlist entry  = compliance PDA ["allowlist", mint, source.owner]
///   7: destination owner's entry       = compliance PDA ["allowlist", mint, destination.owner]
pub fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    let entry_seeds = |token_account_index: u8| {
        vec![
            Seed::Literal { bytes: ALLOWLIST_SEED.to_vec() },
            Seed::AccountKey { index: idx::MINT },
            Seed::AccountData {
                account_index: token_account_index,
                data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
                length: 32,
            },
        ]
    };
    Ok(vec![
        ExtraAccountMeta::new_with_pubkey(&compliance::ID, false, false)?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            idx::COMPLIANCE_PROGRAM,
            &entry_seeds(idx::SOURCE),
            false,
            false,
        )?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            idx::COMPLIANCE_PROGRAM,
            &entry_seeds(idx::DESTINATION),
            false,
            false,
        )?,
    ])
}

/// Reject direct calls to `execute`: Token-2022 sets the `transferring` flag
/// on the source account only for the duration of a real transfer.
fn assert_is_transferring(source: &AccountInfo) -> Result<()> {
    let data = source.try_borrow_data()?;
    let account = StateWithExtensions::<SplTokenAccount>::unpack(&data)?;
    let ext = account.get_extension::<TransferHookAccount>()?;
    require!(bool::from(ext.transferring), HookError::NotTransferring);
    Ok(())
}

fn is_permanent_delegate(mint: &AccountInfo, authority: &Pubkey) -> Result<bool> {
    let data = mint.try_borrow_data()?;
    let mint = StateWithExtensions::<SplMint>::unpack(&data)?;
    Ok(match mint.get_extension::<PermanentDelegate>() {
        Ok(ext) => Option::<Pubkey>::from(ext.delegate) == Some(*authority),
        Err(_) => false,
    })
}

/// A missing entry (empty account) is treated as "not allowlisted". An
/// account with data must be a real `AllowlistEntry` owned by the compliance
/// program; the address itself is pinned by the seeds constraint.
fn entry_is_valid(entry: &UncheckedAccount, now: i64) -> Result<bool> {
    if entry.data_is_empty() {
        return Ok(false);
    }
    require_keys_eq!(*entry.owner, compliance::ID, HookError::InvalidEntryOwner);
    let data = entry.try_borrow_data()?;
    let entry = AllowlistEntry::try_deserialize(&mut &data[..])?;
    Ok(entry.is_valid(now))
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: initialized by this instruction with the TLV layout.
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(extra_account_metas()?.len())?,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

/// Account order is fixed by the transfer-hook interface.
#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source owner or delegate; Token-2022 has already checked it signed.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: our extra-account-metas PDA.
    #[account(seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: must be the compliance program id.
    #[account(address = compliance::ID)]
    pub compliance_program: UncheckedAccount<'info>,
    /// CHECK: validated in `entry_is_valid`; address pinned by seeds.
    #[account(
        seeds = [ALLOWLIST_SEED, mint.key().as_ref(), source_token.owner.as_ref()],
        bump,
        seeds::program = compliance::ID,
    )]
    pub source_entry: UncheckedAccount<'info>,
    /// CHECK: validated in `entry_is_valid`; address pinned by seeds.
    #[account(
        seeds = [ALLOWLIST_SEED, mint.key().as_ref(), destination_token.owner.as_ref()],
        bump,
        seeds::program = compliance::ID,
    )]
    pub destination_entry: UncheckedAccount<'info>,
}

#[error_code]
pub enum HookError {
    #[msg("Source owner is not on the allowlist, or the entry is revoked or expired")]
    SourceNotAllowlisted,
    #[msg("Destination owner is not on the allowlist, or the entry is revoked or expired")]
    DestinationNotAllowlisted,
    #[msg("execute may only be called by Token-2022 during a transfer")]
    NotTransferring,
    #[msg("Allowlist entry is not owned by the compliance program")]
    InvalidEntryOwner,
}
