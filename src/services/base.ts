import { ethers } from 'ethers';
import { AIPP_BASE_PRIVATE_KEY, BASE_RPC_URL, USDC_ADDRESS } from '../config/env';

let _providerInstance: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_providerInstance) {
    _providerInstance = new ethers.JsonRpcProvider(BASE_RPC_URL);
  }
  return _providerInstance;
}

// [CRIT-3 FIX] Create wallet once at module level — not inside the hot payout loop
let _wallet: ethers.Wallet | null = null;

function getWallet(): ethers.Wallet {
  if (!_wallet) {
    if (!AIPP_BASE_PRIVATE_KEY) {
      throw new Error('AIPP_BASE_PRIVATE_KEY is not configured. Cannot execute on-chain operations.');
    }
    _wallet = new ethers.Wallet(AIPP_BASE_PRIVATE_KEY, getProvider());
  }
  return _wallet;
}

export function getGatewayAddress(): string {
  try {
    return getWallet().address;
  } catch (err) {
    console.error('Failed to derive Base Gateway address from private key:', err);
    return '';
  }
}

/**
 * Verifies if a USDC payment txHash is valid and transferred expected USD amount to the AIPP gateway.
 */
export async function verifyUsdcPayment(txHash: string, expectedUsdcAmount: number): Promise<boolean> {
  try {
    const provider = getProvider();
    
    // Get tx and receipt
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      console.warn(`[Base Service] Transaction ${txHash} not found on chain.`);
      return false;
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.warn(`[Base Service] Transaction receipt for ${txHash} not found.`);
      return false;
    }

    if (receipt.status !== 1) {
      console.warn(`[Base Service] Transaction ${txHash} has failed status on chain.`);
      return false;
    }

    // ERC20 Transfer event interface
    const usdcInterface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]);

    const gatewayAddress = getGatewayAddress().toLowerCase();
    const expectedUnits = BigInt(Math.round(expectedUsdcAmount * 1_000_000)); // 6 decimals for USDC

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        try {
          const parsed = usdcInterface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });

          if (parsed && parsed.name === 'Transfer') {
            const to = parsed.args[1];
            const value = parsed.args[2]; // BigInt

            if (to.toLowerCase() === gatewayAddress && value >= expectedUnits) {
              return true;
            }
          }
        } catch (e) {
          // Log parsing failed or was not a Transfer event
        }
      }
    }

    console.warn(`[Base Service] Transaction ${txHash} did not contain a valid Transfer to AIPP Gateway (${gatewayAddress}) for at least ${expectedUsdcAmount} USDC.`);
    return false;
  } catch (err) {
    console.error(`[Base Service] Error verifying USDC payment for hash ${txHash}:`, err);
    return false;
  }
}

/**
 * Sends USDC payout on Base to a merchant.
 * Deducts 1% fee using BigInt arithmetic to avoid rounding errors.
 */
export async function sendUsdcPayout(toAddress: string, amountUsdc: number): Promise<string> {
  // [HIGH-3 FIX] Validate Ethereum address before any on-chain operation
  if (!ethers.isAddress(toAddress)) {
    throw new Error(`Invalid Ethereum address for payout: "${toAddress}"`);
  }
  if (toAddress === ethers.ZeroAddress) {
    throw new Error('Payout to zero address is not allowed');
  }

  const wallet = getWallet(); // [CRIT-3 FIX] Use module-level singleton
  const provider = getProvider();

  const usdcContract = new ethers.Contract(USDC_ADDRESS, [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
  ], wallet);

  // BigInt calculations in USDC base units (6 decimals)
  const totalUnits = BigInt(Math.round(amountUsdc * 1_000_000));
  const commissionUnits = totalUnits / 100n; // Flat 1%
  const forwardedUnits = totalUnits - commissionUnits;

  if (forwardedUnits <= 0n) {
    throw new Error(`Payout amount too small to process: ${amountUsdc} USDC`);
  }

  // 1. Gas fee check — require at least 0.0005 ETH for transfer gas
  const ethBalance = await provider.getBalance(wallet.address);
  if (ethBalance < ethers.parseEther("0.0005")) {
    // [MED-5 FIX] Throw instead of only warning — gas failure will crash the TX anyway
    throw new Error(`Insufficient ETH gas on Gateway wallet (${wallet.address}): ${ethers.formatEther(ethBalance)} ETH. Top up before retrying.`);
  }

  // 2. USDC balance check
  const usdcBalance = await usdcContract.balanceOf(wallet.address);
  if (usdcBalance < forwardedUnits) {
    throw new Error(`Insufficient USDC balance on Gateway wallet. Has ${ethers.formatUnits(usdcBalance, 6)} USDC, needs ${ethers.formatUnits(forwardedUnits, 6)} USDC`);
  }

  console.log(`[Base Service] Initiating payout: forwarding ${ethers.formatUnits(forwardedUnits, 6)} USDC to ${toAddress} (AIPP fee: ${ethers.formatUnits(commissionUnits, 6)} USDC)`);

  const tx = await usdcContract.transfer(toAddress, forwardedUnits);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(`USDC payout transaction failed on-chain. Hash: ${tx.hash}`);
  }

  console.log(`[Base Service] Payout transaction successful: ${tx.hash}`);
  return tx.hash;
}
