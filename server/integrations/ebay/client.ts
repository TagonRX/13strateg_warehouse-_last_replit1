import { db } from "../../db";
import { ebayAccounts } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { storage } from "../../storage";

type TokenInfo = { accessToken: string; expiresAt: Date };

function getEbayOAuthBase(env: string | undefined): string {
  const e = (env || "production").toLowerCase();
  return e === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export async function getEnabledAccounts() {
  return await db.select().from(ebayAccounts).where(sql`enabled = 1`);
}

export async function ensureAccessToken(accountId: string): Promise<TokenInfo> {
  const [acc] = await db.select().from(ebayAccounts).where(eq(ebayAccounts.id, accountId));
  if (!acc) throw new Error("Account not found");

  const now = new Date();
  const exp = acc.accessTokenExpiresAt ? new Date(acc.accessTokenExpiresAt) : new Date(0);
  if (acc.accessToken && exp > new Date(now.getTime() + 60_000)) {
    return { accessToken: acc.accessToken, expiresAt: exp };
  }

  // Real refresh using stored refresh_token and client credentials
  const envSetting = await storage.getGlobalSetting('ebay_api_env');
  const base = getEbayOAuthBase(envSetting?.value);
  const tokenUrl = `${base}/identity/v1/oauth2/token`;

  const clientId = acc.clientId;
  const clientSecret = acc.clientSecret;
  const refreshToken = acc.refreshToken;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing eBay clientId/clientSecret/refreshToken for account");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);
  // Scope: for Inventory API, use 'https://api.ebay.com/oauth/api_scope' and inventory scopes
  // Using full commerce scope ensures access; adjust if needed
  params.set('scope', 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed: ${res.status} ${text.slice(0, 500)}`);
  }

  const data: any = await res.json();
  const accessToken: string = data.access_token;
  const expiresInSec: number = data.expires_in || 3600;
  const newExp = new Date(now.getTime() + Math.max(300_000, (expiresInSec - 60) * 1000));

  await db.update(ebayAccounts)
    .set({ accessToken, accessTokenExpiresAt: newExp.toISOString(), updatedAt: now.toISOString() })
    .where(eq(ebayAccounts.id, accountId));

  return { accessToken, expiresAt: newExp };
}
