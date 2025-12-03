import { db } from "../../db";
import { externalOrdersIndex, orders, ebayAccounts, importRuns, reservations } from "@shared/schema";
import { ensureAccessToken, getEnabledAccounts } from "./client";
import { eq, and } from "drizzle-orm";

export type PullOrdersResult = { created: number; skipped: number; errors: number; accountId: string };

export async function pullOrdersForAllAccounts(): Promise<PullOrdersResult[]> {
  // Только аккаунты, отмеченные для заказов
  const accounts = (await getEnabledAccounts()).filter(a => (a as any).useOrders === true);
  const results: PullOrdersResult[] = [];
  for (const acc of accounts) {
    try {
      const r = await pullOrdersForAccount(acc.id);
      results.push(r);
    } catch (e) {
      results.push({ created: 0, skipped: 0, errors: 1, accountId: acc.id });
    }
  }
  return results;
}

export async function pullOrdersForAccount(accountId: string): Promise<PullOrdersResult> {
  await ensureAccessToken(accountId);
  // STUB: In real impl, call eBay Sell Fulfillment API with last-modified cursor
  // Here we simulate an empty page to wire the pipeline
  const externalOrders: { externalId: string; orderNumber: string; items: any[]; buyer?: { username?: string; name?: string }; postalCode?: string; orderDate?: string }[] = [];

  let created = 0, skipped = 0, errors = 0;

  for (const ext of externalOrders) {
    const exists = await db.select().from(externalOrdersIndex).where(and(eq(externalOrdersIndex.accountId, accountId), eq(externalOrdersIndex.externalOrderId, ext.externalId)));
    if (exists.length > 0) { skipped++; continue; }

    try {
      // Compose local order; we keep orderNumber for human use; external id tracked in index
      const [newOrder] = await db.insert(orders).values({
        orderNumber: ext.orderNumber || `${ext.postalCode || "EXT"}_${ext.externalId}`,
        buyerUsername: ext.buyer?.username || null,
        buyerName: ext.buyer?.name || null,
        addressPostalCode: ext.postalCode || null,
        status: "PENDING",
        items: JSON.stringify(ext.items || []),
        orderDate: ext.orderDate || new Date().toISOString(),
      }).returning();

      // Create SKU reservations for this order (prevent overstock)
      try {
        const items = Array.isArray(ext.items) ? ext.items : [];
        for (const it of items) {
          if (!it?.sku) continue;
          const qty = Math.max(1, it.quantity ?? 1);
          await db.insert(reservations).values({ orderId: newOrder.id, sku: String(it.sku).toUpperCase(), quantity: qty });
        }
      } catch {}

      await db.insert(externalOrdersIndex).values({
        accountId,
        externalOrderId: ext.externalId,
        orderId: newOrder.id,
      });
      created++;
    } catch (e) {
      errors++;
    }
  }
  // Update account cursor and record import run
  await db.update(ebayAccounts)
    .set({ lastOrdersSince: new Date().toISOString() })
    .where(eq(ebayAccounts.id, accountId));

  await db.insert(importRuns).values({
    sourceType: 'EBAY_ORDERS',
    sourceRef: accountId,
    triggeredBy: 'manual_or_scheduler',
    rowsTotal: created + skipped + errors,
    created,
    errors,
    status: errors > 0 ? 'WARNING' : 'SUCCESS',
  });

  return { created, skipped, errors, accountId };
}
