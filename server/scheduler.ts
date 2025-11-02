import cron, { ScheduledTask } from 'node-cron';
import { storage } from './storage';
import https from 'https';
import http from 'http';
import { InsertInventoryItem } from '@shared/schema';
import { parse } from 'fast-csv';

let cronTask: ScheduledTask | null = null;
let archiveCronTask: ScheduledTask | null = null;
let isRunning = false;

export async function startScheduler() {
  console.log('[SCHEDULER] Starting scheduler...');
  
  // Get settings from database
  const settings = await storage.getSchedulerSettings();
  
  if (!settings) {
    console.log('[SCHEDULER] No settings found, CSV scheduler not started');
  } else if (!settings.enabled) {
    console.log('[SCHEDULER] CSV scheduler is disabled');
  } else {
    console.log(`[SCHEDULER] Scheduling CSV import with cron: ${settings.cronExpression}`);
    
    // Stop existing task if any
    if (cronTask) {
      cronTask.stop();
      cronTask = null;
    }
    
    // Validate cron expression
    if (!cron.validate(settings.cronExpression)) {
      console.error('[SCHEDULER] Invalid cron expression:', settings.cronExpression);
    } else {
      // Create new cron task
      cronTask = cron.schedule(settings.cronExpression, async () => {
        await runScheduledImport();
      });
      
      console.log('[SCHEDULER] CSV scheduler started successfully');
    }
  }
  
  // Start archive cleanup task (runs daily at 2 AM) - INDEPENDENT of CSV scheduler
  if (archiveCronTask) {
    archiveCronTask.stop();
    archiveCronTask = null;
  }

  archiveCronTask = cron.schedule('0 2 * * *', async () => {
    await runScheduledArchiveCleanup();
  });

  console.log('[SCHEDULER] Archive cleanup task scheduled (daily at 2 AM)');
}

