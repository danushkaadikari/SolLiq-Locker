'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { motion } from "framer-motion"

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

export default function Home() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [lpTokenMint, setLpTokenMint] = useState('')
  const [amount, setAmount] = useState('')
  const [duration, setDuration] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLockTokens = async () => {
    if (!publicKey) return
    setLoading(true)
    try {
      // Implement token locking logic here
      console.log('Locking tokens:', { lpTokenMint, amount, duration })
    } catch (error) {
      console.error('Error locking tokens:', error)
    }
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-b from-gray-900 to-gray-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">SolLiq Locker</h1>
          <WalletMultiButton />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-8 bg-gray-800 p-6 rounded-lg shadow-xl"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="lpTokenMint" className="text-white">LP Token Mint Address</Label>
              <Input
                id="lpTokenMint"
                placeholder="e.g., 7qbRF5YsyGFPYwZxpo8vYYZysx3RzNkh7h7HeJtxtn4j"
                value={lpTokenMint}
                onChange={(e) => setLpTokenMint(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
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
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>
          </div>

          <Button
            onClick={handleLockTokens}
            disabled={!publicKey || loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? 'Locking Tokens...' : 'Lock Tokens'}
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-gray-800 p-6 rounded-lg shadow-xl"
        >
          <h2 className="text-xl font-semibold text-white mb-4">Your Lock Positions</h2>
          <div className="text-gray-400">
            No lock positions found
          </div>
        </motion.div>
      </motion.div>
    </main>
  )
}
