import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEbayAccounts,
  createEbayAccount,
  updateEbayAccount,
  testEbayAccount,
  pullEbayOrders,
  pullEbayInventory,
  createPickingListFromEbay,
  type EbayAccount,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function EbayIntegrationPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: accounts = [], isFetching } = useQuery<EbayAccount[]>({
    queryKey: ["/api/integrations/ebay/accounts"],
    queryFn: getEbayAccounts,
  });

  // Settings: allow worker pull orders, inventory sync mode, accounts
  const { data: allowWorkerPull } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "allow_worker_orders_pull"],
    queryFn: async () => {
      const res = await fetch("/api/settings/allow_worker_orders_pull");
      if (res.status === 404) return { key: "allow_worker_orders_pull", value: "false" };
      return res.json();
    },
  });

  const { data: inventorySyncMode } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_mode"],
    queryFn: async () => {
      const res = await fetch("/api/settings/inventory_sync_mode");
      if (res.status === 404) return { key: "inventory_sync_mode", value: "none" };
      return res.json();
    },
  });

  const { data: inventorySyncAccounts } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_accounts"],
    queryFn: async () => {
      const res = await fetch("/api/settings/inventory_sync_accounts");
      if (res.status === 404) return { key: "inventory_sync_accounts", value: "[]" };
      return res.json();
    },
  });

  const [form, setForm] = useState({
    label: "",
    siteId: "",
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    enabled: true,
  });

  const canCreate = useMemo(() =>
    form.label && form.clientId && form.clientSecret && form.refreshToken,
  [form]);

  const createMutation = useMutation({
    mutationFn: () => createEbayAccount({
      label: form.label.trim(),
      siteId: form.siteId.trim() || undefined,
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      refreshToken: form.refreshToken.trim(),
      enabled: form.enabled,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/integrations/ebay/accounts"] });
      setForm({ label: "", siteId: "", clientId: "", clientSecret: "", refreshToken: "", enabled: true });
      toast({ title: "Аккаунт добавлен" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось создать аккаунт", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<{ label: string; siteId?: string; clientId: string; clientSecret: string; refreshToken: string; enabled: boolean; lastOrdersSince?: string | null; lastInventorySince?: string | null; }> }) => updateEbayAccount(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/integrations/ebay/accounts"] });
      toast({ title: "Изменения сохранены" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось обновить аккаунт", variant: "destructive" }),
  });

  const saveSetting = async (key: string, value: any) => {
    const response = await fetch(`/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: typeof value === 'string' ? value : JSON.stringify(value) }),
    });
    if (!response.ok) throw new Error("Не удалось сохранить настройку");
    return response.json();
  };

  const saveSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => saveSetting(key, value),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/settings", vars.key] });
      toast({ title: "Настройка сохранена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testEbayAccount(id),
    onSuccess: (res) => toast({ title: "Тест успешен", description: res?.tokenExpiresAt ? `Токен действителен до ${res.tokenExpiresAt}` : undefined }),
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Тест не выполнен", variant: "destructive" }),
  });

  const pullOrdersMutation = useMutation({
    mutationFn: pullEbayOrders,
    onSuccess: () => toast({ title: "Заказы загружены" }),
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось загрузить заказы", variant: "destructive" }),
  });

  const pullInventoryMutation = useMutation({
    mutationFn: pullEbayInventory,
    onSuccess: () => toast({ title: "Инвентарь загружен" }),
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось загрузить инвентарь", variant: "destructive" }),
  });

  const createPickingListMutation = useMutation({
    mutationFn: createPickingListFromEbay,
    onSuccess: () => toast({ title: "Лист отбора создан" }),
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось создать лист отбора", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Интеграция с eBay</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => pullOrdersMutation.mutate()} disabled={pullOrdersMutation.isPending || isFetching}>
            Загрузить заказы
          </Button>
          <Button variant="secondary" onClick={() => pullInventoryMutation.mutate()} disabled={pullInventoryMutation.isPending || isFetching}>
            Загрузить инвентарь
          </Button>
          <Button onClick={() => createPickingListMutation.mutate()} disabled={createPickingListMutation.isPending}>
            Создать лист отбора
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Site ID</TableHead>
                  <TableHead>Включен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.label}</TableCell>
                    <TableCell>{acc.siteId || "-"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={!!acc.enabled}
                        onCheckedChange={(val) => updateMutation.mutate({ id: acc.id, updates: { enabled: !!val } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => testMutation.mutate(acc.id)} disabled={testMutation.isPending}>
                        Тест
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">Нет аккаунтов</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Добавить аккаунт</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="label">Название</Label>
              <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Магазин 1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siteId">Site ID (опционально)</Label>
              <Input id="siteId" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} placeholder="EBAY_GB" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input id="clientSecret" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="refreshToken">Refresh Token</Label>
              <Input id="refreshToken" value={form.refreshToken} onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: !!v })} />
                <Label>Включен</Label>
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={!canCreate || createMutation.isPending}>Добавить</Button>
            </div>
          </div>

          <div className="pt-4 border-t space-y-3">
            <h3 className="text-lg font-medium">Настройки</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={allowWorkerPull?.value === "true"}
                  onCheckedChange={(v) => saveSettingMutation.mutate({ key: "allow_worker_orders_pull", value: v ? "true" : "false" })}
                />
                <Label>Разрешить работникам подгружать заказы</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Режим синхронизации инвентаря</Label>
              <Select
                value={inventorySyncMode?.value || "none"}
                onValueChange={(v) => saveSettingMutation.mutate({ key: "inventory_sync_mode", value: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Отключено</SelectItem>
                  <SelectItem value="pull">Только из eBay</SelectItem>
                  <SelectItem value="push">Только в eBay</SelectItem>
                  <SelectItem value="both">В обе стороны</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Аккаунты для синхронизации инвентаря</Label>
              <div className="grid grid-cols-1 gap-2">
                {accounts.map(acc => {
                  const selected = (() => {
                    try {
                      const arr = JSON.parse(inventorySyncAccounts?.value || "[]");
                      return Array.isArray(arr) ? arr.includes(acc.id) : false;
                    } catch { return false; }
                  })();
                  return (
                    <div key={acc.id} className="flex items-center justify-between py-1">
                      <span className="text-sm">{acc.label}</span>
                      <Switch
                        checked={selected}
                        onCheckedChange={(v) => {
                          let arr: string[] = [];
                          try { const parsed = JSON.parse(inventorySyncAccounts?.value || "[]"); if (Array.isArray(parsed)) arr = parsed; } catch {}
                          if (v) {
                            if (!arr.includes(acc.id)) arr.push(acc.id);
                          } else {
                            arr = arr.filter(x => x !== acc.id);
                          }
                          saveSettingMutation.mutate({ key: "inventory_sync_accounts", value: arr });
                        }}
                      />
                    </div>
                  );
                })}
                {accounts.length === 0 && <div className="text-xs text-muted-foreground">Нет аккаунтов</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
