import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InventoryItem, PendingPlacement } from "@shared/schema";

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

interface WarehouseSetting {
  id: string;
  locationPattern: string;
  tsku: number;
  maxq: number;
}

type ComparisonOperator = "lt" | "gt" | "eq";

export default function WarehouseLoadingSidebar() {
  // Filters
  const [filterLetter, setFilterLetter] = useState("");
  const [tskuOperator, setTskuOperator] = useState<ComparisonOperator>("lt");
  const [tskuValue, setTskuValue] = useState("3");
  const [quantityOperator, setQuantityOperator] = useState<ComparisonOperator>("lt");
  const [quantityValue, setQuantityValue] = useState("");

  // Fetch inventory
  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  // Fetch pending placements
  const { data: pendingPlacements = [] } = useQuery<PendingPlacement[]>({
    queryKey: ["/api/pending-placements"],
  });

  // Fetch warehouse settings
  const { data: settings = [] } = useQuery<WarehouseSetting[]>({
    queryKey: ["/api/warehouse-settings"],
  });

  // Get last pending placement for "Info about item"
  const lastPendingPlacement = pendingPlacements.length > 0 ? pendingPlacements[pendingPlacements.length - 1] : null;

  // Group inventory by location
  const locationGroups = useMemo(() => {
    const groups = new Map<string, LocationGroup>();

    inventory.forEach((item) => {
      const loc = item.location;
      if (!groups.has(loc)) {
        groups.set(loc, {
          location: loc,
          skuCount: 0,
          totalQuantity: 0,
          items: [],
        });
      }

      const group = groups.get(loc)!;
      group.skuCount++;
      group.totalQuantity += item.quantity;
      group.items.push({
        sku: item.sku,
        name: item.name || "",
        quantity: item.quantity,
        barcode: item.barcode || undefined,
      });
    });

    return Array.from(groups.values()).sort((a, b) => 
      a.location.localeCompare(b.location)
    );
  }, [inventory]);

  // Apply filters
  const filteredLocations = useMemo(() => {
    return locationGroups.filter((group) => {
      // Letter filter
      if (filterLetter && !group.location.toUpperCase().startsWith(filterLetter.toUpperCase())) {
        return false;
      }

      // TSKU filter
      if (tskuValue) {
        const value = parseInt(tskuValue);
        if (!isNaN(value)) {
          if (tskuOperator === "lt" && group.skuCount >= value) return false;
          if (tskuOperator === "gt" && group.skuCount <= value) return false;
          if (tskuOperator === "eq" && group.skuCount !== value) return false;
        }
      }

      // Quantity filter
      if (quantityValue) {
        const value = parseInt(quantityValue);
        if (!isNaN(value)) {
          if (quantityOperator === "lt" && group.totalQuantity >= value) return false;
          if (quantityOperator === "gt" && group.totalQuantity <= value) return false;
          if (quantityOperator === "eq" && group.totalQuantity !== value) return false;
        }
      }

      return true;
    });
  }, [locationGroups, filterLetter, tskuOperator, tskuValue, quantityOperator, quantityValue]);

  // Get color for location based on TSKU and MAXQ settings
  const getLocationColor = (group: LocationGroup) => {
    const matchingSetting = settings.find(s => 
      group.location.toUpperCase().match(new RegExp(`^${s.locationPattern.replace('*', '.*')}$`))
    );

    if (!matchingSetting) return "bg-muted text-muted-foreground";

    const tskuViolation = group.skuCount > matchingSetting.tsku;
    const maxqViolation = group.totalQuantity > matchingSetting.maxq;

    if (tskuViolation || maxqViolation) {
      return "bg-destructive/10 text-destructive border-destructive";
    }
    
    if (group.skuCount === matchingSetting.tsku || group.totalQuantity === matchingSetting.maxq) {
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/50";
    }

    return "bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/50";
  };

  // Group locations into columns (7 columns) by numeric ranges
  // Column 0: 1-99, Column 1: 100-199, Column 2: 200-299, etc.
  const locationColumns = useMemo(() => {
    const columns: LocationGroup[][] = [[], [], [], [], [], [], []];
    
    filteredLocations.forEach((group) => {
      // Extract numeric part from location (e.g., "A123" -> 123)
      const match = group.location.match(/\d+/);
      if (!match) {
        // If no number, put in first column
        columns[0].push(group);
        return;
      }
      
      const num = parseInt(match[0]);
      // Determine column based on range: 1-99->0, 100-199->1, 200-299->2, etc.
      const columnIndex = Math.min(Math.floor(num / 100), 6);
      columns[columnIndex].push(group);
    });
    
    // Sort locations within each column
    columns.forEach(column => {
      column.sort((a, b) => a.location.localeCompare(b.location));
    });
    
    return columns;
  }, [filteredLocations]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Загрузка склада</h2>
      </div>

      {/* Filters - all in one horizontal line */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-end gap-2">
          {/* Letter filter */}
          <div className="flex-shrink-0" style={{ width: "70px" }}>
            <Label htmlFor="filter-letter" className="text-xs">Буква</Label>
            <Input
              id="filter-letter"
              value={filterLetter}
              onChange={(e) => setFilterLetter(e.target.value.toUpperCase())}
              placeholder="A"
              maxLength={1}
              className="h-8 text-sm"
              data-testid="input-filter-letter"
            />
          </div>

          {/* TSKU filter */}
          <div className="flex-shrink-0 flex gap-1" style={{ width: "110px" }}>
            <div style={{ width: "45px" }}>
              <Label className="text-xs">TSKU</Label>
              <Select value={tskuOperator} onValueChange={(v) => setTskuOperator(v as ComparisonOperator)}>
                <SelectTrigger className="h-8 text-xs px-1" data-testid="select-tsku-operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="eq">=</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ width: "60px" }}>
              <Label className="text-xs opacity-0">.</Label>
              <Input
                type="number"
                value={tskuValue}
                onChange={(e) => setTskuValue(e.target.value)}
                className="h-8 text-sm"
                placeholder="3"
                data-testid="input-tsku-value"
              />
            </div>
          </div>

          {/* Quantity filter */}
          <div className="flex-shrink-0 flex gap-1" style={{ width: "110px" }}>
            <div style={{ width: "45px" }}>
              <Label className="text-xs">Кол-во</Label>
              <Select value={quantityOperator} onValueChange={(v) => setQuantityOperator(v as ComparisonOperator)}>
                <SelectTrigger className="h-8 text-xs px-1" data-testid="select-quantity-operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="eq">=</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ width: "60px" }}>
              <Label className="text-xs opacity-0">.</Label>
              <Input
                type="number"
                value={quantityValue}
                onChange={(e) => setQuantityValue(e.target.value)}
                className="h-8 text-sm"
                placeholder=""
                data-testid="input-quantity-value"
              />
            </div>
          </div>
        </div>

        {/* Reset button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterLetter("");
            setTskuOperator("lt");
            setTskuValue("3");
            setQuantityOperator("lt");
            setQuantityValue("");
          }}
          className="w-full h-7 text-xs"
          data-testid="button-reset-filters"
        >
          Сбросить
        </Button>
      </div>

      {/* Compact Item Information Table */}
      {lastPendingPlacement && (
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold mb-2">Информация о товаре</h3>
          <div className="space-y-1 text-xs">
            {/* ID and Name on one line */}
            <div className="flex gap-1">
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">ID: </span>
                <span className="font-mono text-[10px]">{lastPendingPlacement.productId || "-"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">Название: </span>
                <span className="truncate text-[10px]">{lastPendingPlacement.name || "-"}</span>
              </div>
            </div>
            
            {/* Quantity and Barcode on one line */}
            <div className="flex gap-1">
              <div style={{ width: "33%" }}>
                <span className="text-muted-foreground">Кол-во: </span>
                <span className="font-semibold text-[10px]">{lastPendingPlacement.quantity}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">Штрихкод: </span>
                <span className="font-mono text-[10px]">{lastPendingPlacement.barcode}</span>
              </div>
            </div>
            
            {/* SKU, Location, Condition in one row */}
            <div className="flex gap-1">
              <div style={{ width: "33%" }}>
                <span className="text-muted-foreground text-[10px]">SKU: </span>
                <span className="font-mono text-[10px]">{lastPendingPlacement.sku}</span>
              </div>
              <div style={{ width: "33%" }}>
                <span className="text-muted-foreground text-[10px]">Лок: </span>
                <span className="font-mono text-[10px]">{lastPendingPlacement.location}</span>
              </div>
              <div style={{ width: "33%" }}>
                <span className="text-muted-foreground text-[10px]">Сост: </span>
                <span className="text-[10px]">{lastPendingPlacement.condition}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Locations table - 7 columns */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-7 gap-1">
          {locationColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-1">
              {column.map((group) => (
                <div
                  key={group.location}
                  className={`rounded border p-1 text-center ${getLocationColor(group)}`}
                  data-testid={`location-${group.location}`}
                >
                  <div className="font-mono font-semibold" style={{ fontSize: "10px" }}>
                    {group.location}
                  </div>
                  <div className="text-xs">
                    <div style={{ fontSize: "9px" }}>
                      SKU: {group.skuCount}
                    </div>
                    <div style={{ fontSize: "9px" }}>
                      Qty: {group.totalQuantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {filteredLocations.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Нет локаций, соответствующих фильтрам
          </div>
        )}
      </div>
    </div>
  );
}
