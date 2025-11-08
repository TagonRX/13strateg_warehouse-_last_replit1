import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getWarehouseLoading, pickItemByBarcode, deleteInventoryItem, deleteLocation } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Search, Package, Barcode, ChevronDown, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import BarcodeScanner from "./BarcodeScanner";

type LocationData = {
  location: string;
  skuCount: number;
  totalQuantity: number;
  items: {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    barcode?: string;
  }[];
};

export default function StockOutView({ user }: { user: { role: string } }) {
  const { toast } = useToast();
  const [searchLocation, setSearchLocation] = useState("");
  const [limitFilter, setLimitFilter] = useState<string>("10");
  const [lastPickedItem, setLastPickedItem] = useState<any>(null);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastAction, setLastAction] = useState<{ type: string; data: any } | null>(null);

  const { data: locations = [], isLoading } = useQuery<LocationData[]>({
    queryKey: ["/api/warehouse/loading"],
  });

  const pickMutation = useMutation({
    mutationFn: pickItemByBarcode,
    onSuccess: (item) => {
      setLastPickedItem(item);
      setLastAction({ type: 'pick', data: { ...item, barcode: barcodeInput } });
      setBarcodeInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Товар списан",
        description: `${item.name} (${item.sku}) успешно списан`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка списания",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Item Deleted",
        description: "Item has been removed from inventory",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Location Deleted",
        description: `${data.deleted} items have been removed from inventory`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleScan = (barcode: string) => {
    if (!barcode.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите штрихкод",
        variant: "destructive",
      });
      return;
    }
    setBarcodeInput(barcode.trim());
    pickMutation.mutate(barcode.trim());
  };

  const handleItemClick = (barcode: string) => {
    setBarcodeInput(barcode);
  };

  const handleUndo = async () => {
    if (!lastAction) {
      toast({
        title: "Нет действия для отмены",
        description: "История действий пуста",
        variant: "destructive",
      });
      return;
    }

    // For now, we can only undo pick actions
    if (lastAction.type === 'pick') {
      toast({
        title: "Отмена невозможна",
        description: "Функция отмены в разработке. Используйте 'Приход товара' для возврата товара на склад.",
        variant: "destructive",
      });
      setLastAction(null);
    }
  };

  const handleDeleteItem = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      deleteItemMutation.mutate(id);
    }
  };

  const handleDeleteLocation = (location: string, count: number) => {
    if (confirm(`Are you sure you want to delete location ${location} with ${count} items?`)) {
      deleteLocationMutation.mutate(location);
    }
  };

  const toggleLocationSelection = (location: string) => {
    const newSelected = new Set(selectedLocations);
    if (newSelected.has(location)) {
      newSelected.delete(location);
    } else {
      newSelected.add(location);
    }
    setSelectedLocations(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLocations.size === filteredLocations.length) {
      setSelectedLocations(new Set());
    } else {
      setSelectedLocations(new Set(filteredLocations.map(loc => loc.location)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLocations.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select locations to delete",
        variant: "destructive",
      });
      return;
    }

    // Calculate from all locations, not just filtered
    const totalItems = locations
      .filter(loc => selectedLocations.has(loc.location))
      .reduce((sum, loc) => sum + loc.items.length, 0);

    const selectedCount = selectedLocations.size;

    if (!confirm(`Delete ${selectedCount} locations with ${totalItems} total items?`)) {
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedLocations).map(location => deleteLocation(location))
      );
      
      setSelectedLocations(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      
      toast({
        title: "Bulk Delete Complete",
        description: `Deleted ${selectedCount} locations with ${totalItems} items`,
      });
    } catch (error: any) {
      toast({
        title: "Bulk Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Filter locations based on search and limit
  const filteredLocations = locations
    .filter(loc => {
      if (!searchLocation) return true;
      return loc.location.toLowerCase().startsWith(searchLocation.toLowerCase());
    })
    .slice(0, limitFilter === "all" ? undefined : parseInt(limitFilter));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-muted-foreground">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 h-full overflow-auto">
      {/* Left Panel: Location List */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Stock Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-location"
                  placeholder="Search location (e.g., A101)"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={limitFilter} onValueChange={setLimitFilter}>
                <SelectTrigger data-testid="select-limit-filter" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="all">Все</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions (Admin Only) */}
            {user.role === "admin" && filteredLocations.length > 0 && (
              <div className="flex gap-2 items-center">
                <Button
                  data-testid="button-select-all"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="flex-1"
                >
                  {selectedLocations.size === filteredLocations.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  data-testid="button-bulk-delete"
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={selectedLocations.size === 0}
                  className="flex-1"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedLocations.size})
                </Button>
              </div>
            )}

            {/* Location Accordion */}
            <div className="space-y-2">
              {filteredLocations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No locations found
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {filteredLocations.map((location) => (
                    <AccordionItem 
                      key={location.location} 
                      value={location.location}
                      data-testid={`accordion-location-${location.location}`}
                    >
                      <div className="flex items-center gap-2">
                        {user.role === "admin" && (
                          <Checkbox
                            data-testid={`checkbox-location-${location.location}`}
                            checked={selectedLocations.has(location.location)}
                            onCheckedChange={() => toggleLocationSelection(location.location)}
                          />
                        )}
                        <AccordionTrigger className="hover-elevate px-4 rounded-md flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold">{location.location}</span>
                            <Badge variant="secondary" data-testid={`badge-sku-count-${location.location}`}>
                              {location.skuCount} SKU{location.skuCount !== 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="outline" data-testid={`badge-total-qty-${location.location}`}>
                              {location.totalQuantity} units
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        {user.role === "admin" && (
                          <Button
                            data-testid={`button-delete-location-${location.location}`}
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteLocation(location.location, location.items.length)}
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <AccordionContent>
                        <div className="space-y-2 px-4 pt-2">
                          {location.items.flatMap((item) => 
                            Array.from({ length: item.quantity }, (_, index) => ({
                              ...item,
                              displayIndex: index + 1,
                              uniqueKey: `${item.id}-${index}`
                            }))
                          ).map((expandedItem) => (
                            <div
                              key={expandedItem.uniqueKey}
                              data-testid={`item-${expandedItem.uniqueKey}`}
                              onClick={() => handleItemClick(expandedItem.barcode || expandedItem.sku)}
                              className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover-elevate cursor-pointer active-elevate-2"
                            >
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium" data-testid={`text-sku-${expandedItem.uniqueKey}`}>
                                    {expandedItem.sku}
                                  </span>
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-num-${expandedItem.uniqueKey}`}>
                                    #{expandedItem.displayIndex}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground" data-testid={`text-name-${expandedItem.uniqueKey}`}>
                                  {expandedItem.name}
                                </div>
                                {expandedItem.barcode && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Barcode className="h-3 w-3" />
                                    <span data-testid={`text-barcode-${expandedItem.uniqueKey}`}>{expandedItem.barcode}</span>
                                  </div>
                                )}
                              </div>
                              {user.role === "admin" && (
                                <Button
                                  data-testid={`button-delete-item-${expandedItem.id}`}
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(expandedItem.id, expandedItem.name);
                                  }}
                                  className="h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Barcode Scanning */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Списание товара</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="barcode-input">Отсканируйте или введите штрихкод</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode-input"
                  data-testid="input-barcode-manual"
                  placeholder="Штрихкод..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleScan(barcodeInput);
                    }
                  }}
                  className="flex-1 font-mono"
                />
                <Button
                  data-testid="button-confirm-pick"
                  onClick={() => handleScan(barcodeInput)}
                  disabled={!barcodeInput.trim() || pickMutation.isPending}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                data-testid="button-undo"
                variant="outline"
                onClick={handleUndo}
                disabled={!lastAction}
                className="flex-1"
              >
                Отменить последнее
              </Button>
            </div>
          </CardContent>
        </Card>

        <BarcodeScanner onScan={handleScan} />

        {lastPickedItem && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <Package className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              <div className="font-semibold" data-testid="text-last-picked-name">
                {lastPickedItem.name}
              </div>
              <div className="text-sm" data-testid="text-last-picked-sku">
                SKU: {lastPickedItem.sku} | Осталось: {lastPickedItem.quantity}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium mb-2">Инструкция</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Нажмите на товар в списке слева - штрихкод автоматически появится в поле ввода</li>
              <li>• Или отсканируйте штрихкод сканером/телефоном</li>
              <li>• Нажмите "Подтвердить" для списания товара</li>
              <li>• Товар будет помечен как СПИСАН и удален из склада</li>
              {user.role === "admin" && (
                <li>• Администратор может удалять товары и локации целиком</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
