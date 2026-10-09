//! BharatRWA compliance program.
//!
//! Owns the investor allowlist for a Token-2022 RWA mint and acts as that
//! mint's freeze authority (through the `Config` PDA), so that approving an
//! investor can write the allowlist entry and thaw their token account in a
//! single instruction.
//!
//! Roles (stored in `Config`):
//! - `issuer`: the mint authority. Freezes/thaws accounts for enforcement and
//!   rotates the attester.
//! - `attester`: the KYC attester. Adds, updates and removes allowlist entries
//!   after a ZK-KYC proof has been verified off-chain.
//!
//! An issuer freeze places a `LegalHold` on the token account; the attester
//! cannot thaw an account under legal hold, so only the issuer can undo it.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
};

declare_id!("588hz1dHm9goLKBAt4yRwNaEDeuF97teDrjd2E6XdE9E");

pub const CONFIG_SEED: &[u8] = b"config";
pub const ALLOWLIST_SEED: &[u8] = b"allowlist";
pub const LEGAL_HOLD_SEED: &[u8] = b"legal-hold";

#[program]
pub mod compliance {
    use super::*;

    /// Create the compliance config for a mint. The caller must be the mint
    /// authority, and the mint's freeze authority must already be the config
    /// PDA (set when the mint is created).
    pub fn initialize(ctx: Context<Initialize>, attester: Pubkey) -> Result<()> {
        let mint = &ctx.accounts.mint;
        let config_key = ctx.accounts.config.key();
        require!(
            mint.mint_authority == Some(ctx.accounts.issuer.key()).into(),
            ComplianceError::NotMintAuthority
        );
        require!(
            mint.freeze_authority == Some(config_key).into(),
            ComplianceError::FreezeAuthorityNotConfig
        );

        let config = &mut ctx.accounts.config;
        config.mint = mint.key();
        config.issuer = ctx.accounts.issuer.key();
        config.attester = attester;
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized { mint: config.mint, issuer: config.issuer, attester });
        Ok(())
    }

    /// Rotate the attester. Issuer only.
    pub fn set_attester(ctx: Context<IssuerOnly>, new_attester: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let old = config.attester;
        config.attester = new_attester;
        emit!(AttesterChanged { mint: config.mint, old_attester: old, new_attester });
        Ok(())
    }

    /// Add an investor to the allowlist and thaw their token account.
    /// Attester only. Fails if the account is under an issuer legal hold.
    pub fn approve_investor(
        ctx: Context<ApproveInvestor>,
        jurisdiction: [u8; 2],
        expires_at: i64,
    ) -> Result<()> {
        validate_entry(jurisdiction, expires_at)?;
        require!(ctx.accounts.legal_hold.data_is_empty(), ComplianceError::UnderLegalHold);

        let entry = &mut ctx.accounts.entry;
        entry.mint = ctx.accounts.mint.key();
        entry.wallet = ctx.accounts.wallet.key();
        entry.approved = true;
        entry.jurisdiction = jurisdiction;
        entry.expires_at = expires_at;
        entry.bump = ctx.bumps.entry;

        if ctx.accounts.token_account.is_frozen() {
            thaw(
                &ctx.accounts.config,
                &ctx.accounts.mint,
                &ctx.accounts.token_account,
                &ctx.accounts.token_program,
            )?;
        }

        emit!(InvestorApproved {
            mint: entry.mint,
            wallet: entry.wallet,
            jurisdiction,
            expires_at,
        });
        Ok(())
    }

    /// Change an existing entry (approval flag, jurisdiction, expiry). Setting
    /// `approved = false` revokes the investor without closing the entry.
    /// Attester only. Does not freeze or thaw anything.
    pub fn update_investor(
        ctx: Context<UpdateInvestor>,
        approved: bool,
        jurisdiction: [u8; 2],
        expires_at: i64,
    ) -> Result<()> {
        validate_entry(jurisdiction, expires_at)?;
        let entry = &mut ctx.accounts.entry;
        entry.approved = approved;
        entry.jurisdiction = jurisdiction;
        entry.expires_at = expires_at;
        emit!(InvestorUpdated {
            mint: entry.mint,
            wallet: entry.wallet,
            approved,
            jurisdiction,
            expires_at,
        });
        Ok(())
    }

    /// Delete an allowlist entry and refund its rent to the attester.
    /// Attester only.
    pub fn remove_investor(ctx: Context<RemoveInvestor>) -> Result<()> {
        emit!(InvestorRemoved { mint: ctx.accounts.entry.mint, wallet: ctx.accounts.entry.wallet });
        Ok(())
    }

    /// Freeze a token account and place it under legal hold. Issuer only.
    pub fn freeze_account(ctx: Context<IssuerFreeze>) -> Result<()> {
        let hold = &mut ctx.accounts.legal_hold;
        hold.token_account = ctx.accounts.token_account.key();
        hold.bump = ctx.bumps.legal_hold;

        if !ctx.accounts.token_account.is_frozen() {
            let config = &ctx.accounts.config;
            let mint_key = config.mint;
            let seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
            token_interface::freeze_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                FreezeAccount {
                    account: ctx.accounts.token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: config.to_account_info(),
                },
                &[seeds],
            ))?;
        }

        emit!(AccountFrozen {
            mint: ctx.accounts.config.mint,
            token_account: hold.token_account,
        });
        Ok(())
    }

    /// Thaw a token account and lift any legal hold on it. Issuer only.
    /// Pass the legal-hold PDA even if none exists; it is closed if present.
    pub fn thaw_account(ctx: Context<IssuerThaw>) -> Result<()> {
        let hold = &ctx.accounts.legal_hold;
        if !hold.data_is_empty() {
            // Close the hold: refund lamports to the issuer and wipe data.
            let issuer = ctx.accounts.issuer.to_account_info();
            let lamports = hold.lamports();
            **issuer.try_borrow_mut_lamports()? += lamports;
            **hold.try_borrow_mut_lamports()? = 0;
            hold.assign(&anchor_lang::system_program::ID);
            hold.resize(0)?;
        }

        if ctx.accounts.token_account.is_frozen() {
            thaw(
                &ctx.accounts.config,
                &ctx.accounts.mint,
                &ctx.accounts.token_account,
                &ctx.accounts.token_program,
            )?;
        }

        emit!(AccountThawed {
            mint: ctx.accounts.config.mint,
            token_account: ctx.accounts.token_account.key(),
        });
        Ok(())
    }
}

