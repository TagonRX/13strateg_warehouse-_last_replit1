import { ensureAccessToken } from "./client";
import { storage } from "../../storage";

type EffectiveRow = { sku: string; effective: number };

function getEbayApiBase(env: string | undefined): string {
  const e = (env || "production").toLowerCase();
  return e === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export async function pushInventoryForAccount(accountId: string, list: EffectiveRow[]): Promise<{ updated: number; errors: number; logs: Array<{ sku: string; ok: boolean; status?: number; message?: string }> }>{
  const liveSetting = await storage.getGlobalSetting('inventory_push_live');
  const live = (liveSetting?.value || '').toString().toLowerCase() === 'true';
  const envSetting = await storage.getGlobalSetting('ebay_api_env'); // 'production' | 'sandbox'
  const base = getEbayApiBase(envSetting?.value);

  const { accessToken } = await ensureAccessToken(accountId);

  let updated = 0;
  let errors = 0;
  const logs: Array<{ sku: string; ok: boolean; status?: number; message?: string }> = [];

  for (const row of list) {
    if (row.effective <= 0) {
      // пропускаем нулевые значения
      continue;
    }
    const sku = row.sku;

    if (!live) {
      // dry-run: просто логируем намерение
      logs.push({ sku, ok: true, message: 'dry-run' });
      updated++;
      continue;
    }

    try {
      // Минимальная реализация через Inventory Item API.
      // В eBay для обновления доступности используется inventory item по SKU.
      // В реальном мире нужно обеспечить, что SKU связан с offer/listing, иначе количество на лоте может не обновиться.
      const url = `${base}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
      const body = {
        availability: {
          shipToLocationAvailability: {
            quantity: row.effective,
          },
        },
      };
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        errors++;
        logs.push({ sku, ok: false, status: res.status, message: text.slice(0, 500) });
        continue;
      }

      updated++;
      logs.push({ sku, ok: true, status: res.status });
    } catch (e: any) {
      errors++;
      logs.push({ sku, ok: false, message: e?.message || 'unknown error' });
    }
  }

  return { updated, errors, logs };
}
