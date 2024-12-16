use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

mod raydium;
use raydium::{RaydiumPool, get_pool_fees, AmmInfo};

declare_id!("6ngbsz3sajGyNsN7QmbRCzuy9XbD8T79MF52oo3u3Gmo");

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

        // Verify the Raydium pool account
        require!(
            ctx.accounts.raydium_pool.owner == &RaydiumPool::id(),
            ErrorCode::InvalidPoolAccount
        );

        locker.owner = ctx.accounts.owner.key();
        locker.token_mint = ctx.accounts.token_mint.key();
        locker.amount = amount;
        locker.lock_start = clock.unix_timestamp;
        locker.lock_end = clock.unix_timestamp + lock_duration;
        locker.unlocked = false;
        locker.accumulated_fees = 0;
        locker.last_fee_claim = clock.unix_timestamp;
        locker.raydium_pool = ctx.accounts.raydium_pool.key();
        
        // Parse the Raydium pool data to get total liquidity
        let amm: AmmInfo = AmmInfo::try_from_slice(&ctx.accounts.raydium_pool.data.borrow())?;
        locker.total_liquidity = amm.pool_total_deposit_coin;

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

        emit!(LockerInitialized {
            owner: ctx.accounts.owner.key(),
            token_mint: ctx.accounts.token_mint.key(),
            amount,
            lock_end: locker.lock_end,
            raydium_pool: ctx.accounts.raydium_pool.key(),
        });

        Ok(())
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        let locker = &mut ctx.accounts.locker;
        let clock = Clock::get()?;

        require!(!locker.unlocked, ErrorCode::LockerUnlocked);
        require!(
            ctx.accounts.raydium_pool.key() == locker.raydium_pool,
            ErrorCode::InvalidPoolAccount
        );
        
        // Calculate fees from Raydium pool
        let fees = get_pool_fees(
            &ctx.accounts.raydium_pool,
            locker.last_fee_claim,
            clock.unix_timestamp,
            locker.amount,
            locker.total_liquidity,
        )?;

        locker.accumulated_fees += fees;
        locker.last_fee_claim = clock.unix_timestamp;

        // Transfer fees to owner
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.locker.to_account_info(),
            },
        );

        token::transfer(transfer_ctx, fees)?;

        emit!(FeesClaimed {
            owner: ctx.accounts.owner.key(),
            amount: fees,
            timestamp: clock.unix_timestamp,
            raydium_pool: ctx.accounts.raydium_pool.key(),
        });

        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()> {
        let clock = Clock::get()?;
        
        require!(!ctx.accounts.locker.unlocked, ErrorCode::LockerUnlocked);
        require!(clock.unix_timestamp >= ctx.accounts.locker.lock_end, ErrorCode::LockNotExpired);

        let amount = ctx.accounts.locker.amount;

        // Transfer tokens back to owner
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.locker_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.locker.to_account_info(),
            },
        );

        token::transfer(transfer_ctx, amount)?;
        
        // Mark as unlocked
        let locker = &mut ctx.accounts.locker;
        locker.unlocked = true;

        emit!(TokensUnlocked {
            owner: ctx.accounts.owner.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(lock_duration: i64, amount: u64)]
pub struct InitializeLocker<'info> {
    #[account(
        init,
        payer = owner,
        space = Locker::LEN,
        seeds = [
            b"locker",
            owner.key().as_ref(),
            token_mint.key().as_ref(),
            unique_seed.key().as_ref(),
        ],
        bump
    )]
    pub locker: Account<'info, Locker>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_mint: Account<'info, token::Mint>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == token_mint.key()
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = token_mint,
        associated_token::authority = locker
    )]
    pub locker_token_account: Account<'info, TokenAccount>,

    /// CHECK: Validated in program logic
    pub raydium_pool: AccountInfo<'info>,

    /// CHECK: This is used as a unique seed for PDA derivation
    pub unique_seed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            b"locker",
            owner.key().as_ref(),
            locker.token_mint.as_ref(),
            unique_seed.key().as_ref(),
        ],
        bump
    )]
    pub locker: Account<'info, Locker>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == locker.token_mint
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = locker.token_mint,
        associated_token::authority = locker
    )]
    pub fee_token_account: Account<'info, TokenAccount>,

    /// CHECK: Validated in program logic
    pub raydium_pool: AccountInfo<'info>,

    /// CHECK: Used as seed for PDA derivation
    pub unique_seed: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            b"locker",
            owner.key().as_ref(),
            locker.token_mint.as_ref(),
            unique_seed.key().as_ref(),
        ],
        bump
    )]
    pub locker: Account<'info, Locker>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == locker.token_mint
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = locker.token_mint,
        associated_token::authority = locker
    )]
    pub locker_token_account: Account<'info, TokenAccount>,

    /// CHECK: Used as seed for PDA derivation
    pub unique_seed: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Locker {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub lock_start: i64,
    pub lock_end: i64,
    pub unlocked: bool,
    pub accumulated_fees: u64,
    pub last_fee_claim: i64,
    pub raydium_pool: Pubkey,
    pub total_liquidity: u64,
}

impl Locker {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // token_mint
        8 + // amount
        8 + // lock_start
        8 + // lock_end
        1 + // unlocked
        8 + // accumulated_fees
        8 + // last_fee_claim
        32 + // raydium_pool
        8; // total_liquidity
}

#[event]
pub struct LockerInitialized {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub lock_end: i64,
    pub raydium_pool: Pubkey,
}

#[event]
pub struct FeesClaimed {
    pub owner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub raydium_pool: Pubkey,
}

#[event]
pub struct TokensUnlocked {
    pub owner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Lock duration has not expired")]
    LockNotExpired,
    #[msg("Locker is unlocked")]
    LockerUnlocked,
    #[msg("Invalid Raydium pool account")]
    InvalidPoolAccount,
    #[msg("Error in fee calculation")]
    CalculationError,
}
