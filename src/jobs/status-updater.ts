import { storeRateInHistory } from "../services/rates";
import { calculateMarketStats } from "../services/market-stats";

let rateInterval: Timer | null = null;
let statsInterval: Timer | null = null;

/**
 * Start background jobs for updating status data
 * Returns cleanup function to stop the jobs
 */
export async function startStatusUpdater(): Promise<() => void> {
  console.log("Starting status updater background jobs...");

  // Load initial data immediately
  console.log("Loading initial status data...");
  await storeRateInHistory();
  await calculateMarketStats();

  // Store BSV/USD rate in history every 60 seconds (for 24h change tracking)
  rateInterval = setInterval(
    async () => {
      try {
        await storeRateInHistory();
      } catch (e) {
        console.error("Error in rate history job:", e);
      }
    },
    60 * 1000,
  );

  // Update market stats every 5 minutes
  statsInterval = setInterval(
    async () => {
      try {
        await calculateMarketStats();
      } catch (e) {
        console.error("Error in stats update job:", e);
      }
    },
    5 * 60 * 1000,
  );

  // Return cleanup function
  return () => {
    if (rateInterval) {
      clearInterval(rateInterval);
      rateInterval = null;
    }
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    console.log("Status updater background jobs stopped");
  };
}
