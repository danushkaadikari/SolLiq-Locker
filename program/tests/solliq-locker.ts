import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolliqLocker } from "../target/types/solliq_locker";
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";

describe("solliq-locker", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolliqLocker as Program<SolliqLocker>;
  const wallet = (provider.wallet as any).payer as Keypair;

  let mockLpTokenMint: PublicKey;
  let mockRaydiumPool: Keypair;
  let userTokenAccount: PublicKey;

  before(async () => {
    // Create mock LP token mint
    mockLpTokenMint = await createMint(
      provider.connection,
      wallet,
      wallet.publicKey,
      null,
      9
    );

    // Create user token account
    userTokenAccount = await createAccount(
      provider.connection,
      wallet,
      mockLpTokenMint,
      wallet.publicKey
    );

    // Mint some tokens to user
    await mintTo(
      provider.connection,
      wallet,
      mockLpTokenMint,
      userTokenAccount,
      wallet,
      1000000000 // 1 token with 9 decimals
    );

    // Create mock Raydium pool
    mockRaydiumPool = Keypair.generate();
    const createPoolIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mockRaydiumPool.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(200),
      space: 200,
      programId: new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")
    });

    const tx = new anchor.web3.Transaction().add(createPoolIx);
    await provider.sendAndConfirm(tx, [mockRaydiumPool]);
  });

  it("Initializes a locker", async () => {
    const uniqueSeed = Keypair.generate().publicKey;
    const amount = new anchor.BN(100000000); // 0.1 token
    const duration = new anchor.BN(7 * 24 * 60 * 60); // 7 days in seconds

    const [lockerPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from("locker"),
        wallet.publicKey.toBuffer(),
        mockLpTokenMint.toBuffer(),
        uniqueSeed.toBuffer(),
      ],
      program.programId
    );

    const [lockerTokenAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("token_account"), lockerPda.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeLocker(duration, amount)
      .accounts({
        locker: lockerPda,
        owner: wallet.publicKey,
        tokenMint: mockLpTokenMint,
        ownerTokenAccount: userTokenAccount,
        lockerTokenAccount,
        raydiumPool: mockRaydiumPool.publicKey,
        uniqueSeed: uniqueSeed,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const lockerAccount = await program.account.locker.fetch(lockerPda);
    assert.ok(lockerAccount.owner.equals(wallet.publicKey));
    assert.ok(lockerAccount.tokenMint.equals(mockLpTokenMint));
    assert.ok(lockerAccount.amount.eq(amount));
    assert.ok(!lockerAccount.unlocked);
  });

  it("Claims fees from a locker", async () => {
    // Get the first locker for the wallet
    const lockers = await program.account.locker.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: wallet.publicKey.toBase58(),
        },
      },
    ]);

    const locker = lockers[0];
    assert.ok(locker, "No locker found");

    const [lockerTokenAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("token_account"), locker.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .claimFees()
      .accounts({
        locker: locker.publicKey,
        owner: wallet.publicKey,
        tokenMint: mockLpTokenMint,
        ownerTokenAccount: userTokenAccount,
        lockerTokenAccount,
        raydiumPool: mockRaydiumPool.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const updatedLocker = await program.account.locker.fetch(locker.publicKey);
    assert.ok(updatedLocker.lastFeeClaim.gt(locker.account.lastFeeClaim));
  });
});
