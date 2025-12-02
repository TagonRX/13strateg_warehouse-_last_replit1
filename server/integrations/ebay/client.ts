import { db } from "../../db";
import { ebayAccounts } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

type TokenInfo = { accessToken: string; expiresAt: Date };

export async function getEnabledAccounts() {
  return await db.select().from(ebayAccounts).where(sql`enabled = 1`);
}

export async function ensureAccessToken(accountId: string): Promise<TokenInfo> {
  // NOTE: Stub implementation. Replace with real OAuth refresh flow (eBay Sell API)
  const [acc] = await db.select().from(ebayAccounts).where(eq(ebayAccounts.id, accountId));
  if (!acc) throw new Error("Account not found");

  const now = new Date();
  const exp = acc.accessTokenExpiresAt ? new Date(acc.accessTokenExpiresAt) : new Date(0);
  if (acc.accessToken && exp > new Date(now.getTime() + 60_000)) {
    return { accessToken: acc.accessToken, expiresAt: exp };
  }

  // Simulate refresh
  const newToken = `stub_${accountId}_${now.getTime()}`;
  const newExp = new Date(now.getTime() + 55 * 60 * 1000);
  await db.update(ebayAccounts).set({ accessToken: newToken, accessTokenExpiresAt: newExp.toISOString(), updatedAt: now.toISOString() }).where(eq(ebayAccounts.id, accountId));
  return { accessToken: newToken, expiresAt: newExp };
}
