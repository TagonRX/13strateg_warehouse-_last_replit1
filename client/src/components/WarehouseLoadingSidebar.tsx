import { useState, useMemo } from "react";
import { parseSku, compareSequential, compareGroup } from "@shared/utils/sku";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, PackageX } from "lucide-react";
import type { InventoryItem, PendingPlacement, ActiveLocation } from "@shared/schema";

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

interface WarehouseLoadingSidebarProps {
  onLocationClick?: (location: string) => void;
}

export default function WarehouseLoadingSidebar({ onLocationClick }: WarehouseLoadingSidebarProps = {}) {
  // Filters
  const [filterLetters, setFilterLetters] = useState<string>(""); // e.g. "A,N,L"
  const [sortMode, setSortMode] = useState<"sequential"|"group">("sequential");
  const [sortDirection, setSortDirection] = useState<"asc"|"desc">("asc");
  const [tskuOperator, setTskuOperator] = useState<ComparisonOperator>("lt");
  const [tskuValue, setTskuValue] = useState("3");
  const [quantityOperator, setQuantityOperator] = useState<ComparisonOperator>("lt");
  const [quantityValue, setQuantityValue] = useState("");
  
  // Modal for SKU list
  const [selectedLocationGroup, setSelectedLocationGroup] = useState<LocationGroup | null>(null);
  const [skuModalOpen, setSkuModalOpen] = useState(false);

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

  // Fetch active (managed) locations
  const { data: activeLocations = [] } = useQuery<ActiveLocation[]>({
    queryKey: ["/api/warehouse/active-locations"],
  });

  // Get last pending placement for "Info about item"
  const lastPendingPlacement = pendingPlacements.length > 0 ? pendingPlacements[pendingPlacements.length - 1] : null;

  // Create set of managed locations for filtering
  const managedLocationsSet = useMemo(() => {
    return new Set(activeLocations.map(loc => loc.location.toUpperCase()));
  }, [activeLocations]);

  // Group inventory by location (filtered by managed locations only)
  const locationGroups = useMemo(() => {
    const groups = new Map<string, LocationGroup>();

    inventory.forEach((item) => {
      const loc = item.location;
      
      // Filter: only include items in managed locations
      if (managedLocationsSet.size > 0 && !managedLocationsSet.has(loc.toUpperCase())) {
        return;
      }

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
  }, [inventory, managedLocationsSet]);

  // Helpers
  const getPrefix = (loc: string) => parseSku(loc).prefix;
  const getNumber = (loc: string) => {
    const n = parseSku(loc).number;
    return n == null ? NaN : n;
  };

  const selectedLetters = useMemo(() => filterLetters.split(/[,\s]+/).map(s=>s.trim().toUpperCase()).filter(Boolean), [filterLetters]);

  // Apply filters
  const filteredLocations = useMemo(() => {
    return locationGroups.filter((group) => {
      // Letters filter
      if (selectedLetters.length > 0) {
        const pref = getPrefix(group.location);
        if (!selectedLetters.includes(pref)) return false;
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
  }, [locationGroups, selectedLetters, tskuOperator, tskuValue, quantityOperator, quantityValue]);

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

    const sorted = [...filteredLocations].sort((a,b) => {
      const pa = getPrefix(a.location);
      const pb = getPrefix(b.location);
      const na = getNumber(a.location);
      const nb = getNumber(b.location);

      // Order by selected letters as entered
      const ia = selectedLetters.length ? selectedLetters.indexOf(pa) : -1;
      const ib = selectedLetters.length ? selectedLetters.indexOf(pb) : -1;
      if (ia !== ib) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }

      if (sortMode === "sequential") {
        return compareSequential(isNaN(na) ? null : na, isNaN(nb) ? null : nb, sortDirection);
      } else {
        return compareGroup(isNaN(na) ? null : na, isNaN(nb) ? null : nb, sortDirection);
      }
    });

    sorted.forEach((group) => {
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
    
    // Keep order as pre-sorted
    
    return columns;
  }, [filteredLocations, selectedLetters, sortMode, sortDirection]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Загрузка склада</h2>
      </div>

      {/* Filters - all in one horizontal line */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-end gap-2">
          {/* Letters filter */}
          <div className="flex-shrink-0" style={{ width: "140px" }}>
            <Label htmlFor="filter-letters" className="text-xs">Буквы (A,N,L)</Label>
            <Input
              id="filter-letters"
              value={filterLetters}
              onChange={(e) => setFilterLetters(e.target.value.toUpperCase())}
              placeholder="A,N,L"
              className="h-8 text-sm"
              data-testid="input-filter-letters"
            />
          </div>

          {/* Sort mode */}
          <div className="flex-shrink-0" style={{ width: "140px" }}>
            <Label className="text-xs">Режим</Label>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
              <SelectTrigger className="h-8 text-xs px-1" data-testid="select-sort-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Последовательный</SelectItem>
                <SelectItem value="group">Групповой</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Direction */}
          <div className="flex-shrink-0" style={{ width: "110px" }}>
            <Label className="text-xs">Направление</Label>
            <Select value={sortDirection} onValueChange={(v) => setSortDirection(v as any)}>
              <SelectTrigger className="h-8 text-xs px-1" data-testid="select-sort-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">↑ Возрастание</SelectItem>
                <SelectItem value="desc">↓ Убывание</SelectItem>
              </SelectContent>
            </Select>
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
            setFilterLetters("");
            setSortMode("sequential");
            setSortDirection("asc");
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
                  className={`rounded border p-1 text-center cursor-pointer hover-elevate active-elevate-2 ${getLocationColor(group)}`}
                  data-testid={`location-${group.location}`}
                  onClick={() => {
                    setSelectedLocationGroup(group);
                    setSkuModalOpen(true);
                  }}
                  title="Нажмите, чтобы увидеть SKU в этой локации"
                >
                  <div className="font-mono font-semibold" style={{ fontSize: "11px" }}>
                    {group.location}
                  </div>
                  <div style={{ fontSize: "9px" }}>
                    TSKU: {group.skuCount} | Qty: {group.totalQuantity}
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

      {/* SKU Modal for selected location */}
      <Dialog open={skuModalOpen} onOpenChange={setSkuModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Локация: {selectedLocationGroup?.location}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {selectedLocationGroup?.items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <PackageX className="w-5 h-5" />
                <span>Локация пустая</span>
              </div>
            ) : (
              selectedLocationGroup?.items.map((item, index) => (
                <div
                  key={`${item.sku}-${index}`}
                  className={`p-2 rounded-md border flex items-center justify-between ${
                    item.quantity > 0
                      ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                      : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-medium truncate">{item.sku}</div>
                    {item.name && (
                      <div className="text-xs text-muted-foreground truncate">{item.name}</div>
                    )}
                    {item.barcode && (
                      <div className="text-xs text-muted-foreground font-mono">{item.barcode}</div>
                    )}
                  </div>
                  <div className={`font-semibold text-lg ml-2 ${
                    item.quantity > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  }`}>
                    {item.quantity}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (selectedLocationGroup) {
                  onLocationClick?.(selectedLocationGroup.location);
                }
                setSkuModalOpen(false);
              }}
            >
              Вставить локацию
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSkuModalOpen(false)}
            >
              Закрыть
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
