import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  ranges: {
    range: string; // e.g., "A1" (A100-A199), "A2" (A200-A299)
    locations: LocationGroup[];
    skuCount: number;
    totalQuantity: number;
  }[];
}

export default function WarehouseLoadingView({ locationGroups }: WarehouseLoadingViewProps) {
  const [tsku, setTsku] = useState(4);
  const [maxq, setMaxq] = useState(10);
  const [selectedLetters, setSelectedLetters] = useState<Set<string>>(new Set());

  // Extract letter from location (e.g., "A101" -> "A", "ZW-F232" -> "ZW")
  const extractLetter = (location: string): string => {
    const match = location.match(/^([A-Z]+)/);
    return match ? match[1] : "OTHER";
  };

  // Extract range number (e.g., "A101" -> "1", "A255" -> "2")
  const extractRange = (location: string, letter: string): string => {
    if (letter === "OTHER") return "0";
    const numberPart = location.slice(letter.length);
    const firstDigit = numberPart.match(/^(\d)/)?.[1];
    return firstDigit || "0";
  };

  // Group locations by letter and range
  const letterData = useMemo<LetterData[]>(() => {
    const letterMap = new Map<string, Map<string, LocationGroup[]>>();

    locationGroups.forEach((group) => {
      const letter = extractLetter(group.location);
      const range = extractRange(group.location, letter);
      const rangeKey = letter === "OTHER" ? "Прочее" : `${letter}${range}`;

      if (!letterMap.has(letter)) {
        letterMap.set(letter, new Map());
      }

      const rangeMap = letterMap.get(letter)!;
      if (!rangeMap.has(rangeKey)) {
        rangeMap.set(rangeKey, []);
      }

      rangeMap.get(rangeKey)!.push(group);
    });

    // Convert to array and calculate totals
    const result: LetterData[] = [];
    letterMap.forEach((rangeMap, letter) => {
      const ranges = Array.from(rangeMap.entries()).map(([rangeKey, locations]) => ({
        range: rangeKey,
        locations,
        skuCount: locations.reduce((sum, loc) => sum + loc.skuCount, 0),
        totalQuantity: locations.reduce((sum, loc) => sum + loc.totalQuantity, 0),
      }));

      result.push({ letter, ranges });
    });

    // Sort: regular letters alphabetically, OTHER at the end
    return result.sort((a, b) => {
      if (a.letter === "OTHER") return 1;
      if (b.letter === "OTHER") return -1;
      return a.letter.localeCompare(b.letter);
    });
  }, [locationGroups]);

  // Get all unique letters for checkboxes
  const allLetters = useMemo(() => {
    return letterData.map(ld => ld.letter);
  }, [letterData]);

  // Toggle letter selection
  const toggleLetter = (letter: string) => {
    setSelectedLetters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(letter)) {
        newSet.delete(letter);
      } else {
        newSet.add(letter);
      }
      return newSet;
    });
  };

  // Select all/none
  const selectAll = () => {
    setSelectedLetters(new Set(allLetters));
  };

  const selectNone = () => {
    setSelectedLetters(new Set());
  };

  // Filter data based on selected letters
  const filteredData = useMemo(() => {
    if (selectedLetters.size === 0) return letterData;
    return letterData.filter(ld => selectedLetters.has(ld.letter));
  }, [letterData, selectedLetters]);

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Letter filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Фильтр по буквам</CardTitle>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-sm text-primary hover:underline"
                data-testid="button-select-all"
              >
                Все
              </button>
              <button
                onClick={selectNone}
                className="text-sm text-primary hover:underline"
                data-testid="button-select-none"
              >
                Сброс
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {allLetters.map((letter) => (
              <div key={letter} className="flex items-center space-x-2">
                <Checkbox
                  id={`letter-${letter}`}
                  checked={selectedLetters.has(letter)}
                  onCheckedChange={() => toggleLetter(letter)}
                  data-testid={`checkbox-letter-${letter}`}
                />
                <label
                  htmlFor={`letter-${letter}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {letter === "OTHER" ? "Прочее" : letter}
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Warehouse loading data - horizontal scroll */}
      <Card>
        <CardHeader>
          <CardTitle>Загрузка склада</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-4 p-6">
              {filteredData.map((letterGroup) => (
                <Card key={letterGroup.letter} className="flex-shrink-0 w-64">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-center">
                      {letterGroup.letter === "OTHER" ? "Прочее" : letterGroup.letter}
                    </CardTitle>
                    <div className="flex justify-center gap-4 text-xs text-muted-foreground pt-1">
                      <span>TSKU: {tsku}</span>
                      <span>MAXQ: {maxq}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {letterGroup.ranges.map((range) => (
                      <div
                        key={range.range}
                        className="border rounded-md p-3 space-y-2"
                        data-testid={`range-${range.range}`}
                      >
                        <div className="font-mono font-semibold text-sm">{range.range}</div>
                        <div className="flex justify-between items-center gap-2">
                          <div className="text-xs text-muted-foreground">SKU:</div>
                          <Badge
                            variant="outline"
                            className={`${getSkuColor(range.skuCount)} border-0 text-xs px-2 py-0`}
                          >
                            {range.skuCount}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <div className="text-xs text-muted-foreground">Товары:</div>
                          <Badge
                            variant="outline"
                            className={`${getQuantityColor(range.totalQuantity)} border-0 text-xs px-2 py-0`}
                          >
                            {range.totalQuantity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
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
