import { useState, useMemo, useEffect, useCallback } from "react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTsku, setEditTsku] = useState("");
  const [editMaxq, setEditMaxq] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newTsku, setNewTsku] = useState("4");
  const [newMaxq, setNewMaxq] = useState("10");

  const handleEdit = (setting: WarehouseSetting) => {
    setEditingId(setting.id);
    setEditTsku(setting.tsku.toString());
    setEditMaxq(setting.maxq.toString());
  };

  const handleSave = (locationPattern: string) => {
    onUpdate({
      locationPattern,
      tsku: parseInt(editTsku) || 4,
      maxq: parseInt(editMaxq) || 10,
    });
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

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
        <div className="rounded-md border overflow-x-auto">
          <div className="flex p-2 text-sm font-medium bg-muted/50">
            <div className="w-48">Группа локаций</div>
            <div className="w-20">TSKU</div>
            <div className="w-16">MAXQ</div>
            <div className="flex-1">Действия</div>
          </div>
          {settings.map((setting) => (
            <div key={setting.id} className="flex p-2 text-sm border-t items-center" data-testid={`setting-row-${setting.locationPattern}`}>
              {editingId === setting.id ? (
                <>
                  <div className="w-48 font-mono font-semibold">{setting.locationPattern}</div>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={editTsku}
                      onChange={(e) => setEditTsku(e.target.value)}
                      className="h-8"
                      data-testid={`input-edit-tsku-${setting.locationPattern}`}
                    />
                  </div>
                  <div className="w-16">
                    <Input
                      type="number"
                      value={editMaxq}
                      onChange={(e) => setEditMaxq(e.target.value)}
                      className="h-8"
                      data-testid={`input-edit-maxq-${setting.locationPattern}`}
                    />
                  </div>
                  <div className="flex-1 flex gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleSave(setting.locationPattern)}
                      data-testid={`button-save-${setting.locationPattern}`}
                      className="text-xs px-2"
                    >
                      Подтвердить
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      data-testid={`button-cancel-${setting.locationPattern}`}
                      className="text-xs px-2"
                    >
                      Отмена
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-48 font-mono font-semibold truncate" title={setting.locationPattern}>{setting.locationPattern}</div>
                  <div className="w-20">{setting.tsku}</div>
                  <div className="w-16">{setting.maxq}</div>
                  <div className="flex-1 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(setting)}
                      data-testid={`button-edit-${setting.locationPattern}`}
                      className="text-xs px-2"
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
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new setting */}
      <div className="rounded-md border p-4">
        <h3 className="text-sm font-semibold mb-3">Добавить настройку</h3>
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
  const [locationSearchFilter, setLocationSearchFilter] = useState<string>(""); // Search filter for location management
  const [letterFilter, setLetterFilter] = useState<string[]>([]); // Multi-select letter filter
  const [limitFilter, setLimitFilter] = useState<string>("100");
  const [onlyActiveLocations, setOnlyActiveLocations] = useState<boolean>(false); // Filter by active locations checkbox
  
  // Separate input state (immediate) and filter state (debounced)
  const [tskuInput, setTskuInput] = useState<string>("");
  const [tskuFilter, setTskuFilter] = useState<string>("");
  const [tskuOperator, setTskuOperator] = useState<string>("=");
  
  const [maxqInput, setMaxqInput] = useState<string>("");
  const [maxqFilter, setMaxqFilter] = useState<string>("");
  const [maxqOperator, setMaxqOperator] = useState<string>("=");

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

  // Debounce TSKU filter (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setTskuFilter(tskuInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [tskuInput]);

  // Debounce MAXQ filter (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMaxqFilter(maxqInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [maxqInput]);

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
    // Extract letter and full number from location
    const match = location.match(/^([A-Z]+)(\d+)/);
    if (!match) return undefined;
    
    const letter = match[1];
    const number = parseInt(match[2], 10);
    
    // If number < 100, use X0 pattern (e.g., N0 for N1-N99)
    // If number >= 100, use X{first_digit} pattern (e.g., N1 for N101-N199)
    const pattern = number < 100 ? `${letter}0` : `${letter}${match[2][0]}`;
    
    // Find setting that contains this pattern in locationPattern
    return warehouseSettings.find(s => 
      s.locationPattern.split(',').map(p => p.trim()).includes(pattern)
    );
  };

  // Parse active locations set for filtering (memoized separately)
  const activeLocationsSet = useMemo(() => {
    return parseLocationInput(locationInput);
  }, [locationInput]);

  // Filter locations based on active locations and TSKU/MAXQ filters
  const filteredLocations = useMemo(() => {
    // Start with all locations by default
    let filtered = locationGroups;
    
    // Filter by active locations only if checkbox is enabled AND active locations exist
    if (onlyActiveLocations && activeLocationsSet.size > 0) {
      filtered = filtered.filter(loc => activeLocationsSet.has(loc.location.toUpperCase()));
    }

    // Filter by letters (if specified) - multi-select
    if (letterFilter.length > 0) {
      filtered = filtered.filter(loc => {
        const letter = loc.location.match(/^([A-Z]+)/)?.[1];
        return letter && letterFilter.includes(letter);
      });
    }

    // Filter by TSKU with comparison operator
    if (tskuFilter) {
      const tskuValue = parseInt(tskuFilter);
      if (!isNaN(tskuValue)) {
        filtered = filtered.filter(loc => {
          switch (tskuOperator) {
            case ">": return loc.skuCount > tskuValue;
            case ">=": return loc.skuCount >= tskuValue;
            case "<": return loc.skuCount < tskuValue;
            case "<=": return loc.skuCount <= tskuValue;
            case "=": return loc.skuCount === tskuValue;
            default: return true;
          }
        });
      }
    }

    // Filter by MAXQ with comparison operator
    if (maxqFilter) {
      const maxqValue = parseInt(maxqFilter);
      if (!isNaN(maxqValue)) {
        filtered = filtered.filter(loc => {
          switch (maxqOperator) {
            case ">": return loc.totalQuantity > maxqValue;
            case ">=": return loc.totalQuantity >= maxqValue;
            case "<": return loc.totalQuantity < maxqValue;
            case "<=": return loc.totalQuantity <= maxqValue;
            case "=": return loc.totalQuantity === maxqValue;
            default: return true;
          }
        });
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
  }, [locationGroups, activeLocationsSet, onlyActiveLocations, letterFilter, tskuFilter, tskuOperator, maxqFilter, maxqOperator, limitFilter]);

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
          <Card className="w-fit">
            <CardHeader>
              <CardTitle>Управление локациями (Администратор)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search filter for locations */}
              <div className="space-y-2">
                <Label htmlFor="location-search">Поиск локации</Label>
                <Input
                  id="location-search"
                  placeholder="Введите название локации..."
                  value={locationSearchFilter}
                  onChange={(e) => setLocationSearchFilter(e.target.value)}
                  className="w-64"
                  data-testid="input-location-search"
                />
              </div>

              <div className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label htmlFor="location-input">
                      Введите локации (столбиком, по одной)
                    </Label>
                    <div className="flex flex-col gap-1 mt-2 max-h-48 overflow-y-auto p-2 border rounded">
                      {locationInput.split(/[\s,\n]+/)
                        .filter(loc => loc.trim())
                        .map((loc, originalIdx) => ({ loc, originalIdx })) // Pair with original index
                        .filter(({ loc }) => {
                          // Apply search filter
                          if (!locationSearchFilter.trim()) return true;
                          return loc.toUpperCase().includes(locationSearchFilter.toUpperCase());
                        })
                        .map(({ loc, originalIdx }) => {
                          return (
                            <div key={originalIdx} className="flex items-center gap-2">
                              <Input
                                value={loc.toUpperCase()}
                                onChange={(e) => {
                                  const locations = locationInput.split(/[\s,\n]+/).filter(l => l.trim());
                                  locations[originalIdx] = e.target.value;
                                  setLocationInput(locations.join("\n"));
                                }}
                                className="w-20 font-mono"
                                data-testid={`input-location-${originalIdx}`}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const locations = locationInput.split(/[\s,\n]+/).filter(l => l.trim());
                                  locations.splice(originalIdx, 1);
                                  setLocationInput(locations.join("\n"));
                                }}
                                data-testid={`button-remove-location-${originalIdx}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const current = locationInput.trim();
                          setLocationInput(current ? `${current}\nНОВАЯ` : "НОВАЯ");
                        }}
                        data-testid="button-add-location"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить локацию
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {parseLocationInput(locationInput).size} локаций введено
                      {locationSearchFilter && ` (показано: ${locationInput.split(/[\s,\n]+/).filter(loc => loc.trim() && loc.toUpperCase().includes(locationSearchFilter.toUpperCase())).length})`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveLocations} data-testid="button-save-locations">
                  Сохранить локации
                </Button>
                {locationSearchFilter && (
                  <Button 
                    variant="destructive"
                    onClick={() => {
                      const locations = locationInput.split(/[\s,\n]+/).filter(l => l.trim());
                      const filtered = locations.filter(loc => 
                        !loc.toUpperCase().includes(locationSearchFilter.toUpperCase())
                      );
                      setLocationInput(filtered.join("\n"));
                      setLocationSearchFilter("");
                      toast({
                        title: "Локации удалены",
                        description: `Удалено ${locations.length - filtered.length} локаций`,
                      });
                    }}
                    data-testid="button-delete-filtered-locations"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить найденные ({locationInput.split(/[\s,\n]+/).filter(loc => loc.trim() && loc.toUpperCase().includes(locationSearchFilter.toUpperCase())).length})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="w-fit">
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
      <Card className="w-fit">
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
          <div className="space-y-2">
            <Label>Фильтр по TSKU</Label>
            <div className="flex gap-2">
              <Select value={tskuOperator} onValueChange={setTskuOperator}>
                <SelectTrigger className="w-20" data-testid="select-tsku-operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">=</SelectItem>
                  <SelectItem value=">">&gt;</SelectItem>
                  <SelectItem value=">=">&gt;=</SelectItem>
                  <SelectItem value="<">&lt;</SelectItem>
                  <SelectItem value="<=">&lt;=</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="tsku-filter"
                type="number"
                placeholder="Например: 2"
                value={tskuInput}
                onChange={(e) => setTskuInput(e.target.value)}
                className="w-32"
                data-testid="input-tsku-filter"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Фильтр по MAXQ</Label>
            <div className="flex gap-2">
              <Select value={maxqOperator} onValueChange={setMaxqOperator}>
                <SelectTrigger className="w-20" data-testid="select-maxq-operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">=</SelectItem>
                  <SelectItem value=">">&gt;</SelectItem>
                  <SelectItem value=">=">&gt;=</SelectItem>
                  <SelectItem value="<">&lt;</SelectItem>
                  <SelectItem value="<=">&lt;=</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="maxq-filter"
                type="number"
                placeholder="Например: 5"
                value={maxqInput}
                onChange={(e) => setMaxqInput(e.target.value)}
                className="w-32"
                data-testid="input-maxq-filter"
              />
            </div>
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
          {userRole === "admin" && activeLocations.length > 0 && (
            <div className="space-y-2">
              <Label>Доп. фильтры</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="only-active-locations"
                  checked={onlyActiveLocations}
                  onCheckedChange={(checked) => setOnlyActiveLocations(!!checked)}
                  data-testid="checkbox-only-active-locations"
                />
                <Label 
                  htmlFor="only-active-locations"
                  className="text-sm font-normal cursor-pointer"
                >
                  Только активные ({activeLocations.length})
                </Label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compact vertical table by letters */}
      <Card className="w-fit">
        <CardHeader>
          <CardTitle>Загрузка склада ({filteredLocations.length} локаций)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8 overflow-x-auto pb-4">
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
                        className="flex items-center gap-1 text-xs border-b py-1"
                        data-testid={`location-row-${loc.location}`}
                      >
                        <div className="w-12 font-mono font-semibold">{loc.location}</div>
                        <div className="w-5 text-center">{loc.skuCount}</div>
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
      <Card className="w-fit">
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
