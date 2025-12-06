import { useMemo, useState } from "react";
import type { InventoryItem } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from "recharts";

type Props = {
  inventory: InventoryItem[];
};

export default function OnlineAnalytics({ inventory }: Props) {
  const [period, setPeriod] = useState<string>("30");

  const { dailyDataAll, dailyData } = useMemo(() => {
    const map = new Map<string, { date: string; testedQty: number; placedQty: number; primaryQty: number; totalAmount: number; noPriceSku: number }>();
    (inventory || []).forEach((i) => {
      const d = (i.updatedAt || i.createdAt)
        ? new Date((i.updatedAt || i.createdAt) as any).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const row = map.get(d) || { date: d, testedQty: 0, placedQty: 0, primaryQty: 0, totalAmount: 0, noPriceSku: 0 };
      const price = (i.price ?? null) as number | null;
      if (i.location) row.placedQty += i.quantity;
      if (!i.name) row.primaryQty += i.quantity;
      if ((i as any).condition) row.testedQty += i.quantity;
      if (typeof price === "number") row.totalAmount += i.quantity * price;
      if (price == null) row.noPriceSku += 1;
      map.set(d, row);
    });
    const all = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    const days = parseInt(period || "30") || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const filtered = all.filter((d) => d.date >= cutoff);
    return { dailyDataAll: all, dailyData: filtered };
  }, [inventory, period]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Аналитика</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Период</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-8 text-xs px-1" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 дней</SelectItem>
                <SelectItem value="30">30 дней</SelectItem>
                <SelectItem value="90">90 дней</SelectItem>
                <SelectItem value="180">180 дней</SelectItem>
                <SelectItem value="365">365 дней</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold">Тестирование: кол-во/день</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="testedQty" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Размещение: кол-во/день</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="placedQty" stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Первичное размещение: кол-во/день</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="primaryQty" stroke="#ffc658" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Сумма/день и SKU без цены</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="totalAmount" fill="#8884d8" name="Сумма" />
                <Bar dataKey="noPriceSku" fill="#ff4d4f" name="SKU без цены" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