fn validate_entry(jurisdiction: [u8; 2], expires_at: i64) -> Result<()> {
    require!(
        jurisdiction.iter().all(|c| c.is_ascii_uppercase()),
        ComplianceError::InvalidJurisdiction
    );
    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, ComplianceError::ExpiryInPast);
    Ok(())
}

fn thaw<'info>(
    config: &Account<'info, Config>,
    mint: &InterfaceAccount<'info, Mint>,
    token_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let mint_key = config.mint;
    let seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    token_interface::thaw_account(CpiContext::new_with_signer(
        token_program.key(),
        ThawAccount {
            account: token_account.to_account_info(),
            mint: mint.to_account_info(),
            authority: config.to_account_info(),
        },
        &[seeds],
    ))
}

// ============================================================
//                          STATE
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub attester: Pubkey,
    pub bump: u8,
}

/// PDA seeds: ["allowlist", mint, wallet]. Read by the transfer hook.
#[account]
#[derive(InitSpace)]
pub struct AllowlistEntry {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub approved: bool,
    /// ISO 3166-1 alpha-2 country code, e.g. b"IN", b"AE".
    pub jurisdiction: [u8; 2],
    /// Unix timestamp (seconds). The entry is invalid at or after this time.
    pub expires_at: i64,
    pub bump: u8,
}

