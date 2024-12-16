import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('5b8GyssNCU3JBYyfzuBYupy7mHUg9vuNzRPDDGiNxTsm');

export const getLockerAddress = async (
  owner: PublicKey,
  tokenMint: PublicKey
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from('locker'),
      owner.toBuffer(),
      tokenMint.toBuffer(),
    ],
    PROGRAM_ID
  )
}
