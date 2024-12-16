use anchor_lang::prelude::*;

#[derive(Clone)]
pub struct RaydiumPool;

impl Id for RaydiumPool {
    fn id() -> Pubkey {
        // Raydium AMM Program ID (devnet)
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
            .parse::<Pubkey>()
            .unwrap()
    }
}

#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
pub struct AmmInfo {
    pub status: u64,
    pub nonce: u64,
    pub order_num: u64,
    pub depth: u64,
    pub coin_decimals: u64,
    pub pc_decimals: u64,
    pub state: u64,
    pub reset_flag: u64,
    pub min_size: u64,
    pub vol_max_cut_ratio: u64,
    pub amount_wave_ratio: u64,
    pub coin_lot_size: u64,
    pub pc_lot_size: u64,
    pub min_price_multiplier: u64,
    pub max_price_multiplier: u64,
    pub system_decimal_value: u64,
    pub min_separate_numerator: u64,
    pub min_separate_denominator: u64,
    pub trade_fee_numerator: u64,
    pub trade_fee_denominator: u64,
    pub pnl_numerator: u64,
    pub pnl_denominator: u64,
    pub swap_fee_numerator: u64,
    pub swap_fee_denominator: u64,
    pub need_take_pnl_coin: u64,
    pub need_take_pnl_pc: u64,
    pub total_pnl_pc: u64,
    pub total_pnl_coin: u64,
    pub pool_total_deposit_pc: u64,
    pub pool_total_deposit_coin: u64,
    pub swap_coin_in_amount: u64,
    pub swap_pc_out_amount: u64,
    pub swap_coin_to_pc_fee: u64,
    pub swap_pc_in_amount: u64,
    pub swap_coin_out_amount: u64,
    pub swap_pc_to_coin_fee: u64,
}

pub fn get_pool_fees(
    pool_info: &AccountInfo,
    last_claim: i64,
    current_time: i64,
    locked_amount: u64,
    total_liquidity: u64,
) -> Result<u64> {
    let amm: AmmInfo = AmmInfo::try_from_slice(&pool_info.data.borrow())?;

    // Calculate time period in seconds
    let time_period = (current_time - last_claim) as u64;

    // Calculate fees based on pool's trading activity
    let total_fees = amm.swap_coin_to_pc_fee
        .checked_add(amm.swap_pc_to_coin_fee)
        .ok_or(ErrorCode::CalculationError)?;

    // Calculate user's share of fees based on their locked amount vs total liquidity
    let user_share = (total_fees as u128)
        .checked_mul(locked_amount as u128)
        .ok_or(ErrorCode::CalculationError)?
        .checked_div(total_liquidity as u128)
        .ok_or(ErrorCode::CalculationError)?;

    // Adjust fees based on time period (e.g., daily rate * number of days)
    let adjusted_fees = user_share
        .checked_mul(time_period as u128)
        .ok_or(ErrorCode::CalculationError)?
        .checked_div(86400) // Daily rate (24 * 60 * 60 seconds)
        .ok_or(ErrorCode::CalculationError)?;

    Ok(adjusted_fees as u64)
}

#[error_code]
pub enum ErrorCode {
    #[msg("Error in fee calculation")]
    CalculationError,
}
