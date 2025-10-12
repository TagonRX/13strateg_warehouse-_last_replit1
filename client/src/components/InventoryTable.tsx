import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

interface InventoryItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  barcode?: string;
  status: "IN_STOCK" | "PICKED";
}

interface InventoryTableProps {
  items: InventoryItem[];
}

export default function InventoryTable({ items }: InventoryTableProps) {
  const [search, setSearch] = useState("");

  const filteredItems = items.filter(
    (item) =>
      item.productId.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalInStock = items.filter((i) => i.status === "IN_STOCK").reduce((sum, i) => sum + i.quantity, 0);
  const totalPicked = items.filter((i) => i.status === "PICKED").reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <CardTitle>Инвентаризация</CardTitle>
          <div className="flex gap-4">
            <Badge variant="outline" className="bg-success/10">
              В наличии: {totalInStock}
            </Badge>
            <Badge variant="outline" className="bg-muted">
              Собрано: {totalPicked}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ID, названию или SKU..."
            className="pl-10"
            data-testid="input-search-inventory"
          />
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID товара</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Локация</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead>Штрихкод</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                  <TableCell className="font-mono text-sm">{item.productId}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="font-mono">{item.sku}</TableCell>
                  <TableCell className="font-mono">{item.location}</TableCell>
                  <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                  <TableCell className="font-mono text-sm">{item.barcode || "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={item.status === "IN_STOCK" ? "default" : "secondary"}
                      data-testid={`badge-status-${item.id}`}
                    >
                      {item.status === "IN_STOCK" ? "В наличии" : "Собрано"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Товары не найдены
          </div>
        )}
      </CardContent>
    </Card>
  );
}
