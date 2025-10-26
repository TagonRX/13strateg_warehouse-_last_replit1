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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Trash2, ChevronDown, AlertCircle, Upload } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  barcode: string | null;
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
  const [locationList, setLocationList] = useState<{ location: string; barcode: string | null }[]>([]);
  const [locationRangeFrom, setLocationRangeFrom] = useState<string>("");
  const [locationRangeTo, setLocationRangeTo] = useState<string>("");
  const [newLocationName, setNewLocationName] = useState<string>("");
  const [newLocationBarcode, setNewLocationBarcode] = useState<string>("");
  const [editingBarcode, setEditingBarcode] = useState<{ location: string; value: string } | null>(null);
  const [csvUploadStats, setCsvUploadStats] = useState<{ added: number; updated: number; errors: string[] } | null>(null);
  const [letterFilter, setLetterFilter] = useState<string[]>([]); // Multi-select letter filter
  const [limitFilter, setLimitFilter] = useState<string>("100");
  
  // Separate input state (immediate) and filter state (debounced)
  const [tskuInput, setTskuInput] = useState<string>("");
  const [tskuFilter, setTskuFilter] = useState<string>("");
  const [tskuOperator, setTskuOperator] = useState<string>("=");
  
  const [maxqInput, setMaxqInput] = useState<string>("");
  const [maxqFilter, setMaxqFilter] = useState<string>("");
  const [maxqOperator, setMaxqOperator] = useState<string>("=");

  // Collapsible state for admin sections
  const [isLocationManagementOpen, setIsLocationManagementOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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
    mutationFn: async (locations: { location: string; barcode?: string }[]) => {
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

  // Initialize location list from active locations
  useEffect(() => {
    if (activeLocations.length > 0 && locationList.length === 0) {
      setLocationList(activeLocations.map(loc => ({ location: loc.location, barcode: loc.barcode })));
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

  // Save locations
  const handleSaveLocations = () => {
    const locationsToSave = locationList.map(loc => ({
      location: loc.location,
      barcode: loc.barcode || undefined,
    }));
    setLocationsMutation.mutate(locationsToSave);
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

  // Managed locations set for filtering (memoized)
  const managedLocationsSet = useMemo(() => {
    return new Set(locationList.map(loc => loc.location.toUpperCase()));
  }, [locationList]);

  // Count items in non-managed locations
  const nonManagedItemsCount = useMemo(() => {
    return locationGroups.reduce((count, loc) => {
      if (!managedLocationsSet.has(loc.location.toUpperCase())) {
        return count + loc.items.length;
      }
      return count;
    }, 0);
  }, [locationGroups, managedLocationsSet]);

  // Filter locations by range (С and ПО)
  const filteredLocationList = useMemo(() => {
    if (!locationRangeFrom && !locationRangeTo) {
      return locationList;
    }
    return locationList.filter(loc => {
      const upperLoc = loc.location.toUpperCase();
      const from = locationRangeFrom.toUpperCase();
      const to = locationRangeTo.toUpperCase();
      
      if (from && to) {
        return upperLoc >= from && upperLoc <= to;
      } else if (from) {
        return upperLoc >= from;
      } else if (to) {
        return upperLoc <= to;
      }
      return true;
    });
  }, [locationList, locationRangeFrom, locationRangeTo]);

  // Handler to add new location
  const handleAddLocation = () => {
    const trimmedName = newLocationName.trim().toUpperCase();
    const trimmedBarcode = newLocationBarcode.trim();
    if (!trimmedName) return;
    if (locationList.some(loc => loc.location === trimmedName)) {
      toast({
        title: "Локация существует",
        description: "Эта локация уже добавлена",
        variant: "destructive",
      });
      return;
    }
    setLocationList([...locationList, { location: trimmedName, barcode: trimmedBarcode || null }]);
    setNewLocationName("");
    setNewLocationBarcode("");
  };

  // Handler to delete location
  const handleDeleteLocation = (location: string) => {
    setLocationList(locationList.filter(loc => loc.location !== location));
  };

  // Handler to update barcode
  const handleUpdateBarcode = (location: string, barcode: string) => {
    setLocationList(locationList.map(loc => 
      loc.location === location ? { ...loc, barcode: barcode || null } : loc
    ));
    setEditingBarcode(null);
  };

  // Handler for CSV upload
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        
        // Skip header if it contains "Location" or "Локация"
        const startIndex = lines[0]?.toLowerCase().includes('location') || lines[0]?.toLowerCase().includes('локация') ? 1 : 0;
        
        const stats = { added: 0, updated: 0, errors: [] as string[] };
        const newList = [...locationList];
        
        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];
          // Support both comma and semicolon separators
          const parts = line.includes(';') ? line.split(';') : line.split(',');
          
          if (parts.length < 1) {
            stats.errors.push(`Строка ${i + 1}: недостаточно данных`);
            continue;
          }
          
          const location = parts[0]?.trim().toUpperCase();
          const barcode = parts[1]?.trim() || null;
          
          if (!location) {
            stats.errors.push(`Строка ${i + 1}: пустая локация`);
            continue;
          }
          
          // Check if location already exists
          const existingIndex = newList.findIndex(loc => loc.location === location);
          if (existingIndex >= 0) {
            // Update existing - only update barcode if provided in CSV
            newList[existingIndex] = { 
              location, 
              barcode: barcode || newList[existingIndex].barcode // Keep existing barcode if CSV has no value
            };
            stats.updated++;
          } else {
            // Add new
            newList.push({ location, barcode });
            stats.added++;
          }
        }
        
        setLocationList(newList);
        setCsvUploadStats(stats);
        
        toast({
          title: "CSV загружен",
          description: `Добавлено: ${stats.added}, обновлено: ${stats.updated}${stats.errors.length > 0 ? `, ошибок: ${stats.errors.length}` : ''}`,
        });
      } catch (error) {
        toast({
          title: "Ошибка загрузки CSV",
          description: error instanceof Error ? error.message : "Не удалось обработать файл",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
    // Reset input so same file can be uploaded again
    event.target.value = '';
  };

  // Filter locations based on managed locations and TSKU/MAXQ filters
  const filteredLocations = useMemo(() => {
    // Start with all locations by default
    let filtered = locationGroups;
    
    // ALWAYS filter to only show managed locations (if any exist)
    if (managedLocationsSet.size > 0) {
      filtered = filtered.filter(loc => managedLocationsSet.has(loc.location.toUpperCase()));
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
  }, [locationGroups, managedLocationsSet, letterFilter, tskuFilter, tskuOperator, maxqFilter, maxqOperator, limitFilter]);

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
      {/* Warning for items in non-managed locations */}
      {nonManagedItemsCount > 0 && (
        <Alert variant="default" data-testid="alert-non-managed-locations">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Товары в неуправляемых локациях</AlertTitle>
          <AlertDescription>
            Найдено {nonManagedItemsCount} товар(ов) в локациях, которые не добавлены в список управляемых локаций.
            {userRole === "admin" && " Добавьте эти локации в управление ниже, чтобы они отображались в таблице."}
          </AlertDescription>
        </Alert>
      )}

      {/* Admin: Location Management */}
      {userRole === "admin" && (
        <>
          <Collapsible open={isLocationManagementOpen} onOpenChange={setIsLocationManagementOpen}>
            <Card className="w-fit">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="group w-full justify-start text-left p-6 h-auto rounded-none" 
                  data-testid="header-location-management"
                >
                  <div className="flex items-center justify-between gap-4 w-full">
                    <CardTitle>Управление локациями (Администратор)</CardTitle>
                    <ChevronDown 
                      className="transition-transform flex-shrink-0 group-data-[state=open]:rotate-180" 
                    />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {isLocationManagementOpen && (
                <CardContent className="space-y-4">
              {/* Range filter */}
              <div className="flex gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="location-range-from">С</Label>
                  <Input
                    id="location-range-from"
                    placeholder="A100"
                    value={locationRangeFrom}
                    onChange={(e) => setLocationRangeFrom(e.target.value.toUpperCase())}
                    className="w-32 font-mono"
                    data-testid="input-location-range-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location-range-to">ПО</Label>
                  <Input
                    id="location-range-to"
                    placeholder="A199"
                    value={locationRangeTo}
                    onChange={(e) => setLocationRangeTo(e.target.value.toUpperCase())}
                    className="w-32 font-mono"
                    data-testid="input-location-range-to"
                  />
                </div>
                {(locationRangeFrom || locationRangeTo) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLocationRangeFrom("");
                      setLocationRangeTo("");
                    }}
                    data-testid="button-clear-range-filter"
                  >
                    Очистить фильтр
                  </Button>
                )}
              </div>

              {/* Locations table */}
              <div className="space-y-2">
                <Label>Список локаций</Label>
                <div className="border rounded-md max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">Локация</TableHead>
                        <TableHead className="flex-1">Баркод локации</TableHead>
                        <TableHead className="w-20 text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLocationList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Нет локаций
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLocationList.map((loc, index) => (
                          <TableRow key={index} data-testid={`row-location-${index}`}>
                            <TableCell className="font-mono font-semibold">
                              {loc.location}
                            </TableCell>
                            <TableCell>
                              {editingBarcode?.location === loc.location ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={editingBarcode.value}
                                    onChange={(e) => setEditingBarcode({ location: loc.location, value: e.target.value })}
                                    className="h-8 font-mono"
                                    placeholder="Баркод локации"
                                    data-testid={`input-barcode-${index}`}
                                  />
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleUpdateBarcode(loc.location, editingBarcode.value)}
                                    data-testid={`button-save-barcode-${index}`}
                                    className="text-xs px-2"
                                  >
                                    OK
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingBarcode(null)}
                                    data-testid={`button-cancel-barcode-${index}`}
                                    className="text-xs px-2"
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded font-mono text-sm"
                                  onClick={() => setEditingBarcode({ location: loc.location, value: loc.barcode || "" })}
                                  data-testid={`text-barcode-${index}`}
                                >
                                  {loc.barcode || <span className="text-muted-foreground italic">Нет баркода (нажмите для добавления)</span>}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteLocation(loc.location)}
                                data-testid={`button-delete-location-${index}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-sm text-muted-foreground">
                  {locationList.length} локаций введено
                  {(locationRangeFrom || locationRangeTo) && ` (показано: ${filteredLocationList.length})`}
                </p>
              </div>

              {/* CSV Upload */}
              <div className="space-y-2">
                <Label>Массовая загрузка через CSV</Label>
                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('csv-upload-input')?.click()}
                    data-testid="button-upload-csv"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Загрузить CSV файл
                  </Button>
                  <input
                    id="csv-upload-input"
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvUpload}
                    className="hidden"
                    data-testid="input-csv-upload"
                  />
                  <span className="text-sm text-muted-foreground">
                    Формат: Location,Barcode (по одной локации на строку)
                  </span>
                </div>
                {csvUploadStats && csvUploadStats.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ошибки при загрузке CSV</AlertTitle>
                    <AlertDescription>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                        {csvUploadStats.errors.slice(0, 10).map((error, idx) => (
                          <div key={idx}>{error}</div>
                        ))}
                        {csvUploadStats.errors.length > 10 && (
                          <div className="font-semibold">...и ещё {csvUploadStats.errors.length - 10} ошибок</div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Add new location */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="new-location-name">Новая локация</Label>
                  <Input
                    id="new-location-name"
                    placeholder="Введите название локации..."
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        handleAddLocation();
                      }
                    }}
                    className="font-mono uppercase"
                    data-testid="input-new-location"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="new-location-barcode">Баркод локации (опционально)</Label>
                  <Input
                    id="new-location-barcode"
                    placeholder="Баркод локации..."
                    value={newLocationBarcode}
                    onChange={(e) => setNewLocationBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        handleAddLocation();
                      }
                    }}
                    className="font-mono"
                    data-testid="input-new-location-barcode"
                  />
                </div>
                <Button onClick={handleAddLocation} data-testid="button-add-location">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить
                </Button>
              </div>

              {/* Save button */}
              <div className="flex gap-2">
                <Button onClick={handleSaveLocations} data-testid="button-save-locations">
                  Сохранить локации
                </Button>
              </div>
                </CardContent>
                )}
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <Card className="w-fit">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="group w-full justify-start text-left p-6 h-auto rounded-none" 
                  data-testid="header-settings"
                >
                  <div className="flex items-center justify-between gap-4 w-full">
                    <CardTitle>Настройки TSKU/MAXQ для групп локаций</CardTitle>
                    <ChevronDown 
                      className="transition-transform flex-shrink-0 group-data-[state=open]:rotate-180" 
                    />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {isSettingsOpen && (
                  <CardContent>
                    <WarehouseSettingsPanel
                      settings={warehouseSettings}
                      onUpdate={(setting) => upsertSettingMutation.mutate(setting)}
                      onDelete={(locationPattern) => deleteSettingMutation.mutate(locationPattern)}
                      isDeleting={deleteSettingMutation.isPending}
                    />
                  </CardContent>
                )}
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
