import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, Keyboard, Plus, Trash2, Wifi, AlertTriangle } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useWebSocket } from "@/hooks/useWebSocket";

interface BarcodeMapping {
  code: string;
  qty: number;
}

interface BarcodeEditorProps {
  value: BarcodeMapping[];
  onChange: (mappings: BarcodeMapping[]) => void;
  totalQuantity: number;
}

export default function BarcodeEditor({ value, onChange, totalQuantity }: BarcodeEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"usb" | "camera">("usb");
  const [scannedCode, setScannedCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Working copy of barcodes (not saved until confirmation)
  const [workingBarcodes, setWorkingBarcodes] = useState<BarcodeMapping[]>([]);
  const [originalBarcodes, setOriginalBarcodes] = useState<BarcodeMapping[]>([]);
  
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isConnected, lastMessage } = useWebSocket();
  const lastProcessedMessageRef = useRef<any>(null);

  const mappedQuantity = workingBarcodes.reduce((sum, m) => sum + m.qty, 0);
  const unmappedQuantity = totalQuantity - mappedQuantity;

  // Initialize working copy when dialog opens
  useEffect(() => {
    if (isOpen) {
      setWorkingBarcodes([...value]);
      setOriginalBarcodes([...value]);
      setShowConfirmation(false);
    }
  }, [isOpen, value]);

  // Handle remote scans from phone (only when dialog is open)
  useEffect(() => {
    if (isOpen && lastMessage?.type === "barcode_scanned") {
      if (lastProcessedMessageRef.current !== lastMessage) {
        lastProcessedMessageRef.current = lastMessage;
        const { barcode, qty } = lastMessage;
        const quantity = qty || 1;
        
        // Use functional update to avoid stale closure
        setWorkingBarcodes(prev => {
          const currentMapped = prev.reduce((sum, m) => sum + m.qty, 0);
          if (currentMapped + quantity > totalQuantity) {
            alert(`Нельзя добавить ${quantity} баркод(ов) с телефона: превышен лимит ${totalQuantity} товар(ов). Свободно: ${totalQuantity - currentMapped}`);
            return prev; // Return unchanged
          }
          
          // Add as separate entries (qty times)
          const newEntries: BarcodeMapping[] = [];
          for (let i = 0; i < quantity; i++) {
            newEntries.push({ code: barcode, qty: 1 });
          }
          return [...prev, ...newEntries];
        });
      }
    }
  }, [isOpen, lastMessage, totalQuantity]);

  useEffect(() => {
    if (isOpen && mode === "usb" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, mode]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const html5QrCode = new Html5Qrcode("barcode-editor-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Use functional update to avoid stale closure
          setWorkingBarcodes(prev => {
            const currentMapped = prev.reduce((sum, m) => sum + m.qty, 0);
            if (currentMapped >= totalQuantity) {
              alert(`Нельзя добавить баркод: превышен лимит ${totalQuantity} товар(ов)`);
              return prev; // Return unchanged
            }
            
            return [...prev, { code: decodedText, qty: 1 }];
          });
          stopCamera();
        },
        (errorMessage) => {
          console.debug("QR scan error:", errorMessage);
        }
      );

      setIsCameraActive(true);
      setCameraError(null);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Не удалось запустить камеру");
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.error("Error stopping camera:", err);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Auto-add barcode on USB scan (Enter key)
  const handleUsbScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedCode.trim()) return;

    // Check capacity
    if (mappedQuantity >= totalQuantity) {
      alert(`Нельзя добавить баркод: превышен лимит ${totalQuantity} товар(ов)`);
      setScannedCode("");
      return;
    }

    // Always add as new entry with qty=1
    setWorkingBarcodes([...workingBarcodes, { code: scannedCode, qty: 1 }]);
    setScannedCode("");
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Manual add with custom quantity
  const handleManualAdd = () => {
    if (!manualCode.trim()) return;
    
    const qty = parseInt(manualQty) || 1;
    if (qty <= 0) return;

    // Check capacity
    if (mappedQuantity + qty > totalQuantity) {
      alert(`Нельзя добавить ${qty} баркод(ов): превышен лимит ${totalQuantity} товар(ов). Свободно: ${unmappedQuantity}`);
      return;
    }

    // Add as separate entries (qty times)
    const newEntries: BarcodeMapping[] = [];
    for (let i = 0; i < qty; i++) {
      newEntries.push({ code: manualCode, qty: 1 });
    }
    
    setWorkingBarcodes([...workingBarcodes, ...newEntries]);
    setManualCode("");
    setManualQty("1");
  };

  const handleRemoveBarcode = (index: number) => {
    setWorkingBarcodes(workingBarcodes.filter((_, i) => i !== index));
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveBarcode(index);
      return;
    }
    
    // Check capacity for quantity increase
    const oldQty = workingBarcodes[index].qty;
    const qtyDelta = newQty - oldQty;
    
    if (qtyDelta > 0 && mappedQuantity + qtyDelta > totalQuantity) {
      alert(`Нельзя увеличить количество: превышен лимит ${totalQuantity} товар(ов). Свободно: ${unmappedQuantity}`);
      return;
    }
    
    setWorkingBarcodes(workingBarcodes.map((m, i) => 
      i === index ? { ...m, qty: newQty } : m
    ));
  };

  const handleConfirm = () => {
    onChange(workingBarcodes);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setWorkingBarcodes([...originalBarcodes]);
    setIsOpen(false);
  };

  const hasChanges = JSON.stringify(workingBarcodes) !== JSON.stringify(originalBarcodes);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && hasChanges) {
        setShowConfirmation(true);
      } else {
        setIsOpen(open);
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          type="button" 
          size="sm" 
          variant="outline" 
          className="h-8"
          data-testid="button-open-barcode-editor"
        >
          <Camera className="w-3 h-3 mr-1" />
          {value.length > 0 ? `${value.length} баркод(а)` : "Добавить"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактировать баркоды</DialogTitle>
        </DialogHeader>

        {/* WebSocket connection indicator */}
        {isConnected && (
          <Alert className="py-2">
            <Wifi className="h-4 w-4" />
            <AlertDescription>
              <span className="text-green-600 dark:text-green-400">
                🟢 Принимает баркоды с телефона
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Quantity status */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-2 bg-muted rounded">
              <div className="text-muted-foreground text-xs">Всего товаров</div>
              <div className="font-semibold text-lg">{totalQuantity}</div>
            </div>
            <div className="p-2 bg-muted rounded">
              <div className="text-muted-foreground text-xs">С баркодом</div>
              <div className="font-semibold text-lg">{mappedQuantity}</div>
            </div>
            <div className="p-2 bg-muted rounded">
              <div className="text-muted-foreground text-xs">Без баркода</div>
              <div className="font-semibold text-lg">{unmappedQuantity}</div>
            </div>
          </div>

          {/* Warning if unmapped */}
          {unmappedQuantity > 0 && workingBarcodes.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                ⚠️ Осталось {unmappedQuantity} товар(ов) без баркода
              </AlertDescription>
            </Alert>
          )}

          {/* Scanner tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "usb" | "camera")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="usb" data-testid="tab-usb-scanner">
                <Keyboard className="w-4 h-4 mr-2" />
                USB Сканер
              </TabsTrigger>
              <TabsTrigger value="camera" data-testid="tab-camera-scanner">
                <Camera className="w-4 h-4 mr-2" />
                Камера
              </TabsTrigger>
            </TabsList>

            <TabsContent value="usb" className="space-y-3">
              {/* Auto-scan input */}
              <div>
                <div className="text-sm font-medium mb-2">Сканирование (авто-добавление)</div>
                <form onSubmit={handleUsbScan}>
                  <Input
                    ref={inputRef}
                    value={scannedCode}
                    onChange={(e) => setScannedCode(e.target.value)}
                    placeholder="Отсканируйте баркод (Enter для добавления)..."
                    className="font-mono"
                    data-testid="input-usb-barcode"
                  />
                </form>
                <p className="text-xs text-muted-foreground mt-1">
                  Каждый скан добавляет новую строку, даже если баркод одинаковый
                </p>
              </div>

              {/* Manual input */}
              <div className="border-t pt-3">
                <div className="text-sm font-medium mb-2">Ручной ввод</div>
                <div className="flex gap-2">
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Введите баркод вручную..."
                    className="font-mono flex-1"
                    data-testid="input-manual-barcode"
                  />
                  <Input
                    type="number"
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    placeholder="Кол-во"
                    className="w-20"
                    min={1}
                    data-testid="input-manual-qty"
                  />
                  <Button 
                    type="button" 
                    onClick={handleManualAdd}
                    data-testid="button-add-manual"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Добавить
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="camera" className="space-y-4">
              {!isCameraActive ? (
                <div className="space-y-2">
                  <Button 
                    onClick={startCamera} 
                    className="w-full"
                    data-testid="button-start-camera"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Включить камеру
                  </Button>
                  {cameraError && (
                    <p className="text-sm text-destructive">{cameraError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Баркоды автоматически добавляются после сканирования
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div id="barcode-editor-reader" className="w-full" />
                  <Button 
                    onClick={stopCamera} 
                    variant="outline" 
                    className="w-full"
                    data-testid="button-stop-camera"
                  >
                    Остановить камеру
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Barcode list */}
          {workingBarcodes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Добавленные баркоды ({workingBarcodes.length}):
                </div>
                {hasChanges && (
                  <Badge variant="secondary" className="text-xs">
                    Есть изменения
                  </Badge>
                )}
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto border rounded p-2">
                {workingBarcodes.map((mapping, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 p-2 bg-muted rounded hover-elevate"
                    data-testid={`barcode-item-${index}`}
                  >
                    <div className="w-8 text-xs text-muted-foreground">
                      #{index + 1}
                    </div>
                    <div className="flex-1 font-mono text-sm truncate" title={mapping.code}>
                      {mapping.code}
                    </div>
                    <Input
                      type="number"
                      value={mapping.qty}
                      onChange={(e) => handleUpdateQuantity(index, parseInt(e.target.value) || 0)}
                      className="h-8 w-16 text-center"
                      min={1}
                      data-testid={`input-qty-${index}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveBarcode(index)}
                      data-testid={`button-remove-${index}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Было/Стало comparison */}
          {hasChanges && (
            <div className="border rounded p-3 bg-muted/30">
              <div className="text-sm font-medium mb-2">Изменения:</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Было:</div>
                  <div className="space-y-0.5">
                    {originalBarcodes.length === 0 ? (
                      <div className="text-muted-foreground italic">Нет баркодов</div>
                    ) : (
                      originalBarcodes.map((b, i) => (
                        <div key={i} className="font-mono text-xs truncate" title={b.code}>
                          {b.code} ({b.qty})
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Стало:</div>
                  <div className="space-y-0.5">
                    {workingBarcodes.length === 0 ? (
                      <div className="text-muted-foreground italic">Нет баркодов</div>
                    ) : (
                      workingBarcodes.map((b, i) => (
                        <div key={i} className="font-mono text-xs truncate" title={b.code}>
                          {b.code} ({b.qty})
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button 
              onClick={handleConfirm} 
              className="flex-1"
              data-testid="button-confirm"
              disabled={!hasChanges}
            >
              Подтвердить
            </Button>
            <Button 
              onClick={handleCancel} 
              variant="outline"
              className="flex-1"
              data-testid="button-cancel"
            >
              Отменить
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Confirmation dialog when closing with unsaved changes */}
      {showConfirmation && (
        <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Несохраненные изменения</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                У вас есть несохраненные изменения. Что вы хотите сделать?
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    setShowConfirmation(false);
                    handleConfirm();
                  }}
                  className="flex-1"
                >
                  Сохранить и закрыть
                </Button>
                <Button 
                  onClick={() => {
                    setShowConfirmation(false);
                    handleCancel();
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Отменить изменения
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