export async function stopScheduler() {
  console.log('[SCHEDULER] Stopping scheduler...');
  
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  
  if (archiveCronTask) {
    archiveCronTask.stop();
    archiveCronTask = null;
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
    // Get bulk upload sources (for inventory mass upload)
    const sources = await storage.getAllBulkUploadSources();
    
    if (sources.length === 0) {
      console.log('[SCHEDULER] No bulk upload sources configured');
      await storage.updateSchedulerSettings({
        lastRunAt: startTime,
        lastRunStatus: 'WARNING',
        lastRunError: 'No bulk upload sources configured',
      });
      isRunning = false;
      return { success: false, message: 'No bulk upload sources configured' };
    }
    
    let totalSuccess = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    // Process each bulk upload source
    for (const source of sources) {
      // Skip disabled sources
      if (!source.enabled) {
        console.log(`[SCHEDULER] Skipping disabled source: ${source.label}`);
        continue;
      }
      
      // Skip sources with empty URL (draft/incomplete entries)
      if (!source.url || source.url.trim() === '') {
        console.log(`[SCHEDULER] Skipping source with empty URL: ${source.label}`);
        continue;
      }
      
      console.log(`[SCHEDULER] Downloading CSV from: ${source.url}`);
      
      try {
        const items = await downloadAndParseCsv(source.url);
        console.log(`[SCHEDULER] Downloaded ${items.length} items from ${source.label}`);
        
        if (items.length > 0) {
          const result = await storage.bulkUpsertInventoryItems(items);
          totalSuccess += result.success;
          totalUpdated += result.updated;
          totalErrors += result.errors;
          
          console.log(`[SCHEDULER] Processed ${source.label}: ${result.success} created, ${result.updated} updated, ${result.errors} errors`);
        }
      } catch (error: any) {
        console.error(`[SCHEDULER] Error processing ${source.label}:`, error);
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

// Helper to get value from CSV row (case-insensitive)
function getCsvValue(row: any, ...keys: string[]): string | undefined {
  for (const key of keys) {
    // Try exact match first
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
    // Try case-insensitive match
    const lowerKey = key.toLowerCase();
    for (const rowKey in row) {
      if (rowKey.toLowerCase() === lowerKey && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
        return row[rowKey];
      }
    }
  }
  return undefined;
}

// Safe integer parsing helper - prevents NaN values
function safeParseInt(value: string | undefined, defaultValue: number = 0): number | undefined {
  if (!value) return defaultValue === 0 ? 0 : undefined;
  const parsed = parseInt(value, 10);
  return !isNaN(parsed) ? parsed : defaultValue === 0 ? 0 : undefined;
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
          // Parse CSV row with case-insensitive column matching
          const sku = getCsvValue(row, 'sku', 'SKU');
          const itemId = getCsvValue(row, 'itemId', 'itemid', 'item_id', 'Item ID');
          const productName = getCsvValue(row, 'name', 'productName', 'productname', 'product_name', 'Product Name');
          const quantityRaw = getCsvValue(row, 'quantity', 'qty', 'Quantity', 'warehouse_inventory');
          const priceRaw = getCsvValue(row, 'price', 'Price');
          const ebayUrl = getCsvValue(row, 'ebayUrl', 'ebayurl', 'ebay_url', 'eBay URL', 'url');
          const ebaySellerName = getCsvValue(row, 'ebaySellerName', 'ebaysellername', 'ebay_seller_name', 'seller_ebay_seller_id');
          const condition = getCsvValue(row, 'condition', 'Condition');
          
          // Missing fields - now included with case-insensitive matching
          const location = getCsvValue(row, 'location', 'Location', 'Локация');
          const barcode = getCsvValue(row, 'barcode', 'Barcode', 'Штрихкод');
          const lengthRaw = getCsvValue(row, 'length', 'Length', 'Длина');
          const widthRaw = getCsvValue(row, 'width', 'Width', 'Ширина');
          const heightRaw = getCsvValue(row, 'height', 'Height', 'Высота');
          const volumeRaw = getCsvValue(row, 'volume', 'Volume', 'Объем');
          const weightRaw = getCsvValue(row, 'weight', 'Weight', 'Вес');
          
          // Collect image URLs (imageUrl1 - imageUrl24)
          const imageUrls: string[] = [];
          for (let i = 1; i <= 24; i++) {
            const imageUrl = getCsvValue(row, `imageUrl${i}`, `imageurl${i}`, `image_url_${i}`, `ImageURL${i}`);
            if (imageUrl) {
              imageUrls.push(imageUrl);
            }
          }
          
          // Safe parsing of numeric fields to prevent NaN
          const quantity = safeParseInt(quantityRaw, 0);
          const price = safeParseInt(priceRaw, undefined);
          const length = safeParseInt(lengthRaw, undefined);
          const width = safeParseInt(widthRaw, undefined);
          const height = safeParseInt(heightRaw, undefined);
          const volume = safeParseInt(volumeRaw, undefined);
          const weight = safeParseInt(weightRaw, undefined);
          
          const item: InsertInventoryItem = {
            name: productName || undefined,
            sku: sku || '',
            quantity: quantity,
            price: price,
            itemId: itemId || undefined,
            ebayUrl: ebayUrl || undefined,
            imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : undefined,
            ebaySellerName: ebaySellerName || undefined,
            condition: condition || undefined,
            location: location || undefined,
            barcode: barcode || undefined,
            length: length,
            width: width,
            height: height,
            volume: volume,
            weight: weight,
          } as InsertInventoryItem;
          
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

export async function runScheduledArchiveCleanup(): Promise<void> {
  console.log('[ARCHIVE-CLEANUP] Starting scheduled archive cleanup...');
  
  try {
    const archivedCount = await storage.archiveExpiredZeroQuantityItems();
    console.log(`[ARCHIVE-CLEANUP] Archived ${archivedCount} expired items`);
  } catch (error: any) {
    console.error('[ARCHIVE-CLEANUP] Archive cleanup failed:', error);
  }
}
