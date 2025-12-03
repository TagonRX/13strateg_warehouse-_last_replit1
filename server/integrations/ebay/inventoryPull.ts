import { db } from "../../db";
import { externalInventoryIndex, inventoryItems, ebayAccounts, importRuns } from "@shared/schema";
import { ensureAccessToken, getEnabledAccounts } from "./client";
import { and, eq } from "drizzle-orm";
import { storage } from "../../storage";

export type PullInventoryResult = { created: number; updated: number; skipped: number; errors: number; accountId: string };

export async function pullInventoryForAllAccounts(): Promise<PullInventoryResult[]> {
  const accounts = (await getEnabledAccounts()).filter((a: any) => a.useInventory === true);
  // Filter by settings: inventory_sync_accounts (JSON array of account ids)
  let allowedIds: string[] | null = null;
  const setting = await storage.getGlobalSetting('inventory_sync_accounts');
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value);
      if (Array.isArray(parsed)) allowedIds = parsed.filter((v) => typeof v === 'string');
    } catch {}
  }
  const filtered = allowedIds ? accounts.filter((a: any) => allowedIds!.includes(a.id)) : [];
  const results: PullInventoryResult[] = [];
  for (const acc of filtered) {
    try {
      const r = await pullInventoryForAccount(acc.id);
      results.push(r);
    } catch (e) {
      results.push({ created: 0, updated: 0, skipped: 0, errors: 1, accountId: acc.id });
    }
  }
  return results;
}

export async function pullInventoryForAccount(accountId: string): Promise<PullInventoryResult> {
  await ensureAccessToken(accountId);
  // STUB: Replace with eBay Inventory API call
  const externalItems: { externalItemId: string; sku?: string; quantity?: number; name?: string }[] = [];

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const ext of externalItems) {
    const idx = await db.select().from(externalInventoryIndex).where(and(eq(externalInventoryIndex.accountId, accountId), eq(externalInventoryIndex.externalItemId, ext.externalItemId)));
    if (idx.length > 0) {
      skipped++; // For now we do not push updates back; only map once
      continue;
    }

    try {
      // Try find local by SKU
      let itemId: string | undefined;
      if (ext.sku) {
        const found = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, ext.sku)).limit(1);
        if (found.length > 0) itemId = found[0].id;
      }

      await db.insert(externalInventoryIndex).values({
        accountId,
        externalItemId: ext.externalItemId,
        sku: ext.sku || null,
        inventoryItemId: itemId || null,
      });
      created++;
    } catch (e) {
      errors++;
    }
  }
  // Update account cursor and record import run
  await db.update(ebayAccounts)
    .set({ lastInventorySince: new Date().toISOString() })
    .where(eq(ebayAccounts.id, accountId));

  await db.insert(importRuns).values({
    sourceType: 'EBAY_INVENTORY',
    sourceRef: accountId,
    triggeredBy: 'manual_or_scheduler',
    rowsTotal: created + updated + skipped + errors,
    created,
    errors,
    status: errors > 0 ? 'WARNING' : 'SUCCESS',
  });

  return { created, updated, skipped, errors, accountId };
}
