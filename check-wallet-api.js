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

const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CLOB_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

async function checkWallet() {
  try {
    const privateKey = process.env.PM_PRIVATE_KEY || envVars.PM_PRIVATE_KEY;
    
    if (!privateKey) {
      console.log('❌ PM_PRIVATE_KEY not found');
      return;
    }

    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    
    console.log(`\n🔑 Wallet Address: ${address}\n`);

    // Use Polygonscan API (no auth needed for basic calls)
    const baseUrl = 'https://api.polygonscan.com/api';
    
    // Check MATIC balance
    const maticRes = await fetch(`${baseUrl}?module=account&action=balance&address=${address}&tag=latest`);
    const maticData = await maticRes.json();
    if (maticData.status === '1') {
      const maticBalance = ethers.formatEther(maticData.result);
      console.log(`MATIC Balance: ${maticBalance} MATIC`);
    } else {
      console.log('⚠️  Could not fetch MATIC balance');
    }

    // Check USDC balance
    const usdcRes = await fetch(`${baseUrl}?module=account&action=tokenbalance&contractaddress=${USDC_ADDRESS}&address=${address}&tag=latest`);
    const usdcData = await usdcRes.json();
    if (usdcData.status === '1') {
      const usdcBalance = ethers.formatUnits(usdcData.result, 6); // USDC has 6 decimals
      console.log(`USDC Balance: $${usdcBalance} USDC\n`);

      const usdcNum = parseFloat(usdcBalance);

      if (usdcNum < 2) {
        console.log('❌ CRITICAL: USDC balance < $2 (min trade size)');
        console.log('   Action: Fund wallet with USDC on Polygon');
        console.log(`   Wallet: ${address}`);
        console.log('   Network: Polygon (MATIC)');
        console.log('   Token: USDC (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)');
        console.log('   Recommended: Bridge $50-100 for testing\n');
      } else if (usdcNum < 10) {
        console.log('⚠️  WARNING: USDC balance < $10 (limited trading capacity)');
        console.log('   Current: $' + usdcBalance);
        console.log('   Recommend: Fund with $50-100 for sustained testing\n');
      } else {
        console.log('✅ USDC balance sufficient ($' + usdcBalance + ')\n');
      }

      // Note: Checking allowance requires RPC call, so we'll skip for now
      console.log('⚠️  Note: USDC allowance check requires wallet connection');
      console.log('   If trades fail with "not enough allowance", approve USDC for CLOB:');
      console.log(`   CLOB Contract: ${CLOB_ADDRESS}`);
      console.log('   Use Polymarket UI or approve manually via contract interaction\n');
      
    } else {
      console.log('⚠️  Could not fetch USDC balance');
      console.log('   Error:', usdcData.message);
    }

    // Link to Polygonscan for manual check
    console.log(`🔗 View on Polygonscan: https://polygonscan.com/address/${address}`);
    console.log(`🔗 USDC holdings: https://polygonscan.com/token/${USDC_ADDRESS}?a=${address}\n`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkWallet();
