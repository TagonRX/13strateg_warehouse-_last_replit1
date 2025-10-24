import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Usb, Smartphone, Wifi, Check, X, Package } from "lucide-react";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import type { PendingPlacement, InventoryItem } from "@shared/schema";

type ScannerMode = "usb" | "phone";
type PlacementStep = "scan_item" | "scan_location" | "success" | "error";

export default function PlacementView() {
  const [scannerMode, setScannerMode] = useState<ScannerMode>("usb");
  const [step, setStep] = useState<PlacementStep>("scan_item");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scannedLocation, setScannedLocation] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [currentPlacement, setCurrentPlacement] = useState<PendingPlacement | null>(null);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  const { toast } = useToast();
  const { isConnected: isPhoneConnected, lastMessage } = useWebSocket();

  // Filters for warehouse loading sidebar
  const [filterLetter, setFilterLetter] = useState("");
  const [filterSKU, setFilterSKU] = useState("");
  const [filterMaxQ, setFilterMaxQ] = useState("");

  // Fetch pending placements
  const { data: pendingPlacements = [] } = useQuery<PendingPlacement[]>({
    queryKey: ["/api/pending-placements"],
  });

  // Fetch inventory for warehouse loading
  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  // Global barcode input routing for USB mode
  const { inputRef: barcodeInputRef } = useGlobalBarcodeInput(
    scannerMode === "usb" && step === "scan_item"
  );
  const { inputRef: locationInputRef } = useGlobalBarcodeInput(
    scannerMode === "usb" && step === "scan_location"
  );

  // Handle WebSocket messages from phone scanner
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned" && scannerMode === "phone") {
      const code = lastMessage.barcode;
      
      if (step === "scan_item") {
        handleBarcodeScanned(code);
      } else if (step === "scan_location") {
        handleLocationScanned(code);
      }
    }
  }, [lastMessage, scannerMode, step]);

  const handleBarcodeScanned = async (barcode: string) => {
    setScannedBarcode(barcode);
    
    // Find placement with this barcode
    const placement = pendingPlacements.find(p => p.barcode === barcode);
    
    if (!placement) {
      toast({
        title: "Товар не найден",
        description: "Этот товар не ожидает размещения",
        variant: "destructive",
      });
      return;
    }

    setCurrentPlacement(placement);
    setTargetLocation(placement.location);
    setStep("scan_location");
  };

  const handleLocationScanned = async (location: string) => {
    setScannedLocation(location);

    if (!currentPlacement) return;

    // Check if scanned location matches target location
    if (location.toUpperCase() === targetLocation.toUpperCase()) {
      // Success! Move to inventory
      try {
        const response = await fetch("/api/placements/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            placementId: currentPlacement.id,
            location: location.toUpperCase(),
          }),
        });

        if (!response.ok) {
          throw new Error("Ошибка размещения");
        }

        setFeedback("success");
        setStep("success");

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/pending-placements"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });

        toast({
          title: "Успешно размещено!",
          description: `${currentPlacement.name || currentPlacement.barcode} → ${location.toUpperCase()}`,
        });

        // Reset after 2 seconds
        setTimeout(() => {
          resetForm();
        }, 2000);
      } catch (error: any) {
        console.error("Placement error:", error);
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось разместить товар",
          variant: "destructive",
        });
      }
    } else {
      // Error - wrong location
      setFeedback("error");
      setStep("error");

      toast({
        title: "Неправильная локация!",
        description: `Ожидалось: ${targetLocation}, отсканировано: ${location}`,
        variant: "destructive",
      });

      // Reset after 3 seconds
      setTimeout(() => {
        setStep("scan_location");
        setFeedback(null);
        setScannedLocation("");
      }, 3000);
    }
  };

  const resetForm = () => {
    setStep("scan_item");
    setScannedBarcode("");
    setScannedLocation("");
    setTargetLocation("");
    setCurrentPlacement(null);
    setFeedback(null);
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && scannedBarcode) {
      handleBarcodeScanned(scannedBarcode);
    }
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && scannedLocation) {
      handleLocationScanned(scannedLocation);
    }
  };

  // Filter warehouse loading
  const filteredInventory = inventory.filter((item) => {
    if (filterLetter && !item.location.startsWith(filterLetter.toUpperCase())) {
      return false;
    }
    if (filterSKU && !item.sku.toLowerCase().includes(filterSKU.toLowerCase())) {
      return false;
    }
    if (filterMaxQ && item.quantity > parseInt(filterMaxQ)) {
      return false;
    }
    return true;
  });

  // Group by location for warehouse loading
  const locationGroups = filteredInventory.reduce((acc, item) => {
    const loc = item.location;
    if (!acc[loc]) {
      acc[loc] = { count: 0, totalQty: 0 };
    }
    acc[loc].count += 1;
    acc[loc].totalQty += item.quantity;
    return acc;
  }, {} as Record<string, { count: number; totalQty: number }>);

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Warehouse Loading */}
      <div className="w-80 border-r bg-muted/50 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Загрузка склада</h2>
        </div>
        
        <div className="p-4 space-y-3 border-b">
          <div className="space-y-2">
            <Label htmlFor="filter-letter" className="text-sm">Буква локации</Label>
            <Input
              id="filter-letter"
              value={filterLetter}
              onChange={(e) => setFilterLetter(e.target.value.toUpperCase())}
              placeholder="A"
              maxLength={1}
              data-testid="input-filter-letter"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="filter-sku" className="text-sm">SKU содержит</Label>
            <Input
              id="filter-sku"
              value={filterSKU}
              onChange={(e) => setFilterSKU(e.target.value)}
              placeholder="Введите часть SKU"
              data-testid="input-filter-sku"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="filter-maxq" className="text-sm">Макс. кол-во</Label>
            <Input
              id="filter-maxq"
              type="number"
              value={filterMaxQ}
              onChange={(e) => setFilterMaxQ(e.target.value)}
              placeholder="10"
              data-testid="input-filter-maxq"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFilterLetter("");
              setFilterSKU("");
              setFilterMaxQ("");
            }}
            className="w-full"
            data-testid="button-reset-filters"
          >
            Сбросить фильтры
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {Object.entries(locationGroups).map(([location, data]) => (
              <Card key={location} className="p-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-semibold">{location}</span>
                  <div className="text-sm text-muted-foreground">
                    {data.count} товаров, {data.totalQty} шт.
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Placement Form */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Размещение товара
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scanner Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={scannerMode === "usb" ? "default" : "outline"}
                  onClick={() => setScannerMode("usb")}
                  className="flex-1 gap-2"
                  data-testid="button-scanner-usb"
                >
                  <Usb className="w-4 h-4" />
                  USB Сканер
                </Button>
                <Button
                  variant={scannerMode === "phone" ? "default" : "outline"}
                  onClick={() => setScannerMode("phone")}
                  className="flex-1 gap-2"
                  data-testid="button-scanner-phone"
                >
                  <Smartphone className="w-4 h-4" />
                  Телефон
                  {scannerMode === "phone" && (
                    <Wifi className={`w-4 h-4 ${isPhoneConnected ? "text-green-500" : "text-red-500"}`} />
                  )}
                </Button>
              </div>

              {/* Step 1: Scan Item */}
              {step === "scan_item" && (
                <div className="space-y-4">
                  <div className="p-4 border rounded-md bg-blue-50 dark:bg-blue-950">
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      Шаг 1: Отсканируйте штрихкод товара
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="item-barcode">Штрихкод товара</Label>
                    <Input
                      id="item-barcode"
                      ref={scannerMode === "usb" ? barcodeInputRef : undefined}
                      value={scannedBarcode}
                      onChange={(e) => setScannedBarcode(e.target.value)}
                      onKeyDown={handleBarcodeKeyDown}
                      placeholder={scannerMode === "usb" ? "Отсканируйте или введите" : "Отсканируйте с телефона"}
                      className="font-mono"
                      readOnly={scannerMode === "phone"}
                      data-testid="input-item-barcode"
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Товаров ожидает размещения: {pendingPlacements.length}
                  </div>
                </div>
              )}

              {/* Step 2: Scan Location */}
              {step === "scan_location" && currentPlacement && (
                <div className="space-y-4">
                  <div className="p-4 border rounded-md bg-orange-50 dark:bg-orange-950">
                    <p className="font-semibold text-orange-900 dark:text-orange-100">
                      Шаг 2: Отсканируйте локацию размещения
                    </p>
                  </div>

                  <div className="p-4 border rounded-md bg-muted">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Товар:</span>
                        <span className="font-semibold">{currentPlacement.name || currentPlacement.barcode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">SKU:</span>
                        <span className="font-mono">{currentPlacement.sku}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Целевая локация:</span>
                        <span className="font-mono font-bold text-lg text-primary">
                          {targetLocation}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="location-barcode">Штрихкод локации</Label>
                    <Input
                      id="location-barcode"
                      ref={scannerMode === "usb" ? locationInputRef : undefined}
                      value={scannedLocation}
                      onChange={(e) => setScannedLocation(e.target.value.toUpperCase())}
                      onKeyDown={handleLocationKeyDown}
                      placeholder={scannerMode === "usb" ? "Отсканируйте или введите" : "Отсканируйте с телефона"}
                      className="font-mono"
                      readOnly={scannerMode === "phone"}
                      data-testid="input-location-barcode"
                    />
                  </div>

                  <Button
                    variant="outline"
                    onClick={resetForm}
                    className="w-full"
                    data-testid="button-cancel-placement"
                  >
                    Отмена
                  </Button>
                </div>
              )}

              {/* Success Feedback */}
              {step === "success" && feedback === "success" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-32 h-32 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mb-4">
                    <Check className="w-20 h-20 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    Успешно размещено!
                  </p>
                </div>
              )}

              {/* Error Feedback */}
              {step === "error" && feedback === "error" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-32 h-32 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mb-4">
                    <X className="w-20 h-20 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                    Неправильная локация!
                  </p>
                  <p className="text-muted-foreground mt-2">
                    Ожидалось: {targetLocation}
                  </p>
                  <p className="text-muted-foreground">
                    Отсканировано: {scannedLocation}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Placements List */}
          {pendingPlacements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Ожидают размещения ({pendingPlacements.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Штрихкод</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Название</TableHead>
                        <TableHead>Состояние</TableHead>
                        <TableHead>Локация</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPlacements.map((placement) => (
                        <TableRow key={placement.id} data-testid={`row-placement-${placement.id}`}>
                          <TableCell className="font-mono text-sm">{placement.barcode}</TableCell>
                          <TableCell className="font-mono text-sm">{placement.sku}</TableCell>
                          <TableCell className="text-sm">{placement.name || "-"}</TableCell>
                          <TableCell className="text-sm">{placement.condition}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold">
                            {placement.location}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