impl AllowlistEntry {
    pub fn is_valid(&self, now: i64) -> bool {
        self.approved && now < self.expires_at
    }
}

/// PDA seeds: ["legal-hold", token_account]. Exists while the issuer has
/// frozen the account; blocks the attester from thawing it.
#[account]
#[derive(InitSpace)]
pub struct LegalHold {
    pub token_account: Pubkey,
    pub bump: u8,
}

// ============================================================
//                         ACCOUNTS
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IssuerOnly<'info> {
    pub issuer: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        has_one = issuer @ ComplianceError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct ApproveInvestor<'info> {
    #[account(mut)]
    pub attester: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = attester @ ComplianceError::Unauthorized,
        has_one = mint,
    )]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: the investor wallet; only its address is used.
    pub wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = attester,
        space = 8 + AllowlistEntry::INIT_SPACE,
        seeds = [ALLOWLIST_SEED, mint.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub entry: Account<'info, AllowlistEntry>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = wallet,
        token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: must be empty (no issuer legal hold); verified in the handler.
    #[account(seeds = [LEGAL_HOLD_SEED, token_account.key().as_ref()], bump)]
    pub legal_hold: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateInvestor<'info> {
    pub attester: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED, entry.mint.as_ref()],
        bump = config.bump,
        has_one = attester @ ComplianceError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [ALLOWLIST_SEED, entry.mint.as_ref(), entry.wallet.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Account<'info, AllowlistEntry>,
}

#[derive(Accounts)]
pub struct RemoveInvestor<'info> {
    #[account(mut)]
    pub attester: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED, entry.mint.as_ref()],
        bump = config.bump,
        has_one = attester @ ComplianceError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = attester,
        seeds = [ALLOWLIST_SEED, entry.mint.as_ref(), entry.wallet.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Account<'info, AllowlistEntry>,
}

#[derive(Accounts)]
pub struct IssuerFreeze<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = issuer @ ComplianceError::Unauthorized,
        has_one = mint,
    )]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = issuer,
        space = 8 + LegalHold::INIT_SPACE,
        seeds = [LEGAL_HOLD_SEED, token_account.key().as_ref()],
        bump,
    )]
    pub legal_hold: Account<'info, LegalHold>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IssuerThaw<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = issuer @ ComplianceError::Unauthorized,
        has_one = mint,
    )]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: legal-hold PDA; closed by the handler if it exists. Ownership
    /// is checked so only a hold created by this program can be closed.
    #[account(
        mut,
        seeds = [LEGAL_HOLD_SEED, token_account.key().as_ref()],
        bump,
        constraint = legal_hold.data_is_empty() || legal_hold.owner == &crate::ID
            @ ComplianceError::Unauthorized,
    )]
    pub legal_hold: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ============================================================
//                      EVENTS & ERRORS
// ============================================================

#[event]
pub struct ConfigInitialized {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub attester: Pubkey,
}

#[event]
pub struct AttesterChanged {
    pub mint: Pubkey,
    pub old_attester: Pubkey,
    pub new_attester: Pubkey,
}

#[event]
pub struct InvestorApproved {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub jurisdiction: [u8; 2],
    pub expires_at: i64,
}

#[event]
pub struct InvestorUpdated {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub approved: bool,
    pub jurisdiction: [u8; 2],
    pub expires_at: i64,
}

#[event]
pub struct InvestorRemoved {
    pub mint: Pubkey,
    pub wallet: Pubkey,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub token_account: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub token_account: Pubkey,
}

#[error_code]
pub enum ComplianceError {
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Signer is not the mint authority")]
    NotMintAuthority,
    #[msg("Mint freeze authority must be the compliance config PDA")]
    FreezeAuthorityNotConfig,
    #[msg("Jurisdiction must be two uppercase ASCII letters")]
    InvalidJurisdiction,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Token account is under an issuer legal hold")]
    UnderLegalHold,
}
