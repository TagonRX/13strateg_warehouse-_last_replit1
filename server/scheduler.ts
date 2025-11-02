import cron, { ScheduledTask } from 'node-cron';
import { storage } from './storage';
import https from 'https';
import http from 'http';
import { InsertInventoryItem } from '@shared/schema';
import { parse } from 'fast-csv';

let cronTask: ScheduledTask | null = null;
let isRunning = false;

export async function startScheduler() {
  console.log('[SCHEDULER] Starting scheduler...');
  
  // Get settings from database
  const settings = await storage.getSchedulerSettings();
  
  if (!settings) {
    console.log('[SCHEDULER] No settings found, scheduler not started');
    return;
  }
  
  if (!settings.enabled) {
    console.log('[SCHEDULER] Scheduler is disabled');
    return;
  }
  
  console.log(`[SCHEDULER] Scheduling with cron: ${settings.cronExpression}`);
  
  // Stop existing task if any
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  
  // Validate cron expression
  if (!cron.validate(settings.cronExpression)) {
    console.error('[SCHEDULER] Invalid cron expression:', settings.cronExpression);
    return;
  }
  
  // Create new cron task
  cronTask = cron.schedule(settings.cronExpression, async () => {
    await runScheduledImport();
  });
  
  console.log('[SCHEDULER] Scheduler started successfully');
}

export async function stopScheduler() {
  console.log('[SCHEDULER] Stopping scheduler...');
  
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  
  console.log('[SCHEDULER] Scheduler stopped');
}

export async function restartScheduler() {
  await stopScheduler();
  await startScheduler();
}

export async function runScheduledImport(): Promise<{ success: boolean; message: string; details?: any }> {
  if (isRunning) {
    console.log('[SCHEDULER] Import already running, skipping...');
    return { success: false, message: 'Import already running' };
  }
  
  isRunning = true;
  const startTime = new Date();
  
  console.log('[SCHEDULER] Starting scheduled CSV import...');
  
  try {
    // Get CSV sources
    const sources = await storage.getAllCsvSources();
    
    if (sources.length === 0) {
      console.log('[SCHEDULER] No CSV sources configured');
      await storage.updateSchedulerSettings({
        lastRunAt: startTime,
        lastRunStatus: 'WARNING',
        lastRunError: 'No CSV sources configured',
      });
      isRunning = false;
      return { success: false, message: 'No CSV sources configured' };
    }
    
    let totalSuccess = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    // Process each CSV source
    for (const source of sources) {
      console.log(`[SCHEDULER] Downloading CSV from: ${source.url}`);
      
      try {
        const items = await downloadAndParseCsv(source.url);
        console.log(`[SCHEDULER] Downloaded ${items.length} items from ${source.name}`);
        
        if (items.length > 0) {
          const result = await storage.bulkUpsertInventoryItems(items);
          totalSuccess += result.success;
          totalUpdated += result.updated;
          totalErrors += result.errors;
          
          console.log(`[SCHEDULER] Processed ${source.name}: ${result.success} created, ${result.updated} updated, ${result.errors} errors`);
        }
      } catch (error: any) {
        console.error(`[SCHEDULER] Error processing ${source.name}:`, error);
        totalErrors++;
      }
    }
    
    // Update scheduler settings
    await storage.updateSchedulerSettings({
      lastRunAt: startTime,
      lastRunStatus: totalErrors > 0 ? 'PARTIAL' : 'SUCCESS',
      lastRunError: totalErrors > 0 ? `${totalErrors} errors occurred` : null,
    });
    
    console.log(`[SCHEDULER] Import completed: ${totalSuccess} created, ${totalUpdated} updated, ${totalErrors} errors`);
    
    isRunning = false;
    return {
      success: true,
      message: 'Import completed successfully',
      details: {
        created: totalSuccess,
        updated: totalUpdated,
        errors: totalErrors,
      },
    };
  } catch (error: any) {
    console.error('[SCHEDULER] Import failed:', error);
    
    await storage.updateSchedulerSettings({
      lastRunAt: startTime,
      lastRunStatus: 'ERROR',
      lastRunError: error.message || 'Unknown error',
    });
    
    isRunning = false;
    return { success: false, message: error.message || 'Import failed' };
  }
}

function downloadAndParseCsv(url: string): Promise<InsertInventoryItem[]> {
  return new Promise((resolve, reject) => {
    const items: InsertInventoryItem[] = [];
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      const parser = parse({ headers: true, trim: true });
      
      parser.on('data', (row: any) => {
        try {
          // Parse CSV row into InsertInventoryItem
          const item: InsertInventoryItem = {
            productId: row.productId || null,
            name: row.name || null,
            sku: row.sku || row.SKU || '',
            location: row.location || null,
            quantity: parseInt(row.quantity) || 0,
            barcode: row.barcode || null,
            condition: row.condition || null,
            length: row.length ? parseFloat(row.length) : null,
            width: row.width ? parseFloat(row.width) : null,
            height: row.height ? parseFloat(row.height) : null,
            volume: row.volume ? parseFloat(row.volume) : null,
            weight: row.weight ? parseFloat(row.weight) : null,
            price: row.price ? parseFloat(row.price) : null,
            itemId: row.itemId || null,
            ebayUrl: row.ebayUrl || null,
            imageUrls: row.imageUrls || null,
            ebaySellerName: row.ebaySellerName || null,
            createdBy: null,
          };
          
          if (item.sku) {
            items.push(item);
          }
        } catch (error) {
          console.error('[SCHEDULER] Error parsing CSV row:', error);
        }
      });
      
      parser.on('end', () => {
        resolve(items);
      });
      
      parser.on('error', (error) => {
        reject(error);
      });
      
      response.pipe(parser);
    }).on('error', (error) => {
      reject(error);
    });
  });
}
