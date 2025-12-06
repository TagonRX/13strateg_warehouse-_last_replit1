import { useState } from "react";
import { getAuthToken } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function ATPWidget() {
  const { data = [] } = useQuery<Array<{ sku: string; onHand: number; reserved: number; atp: number }>>({
    queryKey: ["/api/inventory/atp"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/inventory/atp", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Failed to fetch ATP");
      return res.json();
    },
  });

  const [q, setQ] = useState("");
  const filtered = data.filter(row => row.sku.toUpperCase().includes(q.trim().toUpperCase()));

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Свободный остаток (доступно к продаже)</div>
          <Input placeholder="Фильтр по SKU" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-8 text-sm" />
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>На складе</TableHead>
                <TableHead>В резерве</TableHead>
                <TableHead>Свободно</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(row => (
                <TableRow key={row.sku}>
                  <TableCell className="font-mono">{row.sku}</TableCell>
                  <TableCell>{row.onHand}</TableCell>
                  <TableCell>{row.reserved}</TableCell>
                  <TableCell className={row.atp < 0 ? 'text-red-600' : row.atp === 0 ? 'text-yellow-600' : 'text-green-600'}>{row.atp}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">Нет данных</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
