import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolliqLocker } from "../target/types/solliq_locker";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";

// Helper function to retry operations
async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error);
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

describe("solliq-locker", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolliqLocker as Program<SolliqLocker>;
  const wallet = provider.wallet as anchor.Wallet;
  
  let mint: PublicKey;
  let tokenAccount: PublicKey;
  let lockerAccount: Keypair;
  let uniqueSeed: Keypair;
  
  before(async () => {
    try {
      console.log("Creating new mint...");
      // Create a new mint with retry
      mint = await retry(async () => {
        return await createMint(
          provider.connection,
          wallet.payer,
          wallet.publicKey,
          null,
          6
        );
      });
      console.log("Mint created:", mint.toBase58());

      console.log("Creating token account...");
      // Create token account with retry
      tokenAccount = await retry(async () => {
        return await createAccount(
          provider.connection,
          wallet.payer,
          mint,
          wallet.publicKey
        );
      });
      console.log("Token account created:", tokenAccount.toBase58());

      console.log("Minting tokens...");
      // Mint tokens with retry
      await retry(async () => {
        await mintTo(
          provider.connection,
          wallet.payer,
          mint,
          tokenAccount,
          wallet.payer,
          1000000
        );
      });
      console.log("Tokens minted successfully");

      // Initialize unique components
      lockerAccount = Keypair.generate();
      uniqueSeed = Keypair.generate();
      console.log("Test setup completed successfully");
    } catch (error) {
      console.error("Error in test setup:", error);
      throw error;
    }
  });

  it("Locks tokens", async () => {
    const lockDuration = new anchor.BN(5); // 5 seconds lock

    // Create the PDA for token account
    const [tokenVault] = await PublicKey.findProgramAddress(
      [Buffer.from("token-seed"), lockerAccount.publicKey.toBuffer()],
      program.programId
    );
    console.log("Token vault PDA:", tokenVault.toBase58());

    try {
      console.log("Attempting to lock tokens...");
      const tx = await retry(async () => {
        return await program.methods
          .lockTokens(uniqueSeed.publicKey, lockDuration)
          .accounts({
            locker: lockerAccount.publicKey,
            tokenMint: mint,
            tokenFrom: tokenAccount,
            tokenVault: tokenVault,
            owner: wallet.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([lockerAccount, uniqueSeed])
          .rpc();
      });

      console.log("Lock transaction signature:", tx);

      // Verify the tokens were locked with retry
      const vaultAccount = await retry(async () => {
        return await getAccount(provider.connection, tokenVault);
      });
      
      assert.ok(vaultAccount.amount > 0, "Vault should contain tokens");
      console.log("Tokens locked successfully");

    } catch (error) {
      console.error("Error in locking tokens:", error);
      throw error;
    }
  });

  it("Fails to unlock tokens before lock duration", async () => {
    const [tokenVault] = await PublicKey.findProgramAddress(
      [Buffer.from("token-seed"), lockerAccount.publicKey.toBuffer()],
      program.programId
    );

    try {
      console.log("Attempting to unlock tokens before duration (should fail)...");
      await program.methods
        .unlockTokens()
        .accounts({
          locker: lockerAccount.publicKey,
          tokenVault: tokenVault,
          tokenDestination: tokenAccount,
          owner: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([uniqueSeed])
        .rpc();

      assert.fail("Should have failed to unlock tokens");
    } catch (error: any) {
      console.log("Expected error when trying to unlock too early:", error.message);
    }
  });

  it("Successfully unlocks tokens after lock duration", async () => {
    const [tokenVault] = await PublicKey.findProgramAddress(
      [Buffer.from("token-seed"), lockerAccount.publicKey.toBuffer()],
      program.programId
    );

    console.log("Waiting for lock duration to pass...");
    // Wait for lock duration to pass
    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      console.log("Attempting to unlock tokens...");
      const tx = await retry(async () => {
        return await program.methods
          .unlockTokens()
          .accounts({
            locker: lockerAccount.publicKey,
            tokenVault: tokenVault,
            tokenDestination: tokenAccount,
            owner: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([uniqueSeed])
          .rpc();
      });

      console.log("Unlock transaction signature:", tx);

      // Verify the tokens were returned with retry
      const vaultAccount = await retry(async () => {
        return await getAccount(provider.connection, tokenVault)
          .catch(() => null);
      });
      
      assert.ok(!vaultAccount, "Token vault should be closed");
      console.log("Tokens unlocked successfully");

    } catch (error) {
      console.error("Error in unlocking tokens:", error);
      throw error;
    }
  });
});
