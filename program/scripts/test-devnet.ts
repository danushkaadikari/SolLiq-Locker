import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";

// Initialize connection to devnet
const connection = new Connection("https://api.devnet.solana.com");

async function main() {
    // Use the default provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // Load the program IDL
    const idl = await Program.fetchIdl(
        new PublicKey("6ngbsz3sajGyNsN7QmbRCzuy9XbD8T79MF52oo3u3Gmo"),
        provider
    );

    if (!idl) {
        throw new Error("IDL not found");
    }

    // Create the program interface
    const program = new Program(idl, 
        new PublicKey("6ngbsz3sajGyNsN7QmbRCzuy9XbD8T79MF52oo3u3Gmo"),
        provider
    );

    // Create a new token mint
    const mintKeypair = Keypair.generate();
    const wallet = (provider.wallet as any).payer as Keypair;

    console.log("Creating test token mint...");
    const mint = await createMint(
        connection,
        wallet,
        wallet.publicKey,
        null,
        9,
        mintKeypair
    );

    console.log("Test token mint created:", mint.toBase58());

    // Create token account
    console.log("Creating token account...");
    const tokenAccount = await createAccount(
        connection,
        wallet,
        mint,
        wallet.publicKey
    );

    console.log("Token account created:", tokenAccount.toBase58());

    // Mint some tokens
    console.log("Minting tokens...");
    await mintTo(
        connection,
        wallet,
        mint,
        tokenAccount,
        wallet,
        1000000000 // 1 token with 9 decimals
    );

    console.log("Tokens minted successfully");

    // Create a mock Raydium pool
    const mockPool = Keypair.generate();
    
    console.log("Creating mock Raydium pool...");
    const createPoolTx = await connection.sendTransaction(
        new anchor.web3.Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: wallet.publicKey,
                newAccountPubkey: mockPool.publicKey,
                space: 1024,
                lamports: await connection.getMinimumBalanceForRentExemption(1024),
                programId: SystemProgram.programId,
            })
        ),
        [wallet, mockPool]
    );

    console.log("Mock pool created:", mockPool.publicKey.toBase58());
    console.log("Transaction signature:", createPoolTx);

    // Initialize a locker
    console.log("Initializing locker...");
    const [lockerAddress] = await PublicKey.findProgramAddress(
        [
            Buffer.from("locker"),
            wallet.publicKey.toBuffer(),
            mint.toBuffer(),
        ],
        program.programId
    );

    try {
        const tx = await program.methods
            .initializeLocker()
            .accounts({
                locker: lockerAddress,
                tokenMint: mint,
                owner: wallet.publicKey,
                raydiumPool: mockPool.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Locker initialized successfully!");
        console.log("Transaction signature:", tx);
    } catch (error) {
        console.error("Error initializing locker:", error);
    }
}

main().catch(console.error);
