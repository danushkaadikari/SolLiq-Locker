'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { motion } from "framer-motion"
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor"
import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { IDL } from '../../program/target/types/solliq_locker'
import { toast } from 'react-hot-toast'
import { BN } from '@coral-xyz/anchor'
import { useAnchorWallet } from '@solana/wallet-adapter-react'

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

// Program ID from your deployed contract
const PROGRAM_ID = new PublicKey('BmpeD1Hmk1HraMJrxji4fjQNCYHqBGNi2EksPTFt9izC')

interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
}

interface Locker {
  publicKey: PublicKey;
  amount: number;
  lockEnd: number;
  accumulatedFees: number;
}

export default function Home() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [loading, setLoading] = useState<boolean>(false)
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([])
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [lockDuration, setLockDuration] = useState<string>('30')
  const [lockers, setLockers] = useState<Locker[]>([])
  const [totalLocked, setTotalLocked] = useState<number>(0)
  const [availableFees, setAvailableFees] = useState<number>(0)

  useEffect(() => {
    if (publicKey) {
      fetchTokenBalances()
      fetchLockers()
    }
  }, [publicKey])

  const getProgram = () => {
    if (!publicKey) return null
    const provider = new AnchorProvider(connection, wallet as any, {})
    return new Program(IDL, PROGRAM_ID, provider)
  }

  const fetchTokenBalances = async () => {
    if (!publicKey) return

    try {
      setLoading(true)
      const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      })

      const balances = accounts.value.map(account => ({
        mint: account.account.data.parsed.info.mint,
        amount: account.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals,
      }))

      setTokenBalances(balances)
    } catch (error) {
      console.error('Error fetching token balances:', error)
      toast.error('Failed to fetch token balances')
    } finally {
      setLoading(false)
    }
  }

  const fetchLockers = async () => {
    if (!publicKey) return

    try {
      setLoading(true)
      const program = getProgram()
      if (!program) return

      const lockers = await program.account.locker.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: publicKey.toBase58()
          }
        }
      ])

      const lockersData = lockers.map(locker => ({
        publicKey: locker.publicKey,
        amount: locker.account.amount,
        lockEnd: locker.account.lockEnd,
        accumulatedFees: locker.account.accumulatedFees,
      }))

      setLockers(lockersData)
      setTotalLocked(lockersData.reduce((acc, locker) => acc + locker.amount, 0))
      setAvailableFees(lockersData.reduce((acc, locker) => acc + locker.accumulatedFees, 0))
    } catch (error) {
      console.error('Error fetching lockers:', error)
      toast.error('Failed to fetch lockers')
    } finally {
      setLoading(false)
    }
  }

  const handleLock = async () => {
    if (!publicKey || !wallet || !selectedToken || !amount) {
      toast.error('Please connect wallet and fill all fields')
      return
    }

    try {
      setLoading(true)
      const token = tokenBalances.find(t => t.mint === selectedToken)
      if (!token) {
        toast.error('Selected token not found')
        return
      }

      // Check balance
      if (parseFloat(amount) > token.amount) {
        toast.error('Insufficient balance')
        return
      }

      // Convert amount to raw value based on decimals
      const rawAmount = new BN(parseFloat(amount) * Math.pow(10, token.decimals))
      const lockDurationSeconds = parseInt(lockDuration) * 24 * 60 * 60

      // Call program to lock tokens
      const program = getProgram()
      if (!program) return

      const tx = await program.methods
        .initializeLocker(new BN(lockDurationSeconds), rawAmount)
        .accounts({
          owner: publicKey,
          tokenMint: new PublicKey(selectedToken),
          // ... other required accounts
        })
        .rpc()

      toast.success('Tokens locked successfully!')
      fetchLockers()
      fetchTokenBalances()
    } catch (error) {
      console.error('Error locking tokens:', error)
      toast.error('Failed to lock tokens')
    } finally {
      setLoading(false)
    }
  }

  const handleClaimFees = async (locker: Locker) => {
    if (!publicKey || !wallet) return

    try {
      setLoading(true)
      const program = getProgram()
      if (!program) return

      const tx = await program.methods
        .claimFees()
        .accounts({
          locker: locker.publicKey,
          owner: publicKey,
          // ... other required accounts
        })
        .rpc()

      toast.success('Fees claimed successfully!')
      fetchLockers()
    } catch (error) {
      console.error('Error claiming fees:', error)
      toast.error('Failed to claim fees')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-b from-gray-900 to-gray-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">SolLiq Locker</h1>
          <WalletMultiButton />
        </div>

        {publicKey && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8"
          >
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
              <h2 className="text-xl font-semibold text-white mb-4">Statistics</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-400">Total Locked Value</p>
                  <p className="text-2xl font-bold text-white">{totalLocked.toFixed(2)} SOL</p>
                </div>
                <div>
                  <p className="text-gray-400">Available Fees</p>
                  <p className="text-2xl font-bold text-white">{availableFees.toFixed(4)} SOL</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
              <h2 className="text-xl font-semibold text-white mb-4">Your Lockers</h2>
              <div className="space-y-4">
                {lockers.map((locker, index) => (
                  <div key={index} className="p-4 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-400">LP Token: {locker.publicKey.toString()}</p>
                    <p className="text-white">Amount: {locker.amount} LP</p>
                    <p className="text-white">Unlock Date: {new Date(locker.lockEnd * 1000).toLocaleDateString()}</p>
                    <p className="text-white mb-2">Available Fees: {locker.accumulatedFees} LP</p>
                    <Button
                      onClick={() => handleClaimFees(locker)}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Claim Fees
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800 p-6 rounded-lg shadow-xl"
        >
          <h2 className="text-2xl font-bold text-white mb-4">Lock New LP Tokens</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="lpTokenMint" className="text-white">LP Token Mint Address</Label>
              <select
                id="lpTokenMint"
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="w-full p-2 rounded bg-gray-700"
              >
                <option value="">Select Token</option>
                {tokenBalances.map((token) => (
                  <option key={token.mint} value={token.mint}>
                    {token.mint.slice(0, 4)}...{token.mint.slice(-4)} ({token.amount})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-white">Amount</Label>
              <Input
                id="amount"
                placeholder="e.g., 1.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration" className="text-white">Lock Duration (days)</Label>
              <Input
                id="duration"
                placeholder="e.g., 90"
                value={lockDuration}
                onChange={(e) => setLockDuration(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>
          </div>

          <Button
            onClick={handleLock}
            disabled={!publicKey || loading}
            className="w-full mt-6 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? 'Locking Tokens...' : 'Lock Tokens'}
          </Button>
        </motion.div>
      </motion.div>
    </main>
  )
}
