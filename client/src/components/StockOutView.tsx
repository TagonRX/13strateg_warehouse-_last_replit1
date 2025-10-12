import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getWarehouseLoading, pickItemByBarcode, deleteInventoryItem, deleteLocation } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Search, Package, Barcode, ChevronDown, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [limitFilter, setLimitFilter] = useState<string>("all");
  const [lastPickedItem, setLastPickedItem] = useState<any>(null);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());

  const { data: locations = [], isLoading } = useQuery<LocationData[]>({
    queryKey: ["/api/warehouse/loading"],
  });

  const pickMutation = useMutation({
    mutationFn: pickItemByBarcode,
    onSuccess: (item) => {
      setLastPickedItem(item);
      setBarcodeInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
      toast({
        title: "Item Picked",
        description: `${item.name} (${item.sku}) has been picked successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Pick Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/loading"] });
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

  const handlePickItem = () => {
    if (!barcodeInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a barcode",
        variant: "destructive",
      });
      return;
    }
    pickMutation.mutate(barcodeInput.trim());
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
                  <SelectItem value="all">All</SelectItem>
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
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-semibold">{location.location}</span>
                              <Badge variant="secondary" data-testid={`badge-sku-count-${location.location}`}>
                                {location.skuCount} SKU{location.skuCount !== 1 ? 's' : ''}
                              </Badge>
                              <Badge variant="outline" data-testid={`badge-total-qty-${location.location}`}>
                                {location.totalQuantity} units
                              </Badge>
                            </div>
                            {user.role === "admin" && (
                              <Button
                                data-testid={`button-delete-location-${location.location}`}
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLocation(location.location, location.items.length);
                                }}
                                className="h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </AccordionTrigger>
                      </div>
                      <AccordionContent>
                        <div className="space-y-2 px-4 pt-2">
                          {location.items.map((item) => (
                            <div
                              key={item.id}
                              data-testid={`item-${item.id}`}
                              className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover-elevate"
                            >
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium" data-testid={`text-sku-${item.id}`}>
                                    {item.sku}
                                  </span>
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-qty-${item.id}`}>
                                    Qty: {item.quantity}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground" data-testid={`text-name-${item.id}`}>
                                  {item.name}
                                </div>
                                {item.barcode && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Barcode className="h-3 w-3" />
                                    <span data-testid={`text-barcode-${item.id}`}>{item.barcode}</span>
                                  </div>
                                )}
                              </div>
                              {user.role === "admin" && (
                                <Button
                                  data-testid={`button-delete-item-${item.id}`}
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteItem(item.id, item.name)}
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
            <CardTitle className="flex items-center gap-2">
              <Barcode className="h-5 w-5" />
              Pick Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Scan or Enter Barcode</label>
              <div className="flex gap-2">
                <Input
                  data-testid="input-barcode"
                  placeholder="Scan barcode here..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handlePickItem();
                    }
                  }}
                  autoFocus
                />
                <Button
                  data-testid="button-pick-item"
                  onClick={handlePickItem}
                  disabled={pickMutation.isPending}
                >
                  {pickMutation.isPending ? "Picking..." : "Pick"}
                </Button>
              </div>
            </div>

            {lastPickedItem && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <Package className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-300">
                  <div className="font-semibold" data-testid="text-last-picked-name">
                    {lastPickedItem.name}
                  </div>
                  <div className="text-sm" data-testid="text-last-picked-sku">
                    SKU: {lastPickedItem.sku} | Qty: {lastPickedItem.quantity}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t space-y-2">
              <h3 className="text-sm font-medium">Instructions</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Scan or enter the barcode of the item to pick</li>
                <li>• Item will be marked as PICKED and removed from stock</li>
                <li>• Use the location list on the left to view available items</li>
                {user.role === "admin" && (
                  <li>• As admin, you can delete individual items or entire locations</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
