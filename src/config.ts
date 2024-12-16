import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('6ngbsz3sajGyNsN7QmbRCzuy9XbD8T79MF52oo3u3Gmo');

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
