import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import ScannerMode from "./ScannerMode";
import { Download } from "lucide-react";
import type { PendingPlacement, InventoryItem } from "@shared/schema";
import { useEffect, useRef } from "react";
import SkuErrorsView from "@/components/SkuErrorsView";

export default function OnlineListings() {
    const awaitingRef = useRef<HTMLDivElement | null>(null);

  // Pending placement (ожидает первичного размещения)
  const { data: pendingPlacements = [], isLoading: loadingPending } = useQuery<PendingPlacement[]>({
    queryKey: ["/api/pending-placements"],
  });

  // Items awaiting listing (без названия, но уже приняты/отсканированы)
  const { data: inventory = [], isLoading: loadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const awaitingListing = (inventory || []).filter((i) => !i.name || i.name.trim() === "");

  const exportAwaitingCsv = () => {
    const rows = awaitingListing.map((i) => ({
      date: i.createdAt ? new Date(i.createdAt as any).toISOString().slice(0,10) : "",
      sku: i.sku,
      location: i.location,
      quantity: i.quantity,
      barcode: i.barcode || "",
    }));
    const header = ["date","sku","location","quantity","barcode"];
    const csv = [header.join(","), ...rows.map(r => [r.date,r.sku,r.location,String(r.quantity),r.barcode].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `awaiting-listing-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Аналитика перенесена на главную страницу для админа

  // Handle focus param to auto-scroll/highlight awaiting section
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (focus === "awaiting" && awaitingRef.current) {
      awaitingRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      awaitingRef.current.classList.add("ring-2", "ring-red-500");
      const t = setTimeout(() => {
        awaitingRef.current && awaitingRef.current.classList.remove("ring-2", "ring-red-500");
      }, 2000);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Online listings</h1>

      {/* Раздел: Ошибки SKU (первым) */}
      <SkuErrorsView />

      {/* Раздел: Сканер */}
      <Card>
        <CardContent className="pt-6">
          <ScannerMode />
        </CardContent>
      </Card>

      {/* Раздел: Ожидает первичного размещения */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Ожидает первичного размещения</h2>
            {loadingPending && <span className="text-sm text-muted-foreground">Загрузка…</span>}
          </div>
          {pendingPlacements.length === 0 ? (
            <Alert>
              <AlertDescription>Нет товаров в ожидании первичного размещения</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Баркод</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPlacements.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell>{p.quantity}</TableCell>
                    <TableCell className="font-mono text-xs">{(p as any).barcode || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Раздел: Ожидает листинга */}
      <Card ref={awaitingRef as any}>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Ожидает листинга</h2>
            <div className="flex items-center gap-2">
              {loadingInventory && <span className="text-sm text-muted-foreground">Загрузка…</span>}
              <Button variant="outline" size="sm" onClick={exportAwaitingCsv}>
                <Download className="w-4 h-4 mr-2" />Экспорт CSV
              </Button>
            </div>
          </div>
          {awaitingListing.length === 0 ? (
            <Alert>
              <AlertDescription>Нет товаров, ожидающих листинг</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Локация</TableHead>
                  <TableHead>Баркоды</TableHead>
                  <TableHead>Создано</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awaitingListing.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-sm">{i.sku}</TableCell>
                    <TableCell>{i.quantity}</TableCell>
                    <TableCell className="font-mono text-xs">{i.location}</TableCell>
                    <TableCell className="font-mono text-[10px]">{i.barcode || "-"}</TableCell>
                    <TableCell className="text-xs">{i.createdAt ? new Date(i.createdAt as any).toLocaleDateString() : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Аналитика перенесена на главную страницу администратора */}
    </div>
  );
}
