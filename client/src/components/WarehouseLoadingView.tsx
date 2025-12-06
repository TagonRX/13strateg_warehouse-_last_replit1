import { useState, useMemo, useEffect, useCallback, memo } from "react";
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
import { Plus, X, Trash2, ChevronDown, AlertCircle, Upload, Download } from "lucide-react";
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

// Memoized Location Table Component - prevents re-renders during typing
const LocationTable = memo(({ 
  locationsByLetter,
  getSettingForLocation,
  getSkuColor,
  getQuantityColor 
}: {
  locationsByLetter: [string, LocationGroup[]][];
  getSettingForLocation: (location: string) => WarehouseSetting | undefined;
  getSkuColor: (location: string, skuCount: number) => string;
  getQuantityColor: (location: string, quantity: number) => string;
}) => {
  return (
    <div className="flex gap-8 overflow-x-auto pb-4">
      {locationsByLetter.map(([letter, locations]) => (
        <div key={letter} className="flex-shrink-0">
          <div className="text-sm font-bold mb-2 text-center">{letter}</div>
          <div className="space-y-1">
            {locations.map((loc) => {
              const setting = getSettingForLocation(loc.location);
              const tsku = setting?.tsku || 4;
              const maxq = setting?.maxq || 15;

              return (
                <div
                  key={loc.location}
                  className="flex items-center gap-1 text-xs border-b py-1"
                  data-testid={`location-row-${loc.location}`}
                >
                  <div className="w-12 font-mono font-semibold">{loc.location}</div>
                  <div className="w-5 text-center">{loc.skuCount}</div>
                  <div className={`w-3 h-3 rounded-full ${getSkuColor(loc.location, loc.skuCount)}`} />
                  <div className="w-6 text-center text-muted-foreground">/{tsku}</div>
                  <div className="w-6 text-center">{loc.totalQuantity}</div>
                  <div className={`w-3 h-3 rounded-full ${getQuantityColor(loc.location, loc.totalQuantity)}`} />
                  <div className="w-6 text-center text-muted-foreground">/{maxq}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

LocationTable.displayName = "LocationTable";

// Memoized Locations Management Table - prevents re-renders during editing
const LocationsManagementTable = memo(({ 
  locations,
  editingBarcode,
  onEditBarcode,
  onUpdateBarcode,
  onCancelEdit,
  onDeleteLocation
}: {
  locations: Array<{ location: string; barcode: string | null }>;
  editingBarcode: { location: string; value: string } | null;
  onEditBarcode: (location: string, value: string) => void;
  onUpdateBarcode: (location: string, value: string) => void;
  onCancelEdit: () => void;
  onDeleteLocation: (location: string) => void;
}) => {
  if (locations.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={3} className="text-center text-muted-foreground">
          Нет локаций
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {locations.map((loc, index) => (
        <TableRow key={index} data-testid={`row-location-${index}`}>
          <TableCell className="font-mono font-semibold">
            {loc.location}
          </TableCell>
          <TableCell>
            {editingBarcode?.location === loc.location ? (
              <div className="flex gap-1">
                <Input
                  value={editingBarcode.value}
                  onChange={(e) => onEditBarcode(loc.location, e.target.value)}
                  className="h-8 font-mono"
                  placeholder="Баркод локации"
                  data-testid={`input-barcode-${index}`}
                />
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onUpdateBarcode(loc.location, editingBarcode.value)}
                  data-testid={`button-save-barcode-${index}`}
                  className="text-xs px-2"
                >
                  OK
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelEdit}
                  data-testid={`button-cancel-barcode-${index}`}
                  className="text-xs px-2"
                >
                  ✕
                </Button>
              </div>
            ) : (
              <div 
                className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded font-mono text-sm"
                onClick={() => onEditBarcode(loc.location, loc.barcode || "")}
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
              onClick={() => onDeleteLocation(loc.location)}
              data-testid={`button-delete-location-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
});

LocationsManagementTable.displayName = "LocationsManagementTable";

// Settings Panel Component
function WarehouseSettingsPanel({ 
  settings, 
  onUpdate,
  onDelete,
  isDeleting,
  activeLocations 
}: { 
  settings: WarehouseSetting[]; 
  onUpdate: (setting: { locationPattern: string; tsku: number; maxq: number; greenThreshold?: number; yellowThreshold?: number; orangeThreshold?: number }) => void;
  onDelete: (locationPattern: string) => void;
  isDeleting?: boolean;
  activeLocations: ActiveLocation[];
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTsku, setEditTsku] = useState("");
  const [editMaxq, setEditMaxq] = useState("");
  const [editGreen, setEditGreen] = useState("25");
  const [editYellow, setEditYellow] = useState("50");
  const [editOrange, setEditOrange] = useState("75");
  const [newPattern, setNewPattern] = useState("");
  const [newTsku, setNewTsku] = useState("4");
  const [newMaxq, setNewMaxq] = useState("15");
  const [newGreen, setNewGreen] = useState("25");
  const [newYellow, setNewYellow] = useState("50");
  const [newOrange, setNewOrange] = useState("75");

  // Вычисляем какие паттерны (A0-A6) реально используются в активных локациях
  const usedPatterns = useMemo(() => {
    const patterns = new Set<string>();
    activeLocations.forEach(loc => {
      const location = loc.location.toUpperCase();
      // Извлекаем букву и первую цифру (например, A123 -> A1, B456 -> B4)
      const match = location.match(/^([A-Z])(\d)/);
      if (match) {
        const pattern = `${match[1]}${match[2]}`;
        patterns.add(pattern);
      }
    });
    return patterns;
  }, [activeLocations]);

  // Фильтруем настройки - показываем только те, для которых есть реальные локации
  const filteredSettings = useMemo(() => {
    return settings.filter(setting => usedPatterns.has(setting.locationPattern));
  }, [settings, usedPatterns]);

  const handleEdit = (setting: WarehouseSetting) => {
    setEditingId(setting.id);
    setEditTsku(setting.tsku.toString());
    setEditMaxq(setting.maxq.toString());
    setEditGreen((setting.greenThreshold || 25).toString());
    setEditYellow((setting.yellowThreshold || 50).toString());
    setEditOrange((setting.orangeThreshold || 75).toString());
  };

  const handleSave = (locationPattern: string) => {
    onUpdate({
      locationPattern,
      tsku: parseInt(editTsku) || 4,
      maxq: parseInt(editMaxq) || 15,
      greenThreshold: parseInt(editGreen) || 25,
      yellowThreshold: parseInt(editYellow) || 50,
      orangeThreshold: parseInt(editOrange) || 75,
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
      maxq: parseInt(newMaxq) || 15,
      greenThreshold: parseInt(newGreen) || 25,
      yellowThreshold: parseInt(newYellow) || 50,
      orangeThreshold: parseInt(newOrange) || 75,
    });
    setNewPattern("");
    setNewTsku("4");
    setNewMaxq("15");
    setNewGreen("25");
    setNewYellow("50");
    setNewOrange("75");
  };

  // Функция для создания настроек для всех используемых паттернов
  const handleCreateAllLetters = () => {
    const patterns: string[] = [];
    
    // Создаем настройки только для тех паттернов, которые реально используются
    usedPatterns.forEach(pattern => {
      // Проверяем, что такого паттерна еще нет в настройках
      if (!settings.find(s => s.locationPattern === pattern)) {
        patterns.push(pattern);
      }
    });

    if (patterns.length === 0) {
      toast({
        title: "Все настройки уже созданы",
        description: "Настройки для всех используемых паттернов локаций уже существуют",
      });
      return;
    }

    // Добавляем все паттерны
    patterns.forEach(pattern => {
      onUpdate({
        locationPattern: pattern,
        tsku: 4,
        maxq: 15,
        greenThreshold: 25,
        yellowThreshold: 50,
        orangeThreshold: 75,
      });
    });

    toast({
      title: "Настройки созданы",
      description: `Добавлено ${patterns.length} настроек для используемых паттернов (TSKU=4, MAXQ=15)`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Existing settings */}
      {filteredSettings.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <div className="flex p-2 text-sm font-medium bg-muted/50">
            <div className="w-32">Группа</div>
            <div className="w-16">TSKU</div>
            <div className="w-16">MAXQ</div>
            <div className="w-16 text-center">🟢%</div>
            <div className="w-16 text-center">🟡%</div>
            <div className="w-16 text-center">🟠%</div>
            <div className="flex-1">Действия</div>
          </div>
          {filteredSettings.map((setting) => (
            <div key={setting.id} className="flex p-2 text-sm border-t items-center" data-testid={`setting-row-${setting.locationPattern}`}>
              {editingId === setting.id ? (
                <>
                  <div className="w-32 font-mono font-semibold">{setting.locationPattern}</div>
                  <div className="w-16">
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
                  <div className="w-16">
                    <Input
                      type="number"
                      value={editGreen}
                      onChange={(e) => setEditGreen(e.target.value)}
                      className="h-8 text-center"
                      min="0"
                      max="100"
                      data-testid={`input-edit-green-${setting.locationPattern}`}
                    />
                  </div>
                  <div className="w-16">
                    <Input
                      type="number"
                      value={editYellow}
                      onChange={(e) => setEditYellow(e.target.value)}
                      className="h-8 text-center"
                      min="0"
                      max="100"
                      data-testid={`input-edit-yellow-${setting.locationPattern}`}
                    />
                  </div>
                  <div className="w-16">
                    <Input
                      type="number"
                      value={editOrange}
                      onChange={(e) => setEditOrange(e.target.value)}
                      className="h-8 text-center"
                      min="0"
                      max="100"
                      data-testid={`input-edit-orange-${setting.locationPattern}`}
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
                  <div className="w-32 font-mono font-semibold truncate" title={setting.locationPattern}>{setting.locationPattern}</div>
                  <div className="w-16">{setting.tsku}</div>
                  <div className="w-16">{setting.maxq}</div>
                  <div className="w-16 text-center">{setting.greenThreshold || 25}</div>
                  <div className="w-16 text-center">{setting.yellowThreshold || 50}</div>
                  <div className="w-16 text-center">{setting.orangeThreshold || 75}</div>
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pattern">Группа</Label>
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
          <div className="space-y-2">
            <Label htmlFor="green" className="text-xs">🟢 Зелёный %</Label>
            <Input
              id="green"
              type="number"
              value={newGreen}
              onChange={(e) => setNewGreen(e.target.value)}
              min="0"
              max="100"
              data-testid="input-green"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="yellow" className="text-xs">🟡 Жёлтый %</Label>
            <Input
              id="yellow"
              type="number"
              value={newYellow}
              onChange={(e) => setNewYellow(e.target.value)}
              min="0"
              max="100"
              data-testid="input-yellow"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orange" className="text-xs">🟠 Оранжевый %</Label>
            <Input
              id="orange"
              type="number"
              value={newOrange}
              onChange={(e) => setNewOrange(e.target.value)}
              min="0"
              max="100"
              data-testid="input-orange"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={handleAdd} className="w-full" data-testid="button-add-setting">
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
        
        {/* Quick setup for all letters */}
        <div className="mt-4 pt-4 border-t">
          <Button 
            onClick={handleCreateAllLetters} 
            variant="outline" 
            className="w-full"
            data-testid="button-create-all-letters"
          >
            Создать настройки для всех используемых паттернов (TSKU=4, MAXQ=15)
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Автоматически создаст настройки только для паттернов, которые реально используются в локациях
          </p>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          Группа локаций определяется первой буквой и первой цифрой (например, A1 для A100-A199)
        </p>
      </div>
    </div>
  );
}

export default function WarehouseLoadingView({ locationGroups, userRole }: WarehouseLoadingViewProps) {
  const { toast } = useToast();
  const [locationList, setLocationList] = useState<{ location: string; barcode: string | null }[]>([]);
  // Input states for location range filters (immediate update)
  const [locationRangeFromInput, setLocationRangeFromInput] = useState<string>("");
  const [locationRangeToInput, setLocationRangeToInput] = useState<string>("");
  // Debounced states for actual filtering
  const [locationRangeFrom, setLocationRangeFrom] = useState<string>("");
  const [locationRangeTo, setLocationRangeTo] = useState<string>("");
  
  const [newLocationName, setNewLocationName] = useState<string>("");
  const [newLocationBarcode, setNewLocationBarcode] = useState<string>("");
  const [editingBarcode, setEditingBarcode] = useState<{ location: string; value: string } | null>(null);
  const [csvUploadStats, setCsvUploadStats] = useState<{ added: number; updated: number; errors: string[] } | null>(null);
  const [letterFilter, setLetterFilter] = useState<string[]>([]); // Multi-select letter filter
  const [limitFilter, setLimitFilter] = useState<string>("200"); // Увеличен лимит до 200 для лучшей производительности
  
  // Pagination states for location management
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
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

  // Clear all locations mutation
  const clearAllLocationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/warehouse/locations/clear-all", undefined);
      if (res.status === 204) {
        return;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/active-locations"] });
      setLocationList([]);
      toast({
        title: "Все локации удалены",
        description: "Все локации успешно удалены из базы данных. Теперь можете загрузить новый CSV файл.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка очистки",
        description: error.message || "Не удалось очистить локации",
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

  // Debounce TSKU filter (300ms delay - балансируем отзывчивость и производительность)
  useEffect(() => {
    const timer = setTimeout(() => {
      setTskuFilter(tskuInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [tskuInput]);

  // Debounce MAXQ filter (300ms delay - балансируем отзывчивость и производительность)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMaxqFilter(maxqInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [maxqInput]);

  // Debounce location range FROM filter (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocationRangeFrom(locationRangeFromInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [locationRangeFromInput]);

  // Debounce location range TO filter (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocationRangeTo(locationRangeToInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [locationRangeToInput]);

  // Оптимизированные обработчики с useCallback
  const handleTskuInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTskuInput(e.target.value);
  }, []);

  const handleMaxqInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMaxqInput(e.target.value);
  }, []);

  // Save locations
  const handleSaveLocations = () => {
    const locationsToSave = locationList.map(loc => ({
      location: loc.location,
      barcode: loc.barcode || undefined,
    }));
    setLocationsMutation.mutate(locationsToSave);
  };

  // Get all unique letters from locations (supports both Latin and Cyrillic)
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    locationGroups.forEach(loc => {
      // Match Latin (A-Z) and Cyrillic (А-Я) uppercase letters at the start
      const letter = loc.location.match(/^([A-ZА-Я]+)/)?.[1];
      if (letter) letters.add(letter);
    });
    return Array.from(letters).sort();
  }, [locationGroups]);

  // Get setting for location pattern (e.g., "A1" from "A101") - мемоизировано для оптимизации
  const getSettingForLocation = useCallback((location: string): WarehouseSetting | undefined => {
    // Extract letter and full number from location (supports Latin A-Z and Cyrillic А-Я)
    const match = location.match(/^([A-ZА-Я]+)(\d+)/);
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
  }, [warehouseSettings]);

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
    let filtered = locationList;
    
    if (locationRangeFrom || locationRangeTo) {
      filtered = locationList.filter(loc => {
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
    }
    
    return filtered;
  }, [locationList, locationRangeFrom, locationRangeTo]);

  // Paginated location list
  const paginatedLocationList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredLocationList.slice(startIndex, endIndex);
  }, [filteredLocationList, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredLocationList.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [locationRangeFrom, locationRangeTo]);

  const hasMoreLocations = useMemo(() => {
    return filteredLocationList.length > itemsPerPage;
  }, [filteredLocationList.length, itemsPerPage]);

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

  // Handlers for location management table
  const handleEditBarcode = useCallback((location: string, value: string) => {
    setEditingBarcode({ location, value });
  }, []);

  const handleUpdateBarcode = useCallback((location: string, barcode: string) => {
    // Update local state only
    setLocationList(prev => prev.map(loc => 
      loc.location === location ? { ...loc, barcode: barcode || null } : loc
    ));
    setEditingBarcode(null);
  }, []);

  const handleCancelEditBarcode = useCallback(() => {
    setEditingBarcode(null);
  }, []);

  const handleDeleteLocation = useCallback((location: string) => {
    setLocationList(prev => prev.filter(loc => loc.location !== location));
  }, []);

  // Handler for downloading CSV template
  const handleDownloadTemplate = () => {
    const template = `Location,Barcode
A100,BC001
A101,BC002
A102,BC003
B200,BC204
B201,BC205`;
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'locations_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Шаблон скачан",
      description: "Откройте файл locations_template.csv и заполните данные",
    });
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

  // Handler for clearing all locations
  const handleClearAllLocations = () => {
    if (!confirm("⚠️ ВНИМАНИЕ!\n\nВы уверены, что хотите удалить ВСЕ локации из базы данных?\n\nЭто действие нельзя отменить!\n\nПосле очистки вы сможете загрузить новый CSV файл.")) {
      return;
    }
    clearAllLocationsMutation.mutate();
  };

  // Filter locations based on managed locations and TSKU/MAXQ filters
  const filteredLocations = useMemo(() => {
    // Start with all locations by default
    let filtered = locationGroups;
    
    // ALWAYS filter to only show managed locations (if any exist)
    if (managedLocationsSet.size > 0) {
      filtered = filtered.filter(loc => managedLocationsSet.has(loc.location.toUpperCase()));
    }

    // Filter by letters (if specified) - multi-select (supports both Latin and Cyrillic)
    if (letterFilter.length > 0) {
      filtered = filtered.filter(loc => {
        // Match Latin (A-Z) and Cyrillic (А-Я) uppercase letters at the start
        const letter = loc.location.match(/^([A-ZА-Я]+)/)?.[1];
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
      // Group by letter first (supports Latin A-Z and Cyrillic А-Я)
      const byLetter = new Map<string, LocationGroup[]>();
      filtered.forEach(loc => {
        const letter = loc.location.match(/^([A-ZА-Я]+)/)?.[1] || "OTHER";
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
      // Match Latin (A-Z) and Cyrillic (А-Я) uppercase letters at the start
      const letter = loc.location.match(/^([A-ZА-Я]+)/)?.[1] || "OTHER";
      if (!groups.has(letter)) {
        groups.set(letter, []);
      }
      groups.get(letter)!.push(loc);
    });

    // Sort groups by letter
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredLocations]);

  // Color indicators - gradient from green (0) to red (max) - мемоизированы для оптимизации
  const getSkuColor = useCallback((location: string, skuCount: number) => {
    const setting = getSettingForLocation(location);
    const tsku = setting?.tsku || 4;
    
    // Get thresholds from settings (defaults: 25%, 50%, 75%)
    const greenThreshold = (setting?.greenThreshold || 25) / 100;
    const yellowThreshold = (setting?.yellowThreshold || 50) / 100;
    const orangeThreshold = (setting?.orangeThreshold || 75) / 100;
    
    const ratio = Math.min(skuCount / tsku, 1);
    
    if (ratio >= 1) return "bg-red-500";
    if (ratio >= orangeThreshold) return "bg-orange-500";
    if (ratio >= yellowThreshold) return "bg-yellow-500";
    if (ratio >= greenThreshold) return "bg-lime-500";
    return "bg-green-500";
  }, [getSettingForLocation]);

  const getQuantityColor = useCallback((location: string, quantity: number) => {
    const setting = getSettingForLocation(location);
    const maxq = setting?.maxq || 15;
    
    // Get thresholds from settings (defaults: 25%, 50%, 75%)
    const greenThreshold = (setting?.greenThreshold || 25) / 100;
    const yellowThreshold = (setting?.yellowThreshold || 50) / 100;
    const orangeThreshold = (setting?.orangeThreshold || 75) / 100;
    
    const ratio = Math.min(quantity / maxq, 1);
    
    if (ratio >= 1) return "bg-red-500";
    if (ratio >= orangeThreshold) return "bg-orange-500";
    if (ratio >= yellowThreshold) return "bg-yellow-500";
    if (ratio >= greenThreshold) return "bg-lime-500";
    return "bg-green-500";
  }, [getSettingForLocation]);

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
                    value={locationRangeFromInput}
                    onChange={(e) => setLocationRangeFromInput(e.target.value.toUpperCase())}
                    className="w-32 font-mono"
                    data-testid="input-location-range-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location-range-to">ПО</Label>
                  <Input
                    id="location-range-to"
                    placeholder="A199"
                    value={locationRangeToInput}
                    onChange={(e) => setLocationRangeToInput(e.target.value.toUpperCase())}
                    className="w-32 font-mono"
                    data-testid="input-location-range-to"
                  />
                </div>
                {(locationRangeFromInput || locationRangeToInput) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLocationRangeFromInput("");
                      setLocationRangeToInput("");
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
                      <LocationsManagementTable
                        locations={paginatedLocationList}
                        editingBarcode={editingBarcode}
                        onEditBarcode={handleEditBarcode}
                        onUpdateBarcode={handleUpdateBarcode}
                        onCancelEdit={handleCancelEditBarcode}
                        onDeleteLocation={handleDeleteLocation}
                      />
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {locationList.length} локаций введено
                    {(locationRangeFrom || locationRangeTo) && ` (найдено: ${filteredLocationList.length})`}
                  </p>
                  
                  {/* Pagination controls */}
                  {filteredLocationList.length > 0 && (
                    <div className="flex items-center justify-between gap-4 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Показывать:</Label>
                        <Select value={itemsPerPage.toString()} onValueChange={(v) => {
                          setItemsPerPage(parseInt(v));
                          setCurrentPage(1);
                        }}>
                          <SelectTrigger className="h-8 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="200">200</SelectItem>
                            <SelectItem value="400">400</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          Показано {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredLocationList.length)} из {filteredLocationList.length}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          ««
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          «
                        </Button>
                        <span className="text-sm px-2">
                          Страница {currentPage} из {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          »
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          »»
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {hasMoreLocations && !((locationRangeFrom || locationRangeTo)) && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-500">
                      Используйте фильтр диапазона или пагинацию для навигации по локациям.
                    </p>
                  )}
                </div>
              </div>

              {/* CSV Upload */}
              <div className="space-y-2">
                <Label>Массовая загрузка через CSV</Label>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleDownloadTemplate}
                    data-testid="button-download-template"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать шаблон
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('csv-upload-input')?.click()}
                    data-testid="button-upload-csv"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Загрузить CSV файл
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleClearAllLocations}
                    disabled={clearAllLocationsMutation.isPending}
                    data-testid="button-clear-all-locations"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {clearAllLocationsMutation.isPending ? "Удаление..." : "Очистить все локации"}
                  </Button>
                  <input
                    id="csv-upload-input"
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvUpload}
                    className="hidden"
                    data-testid="input-csv-upload"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  1. Скачайте шаблон → 2. Заполните данные → 3. Загрузите обратно
                </p>
                <p className="text-sm text-destructive">
                  ⚠️ Кнопка "Очистить все локации" удалит ВСЕ локации из базы данных перед новой загрузкой
                </p>
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
                      activeLocations={activeLocations}
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
                onChange={handleTskuInputChange}
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
                onChange={handleMaxqInputChange}
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
          <LocationTable
            locationsByLetter={locationsByLetter}
            getSettingForLocation={getSettingForLocation}
            getSkuColor={getSkuColor}
            getQuantityColor={getQuantityColor}
          />
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
