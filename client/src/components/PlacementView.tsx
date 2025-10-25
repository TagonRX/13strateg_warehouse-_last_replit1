import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Usb, Smartphone, Wifi, Check, X, Package } from "lucide-react";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import type { PendingPlacement, InventoryItem, ActiveLocation } from "@shared/schema";

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

  // Fetch pending placements
  const { data: pendingPlacements = [] } = useQuery<PendingPlacement[]>({
    queryKey: ["/api/pending-placements"],
  });

  // Fetch active locations with barcodes
  const { data: activeLocations = [] } = useQuery<ActiveLocation[]>({
    queryKey: ["/api/warehouse/active-locations"],
  });

  // Create barcode-to-location mapping
  const barcodeToLocationMap = useMemo(() => {
    const map = new Map<string, string>();
    activeLocations.forEach(loc => {
      if (loc.barcode) {
        map.set(loc.barcode.toUpperCase(), loc.location.toUpperCase());
      }
    });
    return map;
  }, [activeLocations]);

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
    // Trim whitespace from scanner input
    const cleanBarcode = barcode.trim();
    setScannedBarcode(cleanBarcode);
    
    // Find placement with this barcode
    const placement = pendingPlacements.find(p => p.barcode === cleanBarcode);
    
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

  const handleLocationScanned = async (scannedCode: string) => {
    // Trim whitespace from scanner input
    const cleanCode = scannedCode.trim();
    setScannedLocation(cleanCode);

    if (!currentPlacement) return;

    // Determine actual location from scanned code
    // First, check direct match (location name)
    let actualLocation = cleanCode.toUpperCase();
    
    // If not a direct match, check if it's a location barcode
    if (cleanCode.toUpperCase() !== targetLocation.toUpperCase()) {
      const locationFromBarcode = barcodeToLocationMap.get(cleanCode.toUpperCase());
      if (locationFromBarcode) {
        actualLocation = locationFromBarcode;
      }
    }

    // Check if actual location matches target location
    if (actualLocation === targetLocation.toUpperCase()) {
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
            location: targetLocation.toUpperCase(),
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

        const verificationMethod = barcodeToLocationMap.has(cleanCode.toUpperCase()) 
          ? "баркод локации" 
          : "название локации";
        
        toast({
          title: "✅ Правильная локация!",
          description: `${currentPlacement.name || currentPlacement.barcode} → ${targetLocation.toUpperCase()} (проверено: ${verificationMethod})`,
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

      const scannedInfo = barcodeToLocationMap.has(cleanCode.toUpperCase())
        ? `баркод локации ${actualLocation}`
        : `локация ${actualLocation}`;

      toast({
        title: "❌ Неправильная локация!",
        description: `Ожидалось: ${targetLocation}, отсканировано: ${scannedInfo}`,
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

  return (
    <div className="p-6 overflow-y-auto">
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
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={scannerMode === "usb" ? "default" : "outline"}
                        onClick={() => setScannerMode("usb")}
                        className="flex-1 gap-2"
                        data-testid="button-scanner-usb"
                      >
                        <Usb className="w-4 h-4" />
                        Сканер
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p data-testid="tooltip-scanner-mode-usb">USB сканер, Zebra TC57 и другие устройства с эмуляцией клавиатуры</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={scannerMode === "phone" ? "default" : "outline"}
                        onClick={() => setScannerMode("phone")}
                        className="flex-1 gap-2"
                        data-testid="button-scanner-phone"
                      >
                        <Smartphone className="w-4 h-4" />
                        Камера
                        {scannerMode === "phone" && (
                          <Wifi className={`w-4 h-4 ${isPhoneConnected ? "text-green-500" : "text-red-500"}`} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p data-testid="tooltip-scanner-mode-phone">Сканирование через камеру смартфона (требуется WebSocket подключение)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xs text-muted-foreground text-center" data-testid="text-scanner-mode-help">
                  {scannerMode === "usb" 
                    ? "Режим для USB сканеров, Zebra TC57 и других устройств с эмуляцией клавиатуры"
                    : "Режим для сканирования камерой смартфона через WebSocket"
                  }
                </p>
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
                      placeholder={scannerMode === "usb" ? "Отсканируйте сканером или введите вручную" : "Отсканируйте камерой телефона"}
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
                      placeholder={scannerMode === "usb" ? "Отсканируйте сканером или введите вручную" : "Отсканируйте камерой телефона"}
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
  );
}
