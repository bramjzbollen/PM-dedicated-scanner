'use client';

import { useEffect, useState } from 'react';

/**
 * Scanner Scheduler Initializer
 * 
 * Automatically starts the scanner data scheduler on mount.
 * This ensures scanner data is always fresh without manual intervention.
 */
export function ScannerSchedulerInit() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initScheduler() {
      try {
        const res = await fetch('/api/scanner-scheduler');
        const data = await res.json();
        
        if (data.status === 'ok') {
          console.log('✅ Scanner scheduler initialized:', data.message);
          setInitialized(true);
        } else {
          console.error('❌ Scanner scheduler failed:', data);
          setError(data.error || 'Unknown error');
        }
      } catch (err) {
        console.error('❌ Failed to initialize scanner scheduler:', err);
        setError(err instanceof Error ? err.message : 'Network error');
      }
    }

    // Initialize on mount
    initScheduler();
  }, []);

  // This component doesn't render anything
  return null;
}
