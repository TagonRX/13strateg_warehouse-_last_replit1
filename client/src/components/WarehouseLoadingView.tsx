import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

interface LetterData {
  letter: string;
  locations: LocationGroup[];
}

export default function WarehouseLoadingView({ locationGroups }: WarehouseLoadingViewProps) {
  const [tsku, setTsku] = useState(4);
  const [maxq, setMaxq] = useState(10);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [limitFilter, setLimitFilter] = useState<string>("50");

  // Parse location filter input - support comma, space, or newline separated
  const parseLocationFilter = (input: string): Set<string> => {
    if (!input.trim()) return new Set();
    
    return new Set(
      input
        .toUpperCase()
        .split(/[\s,\n]+/)
        .map(loc => loc.trim())
        .filter(loc => loc.length > 0)
    );
  };

  // Filter locations based on input
  const filteredLocations = useMemo(() => {
    const filterSet = parseLocationFilter(locationFilter);
    
    // If no filter, show all locations
    if (filterSet.size === 0) {
      const limit = limitFilter === "all" ? locationGroups.length : parseInt(limitFilter);
      return locationGroups.slice(0, limit);
    }
    
    // Filter by exact location match
    const filtered = locationGroups.filter(loc => filterSet.has(loc.location.toUpperCase()));
    const limit = limitFilter === "all" ? filtered.length : parseInt(limitFilter);
    return filtered.slice(0, limit);
  }, [locationGroups, locationFilter, limitFilter]);

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
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Настройки порогов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tsku">TSKU (макс. SKU)</Label>
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
              <Label htmlFor="maxq">MAXQ (макс. товаров)</Label>
              <Input
                id="maxq"
                type="number"
                min="1"
                value={maxq}
                onChange={(e) => setMaxq(parseInt(e.target.value) || 10)}
                data-testid="input-maxq"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Показать локаций</Label>
              <Select value={limitFilter} onValueChange={setLimitFilter}>
                <SelectTrigger data-testid="select-limit-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="all">Все</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location filter */}
      <Card>
        <CardHeader>
          <CardTitle>Фильтр локаций</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="location-filter">
              Введите локации (через пробел, запятую или с новой строки)
            </Label>
            <Textarea
              id="location-filter"
              placeholder="Например: A101 A102 B101 или A101, A102, B101"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              rows={4}
              data-testid="textarea-location-filter"
              className="font-mono"
            />
            <p className="text-sm text-muted-foreground">
              {locationFilter.trim() 
                ? `Фильтр активен: ${parseLocationFilter(locationFilter).size} локаций` 
                : "Показываются все локации"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Warehouse loading data - grid layout for individual locations */}
      <Card>
        <CardHeader>
          <CardTitle>Загрузка склада ({filteredLocations.length} локаций)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredLocations.map((location) => (
              <div
                key={location.location}
                className="border rounded-md p-3 space-y-2 hover-elevate"
                data-testid={`location-${location.location}`}
              >
                <div className="font-mono font-semibold text-sm truncate" title={location.location}>
                  {location.location}
                </div>
                <div className="flex justify-between items-center gap-2">
                  <div className="text-xs text-muted-foreground">SKU:</div>
                  <Badge
                    variant="outline"
                    className={`${getSkuColor(location.skuCount)} border-0 text-xs px-2 py-0`}
                  >
                    {location.skuCount}
                  </Badge>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <div className="text-xs text-muted-foreground">Товары:</div>
                  <Badge
                    variant="outline"
                    className={`${getQuantityColor(location.totalQuantity)} border-0 text-xs px-2 py-0`}
                  >
                    {location.totalQuantity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Легенда</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-semibold mb-2 text-sm">Кол-во SKU:</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500/20"></div>
                <span>Норма</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-500/20"></div>
                <span>Внимание</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500/20"></div>
                <span>Предупреждение</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500/20"></div>
                <span>Перегрузка</span>
              </div>
            </div>
          </div>
          <div>
            <div className="font-semibold mb-2 text-sm">Всего товаров:</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500/20"></div>
                <span>Низкая</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-500/20"></div>
                <span>Средняя</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500/20"></div>
                <span>Высокая</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500/20"></div>
                <span>Критическая</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
