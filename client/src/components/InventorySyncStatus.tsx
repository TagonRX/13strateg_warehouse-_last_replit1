import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getEbayAccounts, pullEbayInventory, getAuthToken } from "@/lib/api";

export default function InventorySyncStatus() {
  const { data: modeSetting } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_mode"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/inventory_sync_mode", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "inventory_sync_mode", value: "none" };
      return res.json();
    },
  });
  const mode = modeSetting?.value || "none";

  const { data: idsSetting } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_accounts"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/inventory_sync_accounts", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "inventory_sync_accounts", value: "[]" };
      return res.json();
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/integrations/ebay/accounts"],
    queryFn: getEbayAccounts,
  });

  const selectedAccounts = useMemo(() => {
    let arr: string[] = [];
    try { const parsed = JSON.parse(idsSetting?.value || "[]"); if (Array.isArray(parsed)) arr = parsed; } catch {}
    return accounts.filter(a => arr.includes(a.id));
  }, [idsSetting, accounts]);

  const lastSync = useMemo(() => {
    const dates = selectedAccounts
      .map(a => a.lastInventorySince)
      .filter(Boolean)
      .map(s => new Date(s as string).getTime());
    if (dates.length === 0) return null;
    const maxTs = Math.max(...dates);
    return new Date(maxTs);
  }, [selectedAccounts]);

  const pullMutation = useMutation({
    mutationFn: pullEbayInventory,
  });

  if (mode === "none") return null;

  return (
    <Card>
      <CardContent className="py-3 flex items-center justify-between gap-4">
        <div className="text-sm">
          <div>Синхронизация инвентаря: <span className="font-medium">{mode === 'pull' ? 'Только из eBay' : mode === 'push' ? 'Только в eBay' : 'В обе стороны'}</span></div>
          <div className="text-muted-foreground text-xs">
            Аккаунты: {selectedAccounts.map(a => a.label).join(', ') || '—'}
          </div>
          <div className="text-muted-foreground text-xs">
            Последняя синхронизация: {lastSync ? lastSync.toLocaleString() : '—'}
          </div>
        </div>
        {(mode === 'pull' || mode === 'both') && (
          <Button size="sm" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending}>
            {pullMutation.isPending ? 'Синхронизация...' : 'Синхронизировать сейчас'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
