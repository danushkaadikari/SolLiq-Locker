use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("BmpeD1Hmk1HraMJrxji4fjQNCYHqBGNi2EksPTFt9izC");

#[program]
pub mod solliq_locker {
    use super::*;

    pub fn initialize_locker(
        ctx: Context<InitializeLocker>,
        lock_duration: i64,
        amount: u64,
    ) -> Result<()> {
        let locker = &mut ctx.accounts.locker;
        let clock = Clock::get()?;

        locker.owner = ctx.accounts.owner.key();
        locker.token_mint = ctx.accounts.token_mint.key();
        locker.amount = amount;
        locker.lock_start = clock.unix_timestamp;
        locker.lock_end = clock.unix_timestamp + lock_duration;
        locker.unlocked = false;

        // Transfer tokens to the locker's token account
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.locker_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );

        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()> {
        let locker = &ctx.accounts.locker;
        let clock = Clock::get()?;

        require!(!locker.unlocked, ErrorCode::AlreadyUnlocked);
        require!(
            clock.unix_timestamp >= locker.lock_end,
            ErrorCode::LockNotExpired
        );

        // Transfer tokens back to the owner
        let seeds = &[
            b"locker",
            locker.owner.as_ref(),
            locker.token_mint.as_ref(),
            ctx.accounts.unique_seed.key.as_ref(),
            &[ctx.bumps.locker],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.locker_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.locker.to_account_info(),
            },
            signer,
        );

        token::transfer(transfer_ctx, locker.amount)?;
        ctx.accounts.locker.unlocked = true;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeLocker<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1, // discriminator + owner + token_mint + amount + lock_start + lock_end + unlocked
        seeds = [
            b"locker",
            owner.key().as_ref(),
            token_mint.key().as_ref(),
            unique_seed.key.as_ref(),
        ],
        bump
    )]
    pub locker: Account<'info, Locker>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_mint: Account<'info, token::Mint>,

    /// CHECK: This is used as a unique seed for PDA derivation
    pub unique_seed: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = token_mint,
        associated_token::authority = locker
    )]
    pub locker_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    #[account(
        mut,
        seeds = [
            b"locker",
            locker.owner.as_ref(),
            locker.token_mint.as_ref(),
            unique_seed.key.as_ref(),
        ],
        bump,
        has_one = owner,
    )]
    pub locker: Account<'info, Locker>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: This is used as a unique seed for PDA derivation
    pub unique_seed: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = locker
    )]
    pub locker_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, token::Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Locker {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub lock_start: i64,
    pub lock_end: i64,
    pub unlocked: bool,
}

impl Locker {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // token_mint
        8 + // amount
        8 + // lock_start
        8 + // lock_end
        1; // unlocked
}

#[error_code]
pub enum ErrorCode {
    #[msg("Tokens have already been unlocked")]
    AlreadyUnlocked,
    #[msg("Lock duration has not expired yet")]
    LockNotExpired,
}
