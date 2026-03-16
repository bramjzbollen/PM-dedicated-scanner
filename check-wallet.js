import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';

// Parse .env.local manually
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.+)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});
process.env = { ...process.env, ...envVars };

const POLYGON_RPC = 'https://rpc.ankr.com/polygon';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Polygon USDC
const CLOB_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // Polymarket CLOB

const USDC_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function checkWallet() {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, {
      staticNetwork: true,
      polling: false,
      batchStallTime: 1000
    });
    const privateKey = process.env.PM_PRIVATE_KEY;
    
    if (!privateKey) {
      console.log('❌ PM_PRIVATE_KEY not found in .env.local');
      return;
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;
    
    console.log(`\n🔑 Wallet Address: ${address}\n`);

    // Check MATIC balance
    const maticBalance = await provider.getBalance(address);
    const maticFormatted = ethers.formatEther(maticBalance);
    console.log(`MATIC Balance: ${maticFormatted} MATIC`);

    // Check USDC balance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    const usdcBalance = await usdcContract.balanceOf(address);
    const decimals = await usdcContract.decimals();
    const usdcFormatted = ethers.formatUnits(usdcBalance, decimals);
    console.log(`USDC Balance: $${usdcFormatted} USDC`);

    // Check USDC allowance for CLOB
    const allowance = await usdcContract.allowance(address, CLOB_ADDRESS);
    const allowanceFormatted = ethers.formatUnits(allowance, decimals);
    console.log(`USDC Allowance (CLOB): $${allowanceFormatted} USDC\n`);

    // Analysis
    const usdcNum = parseFloat(usdcFormatted);
    const allowanceNum = parseFloat(allowanceFormatted);

    if (usdcNum < 2) {
      console.log('⚠️  CRITICAL: USDC balance < $2 (min trade size)');
      console.log('   Action: Fund wallet with USDC on Polygon');
    } else if (usdcNum < 10) {
      console.log('⚠️  WARNING: USDC balance < $10 (limited trading capacity)');
      console.log('   Recommend: Fund with $50-100 for sustained testing');
    } else {
      console.log('✅ USDC balance sufficient');
    }

    if (allowanceNum < usdcNum) {
      console.log('⚠️  CRITICAL: Allowance < balance');
      console.log('   Action: Approve USDC spending for CLOB contract');
      console.log(`   Command: Approve $${Math.ceil(usdcNum * 2)} USDC`);
    } else {
      console.log('✅ USDC allowance sufficient');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkWallet();
