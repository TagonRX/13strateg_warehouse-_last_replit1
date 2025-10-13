import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Trash2 } from "lucide-react";

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

interface ActiveLocation {
  id: string;
  location: string;
  isActive: boolean;
}

interface WarehouseLoadingViewProps {
  locationGroups: LocationGroup[];
  userRole: "admin" | "worker";
}

// Settings Panel Component
function WarehouseSettingsPanel({ 
  settings, 
  onUpdate,
  onDelete,
  isDeleting 
}: { 
  settings: WarehouseSetting[]; 
  onUpdate: (setting: { locationPattern: string; tsku: number; maxq: number }) => void;
  onDelete: (locationPattern: string) => void;
  isDeleting?: boolean;
}) {
  const [newPattern, setNewPattern] = useState("");
  const [newTsku, setNewTsku] = useState("4");
  const [newMaxq, setNewMaxq] = useState("10");

  const handleAdd = () => {
    if (!newPattern.trim()) return;
    onUpdate({
      locationPattern: newPattern.toUpperCase(),
      tsku: parseInt(newTsku) || 4,
      maxq: parseInt(newMaxq) || 10,
    });
    setNewPattern("");
    setNewTsku("4");
    setNewMaxq("10");
  };

  return (
    <div className="space-y-4">
      {/* Existing settings */}
      {settings.length > 0 && (
        <div className="rounded-md border">
          <div className="grid grid-cols-4 gap-4 p-3 font-medium bg-muted/50">
            <div>Группа локаций</div>
            <div>TSKU</div>
            <div>MAXQ</div>
            <div>Действия</div>
          </div>
          {settings.map((setting) => (
            <div key={setting.id} className="grid grid-cols-4 gap-4 p-3 border-t" data-testid={`setting-row-${setting.locationPattern}`}>
              <div className="font-mono font-semibold">{setting.locationPattern}</div>
              <div>{setting.tsku}</div>
              <div>{setting.maxq}</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewPattern(setting.locationPattern);
                    setNewTsku(setting.tsku.toString());
                    setNewMaxq(setting.maxq.toString());
                  }}
                  data-testid={`button-edit-${setting.locationPattern}`}
                >
                  Редактировать
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(setting.locationPattern)}
                  disabled={isDeleting}
                  data-testid={`button-delete-${setting.locationPattern}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new setting */}
      <div className="rounded-md border p-4">
        <h3 className="text-sm font-semibold mb-3">Добавить/обновить настройку</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pattern">Группа (например, A1, B1)</Label>
            <Input
              id="pattern"
              placeholder="A1"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value.toUpperCase())}
              className="font-mono"
              data-testid="input-pattern"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tsku">TSKU</Label>
            <Input
              id="tsku"
              type="number"
              value={newTsku}
              onChange={(e) => setNewTsku(e.target.value)}
              data-testid="input-tsku"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxq">MAXQ</Label>
            <Input
              id="maxq"
              type="number"
              value={newMaxq}
              onChange={(e) => setNewMaxq(e.target.value)}
              data-testid="input-maxq"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} className="w-full" data-testid="button-add-setting">
              <Plus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Группа локаций определяется первой буквой и первой цифрой (например, A1 для A100-A199)
      </p>
    </div>
  );
}

export default function WarehouseLoadingView({ locationGroups, userRole }: WarehouseLoadingViewProps) {
  const { toast } = useToast();
  const [locationInput, setLocationInput] = useState<string>("");
  const [letterFilter, setLetterFilter] = useState<string[]>([]); // Multi-select letter filter
  const [limitFilter, setLimitFilter] = useState<string>("100");
  const [tskuFilter, setTskuFilter] = useState<string>("");
  const [maxqFilter, setMaxqFilter] = useState<string>("");

  // Fetch active locations
  const { data: activeLocations = [] } = useQuery<ActiveLocation[]>({
    queryKey: ["/api/warehouse/active-locations"],
  });

  // Fetch warehouse settings (all users need TSKU/MAXQ data for filters and display)
  const { data: warehouseSettings = [] } = useQuery<WarehouseSetting[]>({
    queryKey: ["/api/warehouse/settings"],
  });

  // Set active locations mutation
  const setLocationsMutation = useMutation({
    mutationFn: async (locations: string[]) => {
      const res = await apiRequest("POST", "/api/warehouse/active-locations", { locations });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/active-locations"] });
      toast({
        title: "Локации сохранены",
        description: "Активные локации успешно обновлены",
      });
    },
  });

  // Upsert warehouse setting mutation
  const upsertSettingMutation = useMutation({
    mutationFn: async (setting: { locationPattern: string; tsku: number; maxq: number }) => {
      const res = await apiRequest("POST", "/api/warehouse/settings", setting);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/settings"] });
      toast({
        title: "Настройка сохранена",
        description: "Настройки склада успешно обновлены",
      });
    },
  });

  // Delete warehouse setting mutation
  const deleteSettingMutation = useMutation({
    mutationFn: async (locationPattern: string) => {
      const res = await apiRequest("DELETE", `/api/warehouse/settings/${locationPattern}`, undefined);
      // 204 No Content returns empty body, don't parse JSON
      if (res.status === 204) {
        return;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/settings"] });
      toast({
        title: "Настройка удалена",
        description: "Настройка успешно удалена",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка удаления",
        description: error.message || "Не удалось удалить настройку",
        variant: "destructive",
      });
    },
  });

  // Initialize location input from active locations
  useEffect(() => {
    if (activeLocations.length > 0 && !locationInput) {
      setLocationInput(activeLocations.map(loc => loc.location).join("\n"));
    }
  }, [activeLocations]);

  // Parse location input
  const parseLocationInput = (input: string): Set<string> => {
    if (!input.trim()) return new Set();
    return new Set(
      input
        .toUpperCase()
        .split(/[\s,\n]+/)
        .map(loc => loc.trim())
        .filter(loc => loc.length > 0)
    );
  };

  // Save locations
  const handleSaveLocations = () => {
    const locations = Array.from(parseLocationInput(locationInput));
    setLocationsMutation.mutate(locations);
  };

  // Get all unique letters from locations
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    locationGroups.forEach(loc => {
      const letter = loc.location.match(/^([A-Z]+)/)?.[1];
      if (letter) letters.add(letter);
    });
    return Array.from(letters).sort();
  }, [locationGroups]);

  // Get setting for location pattern (e.g., "A1" from "A101")
  const getSettingForLocation = (location: string): WarehouseSetting | undefined => {
    // Extract pattern: first letter(s) + first digit
    const match = location.match(/^([A-Z]+)(\d)/);
    if (!match) return undefined;
    
    const pattern = match[1] + match[2]; // e.g., "A1", "B1"
    return warehouseSettings.find(s => s.locationPattern === pattern);
  };

  // Parse active locations set for filtering (memoized separately)
  const activeLocationsSet = useMemo(() => {
    return parseLocationInput(locationInput);
  }, [locationInput]);

  // Filter locations based on active locations and TSKU/MAXQ filters
  const filteredLocations = useMemo(() => {
    // Start with appropriate base: 
    // If letter filter is active, use all locations and ignore active locations filter
    // Otherwise, filter by active locations if specified
    let filtered = letterFilter.length > 0
      ? locationGroups 
      : (activeLocationsSet.size > 0
          ? locationGroups.filter(loc => activeLocationsSet.has(loc.location.toUpperCase()))
          : locationGroups);

    // Filter by letters (if specified) - multi-select
    if (letterFilter.length > 0) {
      filtered = filtered.filter(loc => {
        const letter = loc.location.match(/^([A-Z]+)/)?.[1];
        return letter && letterFilter.includes(letter);
      });
    }

    // Filter by TSKU - exact value match
    if (tskuFilter) {
      const tskuValue = parseInt(tskuFilter);
      if (!isNaN(tskuValue)) {
        filtered = filtered.filter(loc => loc.skuCount === tskuValue);
      }
    }

    // Filter by MAXQ - exact value match
    if (maxqFilter) {
      const maxqValue = parseInt(maxqFilter);
      if (!isNaN(maxqValue)) {
        filtered = filtered.filter(loc => loc.totalQuantity === maxqValue);
      }
    }

    // Apply limit
    const limit = limitFilter === "all" ? filtered.length : parseInt(limitFilter);
    
    // If showing all letters (no filter) or multiple letters selected, apply limit PER LETTER
    // Otherwise (single letter selected), apply limit to total
    if (letterFilter.length === 0 || letterFilter.length > 1) {
      // Group by letter first
      const byLetter = new Map<string, LocationGroup[]>();
      filtered.forEach(loc => {
        const letter = loc.location.match(/^([A-Z]+)/)?.[1] || "OTHER";
        if (!byLetter.has(letter)) {
          byLetter.set(letter, []);
        }
        byLetter.get(letter)!.push(loc);
      });
      
      // Apply limit to each letter group
      const result: LocationGroup[] = [];
      byLetter.forEach((locations) => {
        result.push(...locations.slice(0, limit));
      });
      
      return result;
    } else {
      // Single letter or no letter filter - apply limit to total
      return filtered.slice(0, limit);
    }
  }, [locationGroups, activeLocationsSet, letterFilter, tskuFilter, maxqFilter, limitFilter]);

  // Group locations by letter for column layout
  const locationsByLetter = useMemo(() => {
    const groups = new Map<string, LocationGroup[]>();
    
    filteredLocations.forEach(loc => {
      const letter = loc.location.match(/^([A-Z]+)/)?.[1] || "OTHER";
      if (!groups.has(letter)) {
        groups.set(letter, []);
      }
      groups.get(letter)!.push(loc);
    });

    // Sort groups by letter
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredLocations]);

  // Color indicators - gradient from green (0) to red (max)
  const getSkuColor = (location: string, skuCount: number) => {
    const setting = getSettingForLocation(location);
    const tsku = setting?.tsku || 4;
    
    const ratio = Math.min(skuCount / tsku, 1);
    
    if (ratio >= 1) return "bg-red-500";
    if (ratio >= 0.75) return "bg-orange-500";
    if (ratio >= 0.5) return "bg-yellow-500";
    if (ratio >= 0.25) return "bg-lime-500";
    return "bg-green-500";
  };

  const getQuantityColor = (location: string, quantity: number) => {
    const setting = getSettingForLocation(location);
    const maxq = setting?.maxq || 10;
    
    const ratio = Math.min(quantity / maxq, 1);
    
    if (ratio >= 1) return "bg-red-500";
    if (ratio >= 0.75) return "bg-orange-500";
    if (ratio >= 0.5) return "bg-yellow-500";
    if (ratio >= 0.25) return "bg-lime-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-4">
      {/* Admin: Location Management */}
      {userRole === "admin" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Управление локациями (Администратор)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label htmlFor="location-input">
                      Введите локации (столбиком, по одной)
                    </Label>
                    <div className="flex flex-col gap-1 mt-2 max-h-48 overflow-y-auto p-2 border rounded">
                      {locationInput.split(/[\s,\n]+/).filter(loc => loc.trim()).map((loc, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={loc.toUpperCase()}
                            onChange={(e) => {
                              const locations = locationInput.split(/[\s,\n]+/).filter(l => l.trim());
                              locations[idx] = e.target.value;
                              setLocationInput(locations.join("\n"));
                            }}
                            className="w-20 font-mono"
                            data-testid={`input-location-${idx}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const locations = locationInput.split(/[\s,\n]+/).filter(l => l.trim());
                              locations.splice(idx, 1);
                              setLocationInput(locations.join("\n"));
                            }}
                            data-testid={`button-remove-location-${idx}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const current = locationInput.trim();
                          setLocationInput(current ? `${current}\n` : "");
                        }}
                        data-testid="button-add-location"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить локацию
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {parseLocationInput(locationInput).size} локаций введено
                    </p>
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveLocations} data-testid="button-save-locations">
                Сохранить локации
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Настройки TSKU/MAXQ для групп локаций</CardTitle>
            </CardHeader>
            <CardContent>
              <WarehouseSettingsPanel
                settings={warehouseSettings}
                onUpdate={(setting) => upsertSettingMutation.mutate(setting)}
                onDelete={(locationPattern) => deleteSettingMutation.mutate(locationPattern)}
                isDeleting={deleteSettingMutation.isPending}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-start">
          <div className="space-y-2 w-48">
            <Label>Фильтр по буквам</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-start font-normal"
                  data-testid="button-letter-filter"
                >
                  {letterFilter.length === 0 ? (
                    "Все буквы"
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {letterFilter.map(letter => (
                        <Badge key={letter} variant="secondary" className="text-xs">
                          {letter}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Выберите буквы</h4>
                    {letterFilter.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLetterFilter([])}
                        data-testid="button-clear-letters"
                      >
                        Очистить
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {availableLetters.map(letter => {
                      const isChecked = letterFilter.includes(letter);
                      return (
                        <div key={letter} className="flex items-center space-x-2">
                          <Checkbox
                            id={`letter-${letter}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setLetterFilter([...letterFilter, letter]);
                              } else {
                                setLetterFilter(letterFilter.filter(l => l !== letter));
                              }
                            }}
                            data-testid={`checkbox-letter-${letter}`}
                          />
                          <Label 
                            htmlFor={`letter-${letter}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {letter}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2 w-48">
            <Label htmlFor="tsku-filter">Фильтр по TSKU (точное значение)</Label>
            <Input
              id="tsku-filter"
              type="number"
              placeholder="Например: 2"
              value={tskuFilter}
              onChange={(e) => setTskuFilter(e.target.value)}
              data-testid="input-tsku-filter"
            />
          </div>
          <div className="space-y-2 w-48">
            <Label htmlFor="maxq-filter">Фильтр по MAXQ (точное значение)</Label>
            <Input
              id="maxq-filter"
              type="number"
              placeholder="Например: 5"
              value={maxqFilter}
              onChange={(e) => setMaxqFilter(e.target.value)}
              data-testid="input-maxq-filter"
            />
          </div>
          <div className="space-y-2 w-40">
            <Label htmlFor="limit">Показать локаций</Label>
            <Select value={limitFilter} onValueChange={setLimitFilter}>
              <SelectTrigger data-testid="select-limit-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="300">300</SelectItem>
                <SelectItem value="all">Все</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Compact vertical table by letters */}
      <Card>
        <CardHeader>
          <CardTitle>Загрузка склада ({filteredLocations.length} локаций)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {locationsByLetter.map(([letter, locations]) => (
              <div key={letter} className="flex-shrink-0">
                <div className="text-sm font-bold mb-2 text-center">{letter}</div>
                <div className="space-y-1">
                  {locations.map((loc) => {
                    const setting = getSettingForLocation(loc.location);
                    const tsku = setting?.tsku || 4;
                    const maxq = setting?.maxq || 10;

                    return (
                      <div
                        key={loc.location}
                        className="flex items-center gap-2 text-xs border-b py-1"
                        data-testid={`location-row-${loc.location}`}
                      >
                        <div className="w-12 font-mono font-semibold">{loc.location}</div>
                        <div className="w-6 text-center">{loc.skuCount}</div>
                        <div className={`w-3 h-3 rounded-full ${getSkuColor(loc.location, loc.skuCount)}`} />
                        <div className="w-6 text-center">{loc.totalQuantity}</div>
                        <div className={`w-3 h-3 rounded-full ${getQuantityColor(loc.location, loc.totalQuantity)}`} />
                      </div>
                    );
                  })}
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
            <div className="font-semibold mb-2 text-sm">Индикаторы:</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                <span>Норма</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                <span>Внимание</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                <span>Предупреждение</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                <span>Перегрузка / Критично</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
