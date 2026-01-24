/**
 * Get blockchain explorer URL for a transaction hash
 * Note: Update this based on your blockchain network
 */
export function getBlockchainExplorerUrl(txHash: string): string {
  // For Hyperledger Fabric, you might use a custom explorer
  // This is a placeholder URL - update with your actual explorer
  return `#blockchain/${txHash}`;
}

/**
 * Truncate a blockchain hash for display
 */
export function truncateHash(hash: string, startLength = 8, endLength = 6): string {
  if (hash.length <= startLength + endLength) {
    return hash;
  }
  return `${hash.substring(0, startLength)}...${hash.substring(hash.length - endLength)}`;
}

/**
 * Validate blockchain hash format
 */
export function isValidBlockchainHash(hash: string): boolean {
  // Basic hex string validation
  return /^0x[a-fA-F0-9]+$/.test(hash) || /^[a-fA-F0-9]{64}$/.test(hash);
}
