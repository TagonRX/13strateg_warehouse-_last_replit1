import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LocationGroup {
  location: string;
  skuCount: number;
  totalQuantity: number;
  items: {
    sku: string;
    name: string;
    quantity: number;
    barcode?: string;
  }[];
}

interface WarehouseLoadingViewProps {
  locationGroups: LocationGroup[];
}

export default function WarehouseLoadingView({ locationGroups }: WarehouseLoadingViewProps) {
  const [tsku, setTsku] = useState(4);
  const [maxq, setMaxq] = useState(10);

  const getSkuColor = (skuCount: number) => {
    if (skuCount >= tsku) return "bg-red-500/20 text-red-700 dark:text-red-400";
    if (skuCount === tsku - 1) return "bg-orange-500/20 text-orange-700 dark:text-orange-400";
    if (skuCount === tsku - 2) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    return "bg-green-500/20 text-green-700 dark:text-green-400";
  };

  const getQuantityColor = (quantity: number) => {
    if (quantity >= maxq) return "bg-red-500/20 text-red-700 dark:text-red-400";
    const ratio = quantity / maxq;
    if (ratio >= 0.8) return "bg-orange-500/20 text-orange-700 dark:text-orange-400";
    if (ratio >= 0.5) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    return "bg-green-500/20 text-green-700 dark:text-green-400";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Настройки порогов загрузки</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tsku">TSKU (макс. SKU в локации)</Label>
              <Input
                id="tsku"
                type="number"
                min="1"
                value={tsku}
                onChange={(e) => setTsku(parseInt(e.target.value) || 4)}
                data-testid="input-tsku"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxq">MAXQ (макс. кол-во товаров)</Label>
              <Input
                id="maxq"
                type="number"
                min="1"
                value={maxq}
                onChange={(e) => setMaxq(parseInt(e.target.value) || 10)}
                data-testid="input-maxq"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Загрузка склада по локациям</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono">Локация</TableHead>
                  <TableHead className="text-center">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">TSKU: {tsku}</div>
                      <div>Кол-во SKU</div>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">MAXQ: {maxq}</div>
                      <div>Всего товаров</div>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationGroups.map((group) => (
                  <TableRow key={group.location} data-testid={`row-location-${group.location}`}>
                    <TableCell className="font-mono font-semibold">{group.location}</TableCell>
                    <TableCell className={`text-center font-bold ${getSkuColor(group.skuCount)}`}>
                      {group.skuCount}
                    </TableCell>
                    <TableCell className={`text-center font-bold ${getQuantityColor(group.totalQuantity)}`}>
                      {group.totalQuantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Легенда раскраски</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="font-semibold mb-2">Кол-во SKU:</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-green-500/20"></div>
                <span>0-{tsku - 3}: Норма</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-yellow-500/20"></div>
                <span>{tsku - 2}: Внимание</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-orange-500/20"></div>
                <span>{tsku - 1}: Предупреждение</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-500/20"></div>
                <span>{tsku}+: Перегрузка</span>
              </div>
            </div>
          </div>
          <div>
            <div className="font-semibold mb-2">Всего товаров:</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-green-500/20"></div>
                <span>0-{Math.floor(maxq * 0.5)}: Низкая загрузка</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-yellow-500/20"></div>
                <span>{Math.floor(maxq * 0.5)}-{Math.floor(maxq * 0.8)}: Средняя загрузка</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-orange-500/20"></div>
                <span>{Math.floor(maxq * 0.8)}-{maxq - 1}: Высокая загрузка</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-500/20"></div>
                <span>{maxq}+: Критическая</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
