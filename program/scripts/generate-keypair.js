const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const keypair = Keypair.generate();
const keypairFile = path.join(__dirname, '../target/deploy/solliq_locker-keypair.json');

// Ensure the directory exists
const dir = path.dirname(keypairFile);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Write the keypair to file
fs.writeFileSync(keypairFile, `[${Buffer.from(keypair.secretKey).toString()}]`);
console.log('Program ID:', keypair.publicKey.toBase58());
