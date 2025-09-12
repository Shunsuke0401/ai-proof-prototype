'use client';

/**
 * Wallet connection component using RainbowKit
 */

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export default function WalletBox() {
  const { address, isConnected } = useAccount();

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Wallet Connection</h2>
      
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {isConnected && address ? (
            <div className="text-sm text-gray-600">
              <p className="font-medium">Connected Address:</p>
              <p className="font-mono text-xs break-all">{address}</p>
            </div>
          ) : (
            <p className="text-gray-500">Connect your wallet to sign summaries</p>
          )}
        </div>
        
        <div className="ml-4">
          <ConnectButton />
        </div>
      </div>
      
      {isConnected && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
            <span className="text-sm text-green-700 font-medium">Wallet Connected</span>
          </div>
        </div>
      )}
    </div>
  );
}