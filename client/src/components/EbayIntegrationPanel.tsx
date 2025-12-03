import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getEbayAccounts, updateEbayAccount, testEbayAccount, type EbayAccount, getAuthToken, getEffectiveATPForAccount, pushEbayInventory } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function EbayIntegrationPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery<EbayAccount[]>({
    queryKey: ["/api/integrations/ebay/accounts"],
    queryFn: getEbayAccounts,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<EbayAccount> }) => updateEbayAccount(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/integrations/ebay/accounts"] });
      toast({ title: "Сохранено" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testEbayAccount(id),
    onSuccess: (res) => toast({ title: "Тест успешен", description: res?.tokenExpiresAt ? `Токен до ${res.tokenExpiresAt}` : undefined }),
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Тест не выполнен", variant: "destructive" }),
  });

  // Settings
  const { data: allowWorkerPull } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "allow_worker_orders_pull"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/allow_worker_orders_pull", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "allow_worker_orders_pull", value: "false" };
      return res.json();
    },
  });
  const { data: inventorySyncMode } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_mode"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/inventory_sync_mode", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "inventory_sync_mode", value: "none" };
      return res.json();
    },
  });
  const { data: inventorySyncAccounts } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_sync_accounts"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/inventory_sync_accounts", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "inventory_sync_accounts", value: "[]" };
      return res.json();
    },
  });
  const { data: safetyBuffer } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "inventory_safety_buffer"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/settings/inventory_safety_buffer", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.status === 404) return { key: "inventory_safety_buffer", value: "{}" };
      return res.json();
    },
  });

  const saveSetting = async (key: string, value: any) => {
    const token = getAuthToken();
    const response = await fetch(`/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ value: typeof value === "string" ? value : JSON.stringify(value) }),
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

  // Import runs + filters
  const { data: runsOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/import-runs", "EBAY_ORDERS"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/import-runs?sourceType=EBAY_ORDERS&limit=50", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Не удалось получить историю импортов заказов");
      return res.json();
    },
  });
  const { data: runsInv = [] } = useQuery<any[]>({
    queryKey: ["/api/import-runs", "EBAY_INVENTORY"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/import-runs?sourceType=EBAY_INVENTORY&limit=50", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Не удалось получить историю импортов инвентаря");
      return res.json();
    },
  });
  const { data: runsInvPush = [] } = useQuery<any[]>({
    queryKey: ["/api/import-runs", "EBAY_INVENTORY_PUSH"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/import-runs?sourceType=EBAY_INVENTORY_PUSH&limit=50", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Не удалось получить историю пушей инвентаря");
      return res.json();
    },
  });
  const [filterAccountId, setFilterAccountId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  const matchFilters = (r: any) => {
    if (filterAccountId !== "all" && r.sourceRef && r.sourceRef !== filterAccountId) return false;
    if (filterStatus !== "all" && r.status && r.status !== filterStatus) return false;
    if (filterStartDate) {
      const d = new Date(r.createdAt);
      const start = new Date(filterStartDate);
      if (d < start) return false;
    }
    if (filterEndDate) {
      const d = new Date(r.createdAt);
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };
  const filteredOrders = useMemo(() => runsOrders.filter(matchFilters), [runsOrders, filterAccountId, filterStatus, filterStartDate, filterEndDate]);
  const filteredInv = useMemo(() => runsInv.filter(matchFilters), [runsInv, filterAccountId, filterStatus, filterStartDate, filterEndDate]);
  const filteredInvPush = useMemo(() => runsInvPush.filter(matchFilters), [runsInvPush, filterAccountId, filterStatus, filterStartDate, filterEndDate]);

  // Effective ATP preview & push
  const [previewAccountId, setPreviewAccountId] = useState<string>("");
  const { data: effectivePreview, isFetching: effectiveLoading } = useQuery<{ accountId: string; list: Array<{ sku: string; onHand: number; reserved: number; buffer: number; effective: number }> }>({
    queryKey: ["/api/inventory/atp/effective", previewAccountId],
    queryFn: () => getEffectiveATPForAccount(previewAccountId),
    enabled: !!previewAccountId,
  });

  const pushMutation = useMutation({
    mutationFn: (accountId: string) => pushEbayInventory(accountId),
    onSuccess: (res) => {
      toast({ title: "Пуш выполнен", description: `Обновлено: ${res.updated ?? 0}, ошибок: ${res.errors ?? 0}` });
      qc.invalidateQueries({ queryKey: ["/api/import-runs", "EBAY_INVENTORY_PUSH"] });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось выполнить пуш", variant: "destructive" }),
  });

  // ====== Добавление нового аккаунта (форма) ======
  const [newLabel, setNewLabel] = useState("");
  const [newSiteId, setNewSiteId] = useState<string>("EBAY_GB");
  const [newClientId, setNewClientId] = useState("");
  const [newClientSecret, setNewClientSecret] = useState("");
  const [newRefreshToken, setNewRefreshToken] = useState("");
  const [newEnabled, setNewEnabled] = useState<boolean>(true);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newLabel || !newClientId || !newClientSecret || !newRefreshToken) {
        throw new Error("Заполните обязательные поля");
      }
      return await createEbayAccount({
        label: newLabel,
        siteId: newSiteId || undefined,
        clientId: newClientId,
        clientSecret: newClientSecret,
        refreshToken: newRefreshToken,
        enabled: newEnabled,
      });
    },
    onSuccess: () => {
      toast({ title: "Аккаунт добавлен" });
      setNewLabel("");
      setNewClientId("");
      setNewClientSecret("");
      setNewRefreshToken("");
      setNewEnabled(true);
      qc.invalidateQueries({ queryKey: ["/api/integrations/ebay/accounts"] });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось добавить аккаунт", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">eBay Integration</h2>
      </div>

      {/* Add Account Form */}
      <div className="space-y-3 border rounded-md p-4">
        <h3 className="text-lg font-medium">Добавить аккаунт</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Название</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Магазин 1" />
          </div>
          <div>
            <Label>Site ID (опционально)</Label>
            <Input value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)} placeholder="EBAY_GB" />
          </div>
          <div>
            <Label>Client ID</Label>
            <Input value={newClientId} onChange={(e) => setNewClientId(e.target.value)} />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input value={newClientSecret} onChange={(e) => setNewClientSecret(e.target.value)} />
          </div>
          <div>
            <Label>Refresh Token</Label>
            <Input value={newRefreshToken} onChange={(e) => setNewRefreshToken(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
            <Label>Включен</Label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Добавить</Button>
        </div>
      </div>

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
                  <Switch checked={!!acc.enabled} onCheckedChange={(val) => updateMutation.mutate({ id: acc.id, updates: { enabled: !!val } })} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => testMutation.mutate(acc.id)} disabled={testMutation.isPending}>Тест</Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">{isLoading ? "Загрузка…" : "Нет аккаунтов"}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Настройки</h3>
        <div className="flex items-center gap-3">
          <Switch checked={allowWorkerPull?.value === "true"} onCheckedChange={(v) => saveSettingMutation.mutate({ key: "allow_worker_orders_pull", value: v ? "true" : "false" })} />
          <Label>Разрешить работникам подгружать заказы</Label>
        </div>
        <div className="space-y-2">
          <Label>Режим синхронизации инвентаря</Label>
          <Select value={inventorySyncMode?.value || "none"} onValueChange={(v) => saveSettingMutation.mutate({ key: "inventory_sync_mode", value: v })}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Выберите режим" /></SelectTrigger>
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
            {accounts.map((acc) => {
              const selected = (() => { try { const arr = JSON.parse(inventorySyncAccounts?.value || "[]"); return Array.isArray(arr) ? arr.includes(acc.id) : false; } catch { return false; } })();
              return (
                <div key={acc.id} className="flex items-center justify-between py-1">
                  <span className="text-sm">{acc.label}</span>
                  <Switch checked={selected} onCheckedChange={(v) => { let arr: string[] = []; try { const parsed = JSON.parse(inventorySyncAccounts?.value || "[]"); if (Array.isArray(parsed)) arr = parsed; } catch {} if (v) { if (!arr.includes(acc.id)) arr.push(acc.id); } else { arr = arr.filter((x) => x !== acc.id); } saveSettingMutation.mutate({ key: "inventory_sync_accounts", value: arr }); }} />
                </div>
              );
            })}
            {accounts.length === 0 && <div className="text-xs text-muted-foreground">Нет аккаунтов</div>}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Safety buffer по аккаунтам</Label>
          <div className="grid grid-cols-1 gap-2">
            {accounts.map((acc) => {
              let bufMap: Record<string, number> = {};
              try { bufMap = JSON.parse(safetyBuffer?.value || "{}"); } catch {}
              const value = Number.isFinite(bufMap[acc.id]) ? bufMap[acc.id] : 0;
              return (
                <div key={acc.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{acc.label}</span>
                  <Input type="number" className="w-24" value={value} min={0} onChange={(e) => { const next = { ...bufMap, [acc.id]: Math.max(0, Number(e.target.value) || 0) }; saveSettingMutation.mutate({ key: "inventory_safety_buffer", value: next }); }} />
                </div>
              );
            })}
            {accounts.length === 0 && <div className="text-xs text-muted-foreground">Нет аккаунтов</div>}
          </div>
        </div>
      </div>

      {/* Import runs with filters */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Истории и фильтры</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <Label>Аккаунт</Label>
            <Select value={filterAccountId} onValueChange={setFilterAccountId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Все" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {accounts.map(acc => (<SelectItem key={acc.id} value={acc.id}>{acc.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Статус</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                <SelectItem value="WARNING">WARNING</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>С даты</Label>
            <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
          </div>
          <div>
            <Label>По дату</Label>
            <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Заказы: Аккаунт</TableHead><TableHead>Дата</TableHead><TableHead>Создано</TableHead><TableHead>Ошибок</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredOrders.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{(accounts.find(a => a.id === r.sourceRef)?.label) || r.sourceRef || "—"}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.created ?? 0}</TableCell>
                    <TableCell className={r.errors ? 'text-red-600' : ''}>{r.errors ?? 0}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Нет записей</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Инвентарь: Аккаунт</TableHead><TableHead>Дата</TableHead><TableHead>Создано</TableHead><TableHead>Ошибок</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredInv.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{(accounts.find(a => a.id === r.sourceRef)?.label) || r.sourceRef || "—"}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.created ?? 0}</TableCell>
                    <TableCell className={r.errors ? 'text-red-600' : ''}>{r.errors ?? 0}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
                {filteredInv.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Нет записей</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="lg:col-span-2 border rounded-md overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Пуш: Аккаунт</TableHead><TableHead>Дата</TableHead><TableHead>Обновлено</TableHead><TableHead>Ошибок</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredInvPush.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{(accounts.find(a => a.id === r.sourceRef)?.label) || r.sourceRef || "—"}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.updated ?? 0}</TableCell>
                    <TableCell className={r.errors ? 'text-red-600' : ''}>{r.errors ?? 0}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
                {filteredInvPush.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Нет записей</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Effective ATP preview + push */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Предпросмотр push (с учётом буфера)</h3>
        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1">
            <Label>Аккаунт</Label>
            <Select value={previewAccountId} onValueChange={setPreviewAccountId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Выберите аккаунт" /></SelectTrigger>
              <SelectContent>
                {accounts.map(acc => (<SelectItem key={acc.id} value={acc.id}>{acc.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => previewAccountId && pushMutation.mutate(previewAccountId)} disabled={!previewAccountId || pushMutation.isPending}>Запушить инвентарь</Button>
        </div>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>On hand</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Buffer</TableHead>
                <TableHead>Effective</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!previewAccountId && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Выберите аккаунт</TableCell>
                </TableRow>
              )}
              {previewAccountId && effectiveLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Загрузка…</TableCell>
                </TableRow>
              )}
              {previewAccountId && !effectiveLoading && effectivePreview?.list?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Нет данных</TableCell>
                </TableRow>
              )}
              {previewAccountId && !effectiveLoading && effectivePreview?.list?.map((r) => (
                <TableRow key={`${r.sku}`}>
                  <TableCell className="font-mono">{r.sku}</TableCell>
                  <TableCell>{r.onHand}</TableCell>
                  <TableCell>{r.reserved}</TableCell>
                  <TableCell>{r.buffer}</TableCell>
                  <TableCell className={r.effective <= 0 ? 'text-red-600' : ''}>{r.effective}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
