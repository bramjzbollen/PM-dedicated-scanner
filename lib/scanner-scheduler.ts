/**
 * Scanner Data Scheduler
 * 
 * Automatically updates scanner data every 2 minutes by running the standalone script.
 * This ensures dashboard always has fresh signals without manual intervention.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SCANNER_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes
const SCRIPT_TIMEOUT = 5 * 60 * 1000; // 5 minutes max

let isRunning = false;
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Run the scanner update script
 */
async function updateScannerData(): Promise<void> {
  if (isRunning) {
    console.log('[Scanner] Update already in progress, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  
  try {
    console.log('[Scanner] Starting data update...');
    
    // Run the standalone script with environment variables
    const { stdout, stderr } = await execAsync('npm run update-scanners', {
      cwd: process.cwd(),
      timeout: SCRIPT_TIMEOUT,
      env: {
        ...process.env,
        BYBIT_API_KEY: process.env.BYBIT_API_KEY,
        BYBIT_API_SECRET: process.env.BYBIT_API_SECRET,
      },
    });
    
    const duration = Date.now() - startTime;
    
    if (stderr && !stderr.includes('DeprecationWarning')) {
      console.error('[Scanner] Script stderr:', stderr);
    }
    
    console.log(`[Scanner] Update completed in ${(duration / 1000).toFixed(1)}s`);
    
    // Log summary from script output
    const lines = stdout.split('\n').filter(l => l.trim());
    const summaryLines = lines.slice(-5); // Last 5 lines usually contain summary
    summaryLines.forEach(line => console.log(`[Scanner] ${line}`));
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Scanner] Update failed after ${(duration / 1000).toFixed(1)}s:`, error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the automated scanner scheduler
 */
export function startScannerScheduler(): void {
  if (schedulerInterval) {
    console.log('[Scanner] Scheduler already running');
    return;
  }
  
  console.log(`[Scanner] Starting automated updates (every ${SCANNER_UPDATE_INTERVAL / 60000} minutes)`);
  
  // Run immediately on start
  updateScannerData();
  
  // Then schedule periodic updates
  schedulerInterval = setInterval(() => {
    updateScannerData();
  }, SCANNER_UPDATE_INTERVAL);
  
  console.log('[Scanner] Scheduler started successfully');
}

/**
 * Stop the automated scanner scheduler
 */
export function stopScannerScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scanner] Scheduler stopped');
  }
}

/**
 * Get scheduler status
 */
export function getScannerSchedulerStatus(): { running: boolean; isUpdating: boolean } {
  return {
    running: schedulerInterval !== null,
    isUpdating: isRunning,
  };
}
