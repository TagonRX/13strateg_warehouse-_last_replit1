import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Keyboard, Plus, Trash2 } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mappedQuantity = value.reduce((sum, m) => sum + m.qty, 0);
  const unmappedQuantity = totalQuantity - mappedQuantity;

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
          setScannedCode(decodedText);
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

  const handleAddBarcode = () => {
    if (!scannedCode.trim()) return;

    const existing = value.find(m => m.code === scannedCode);
    
    if (existing) {
      // Increment quantity if barcode already exists
      onChange(value.map(m => 
        m.code === scannedCode 
          ? { ...m, qty: m.qty + 1 }
          : m
      ));
    } else {
      // Add new barcode with quantity 1
      onChange([...value, { code: scannedCode, qty: 1 }]);
    }

    setScannedCode("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleUpdateQuantity = (code: string, qty: number) => {
    if (qty <= 0) {
      onChange(value.filter(m => m.code !== code));
    } else {
      onChange(value.map(m => 
        m.code === code ? { ...m, qty } : m
      ));
    }
  };

  const handleRemoveBarcode = (code: string) => {
    onChange(value.filter(m => m.code !== code));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddBarcode();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Редактировать баркоды</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quantity status */}
          <div className="flex gap-2 text-sm">
            <div className="flex-1 p-2 bg-muted rounded">
              <div className="text-muted-foreground">Всего товаров</div>
              <div className="font-semibold">{totalQuantity}</div>
            </div>
            <div className="flex-1 p-2 bg-muted rounded">
              <div className="text-muted-foreground">С баркодом</div>
              <div className="font-semibold">{mappedQuantity}</div>
            </div>
            <div className="flex-1 p-2 bg-muted rounded">
              <div className="text-muted-foreground">Без баркода</div>
              <div className="font-semibold">{unmappedQuantity}</div>
            </div>
          </div>

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

            <TabsContent value="usb" className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-2">
                <Input
                  ref={inputRef}
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  placeholder="Отсканируйте или введите баркод..."
                  className="font-mono"
                  data-testid="input-usb-barcode"
                />
                <Button type="submit" className="w-full" data-testid="button-add-barcode">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить баркод
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="camera" className="space-y-4">
              {!isCameraActive ? (
                <div className="space-y-2">
                  {scannedCode && (
                    <div className="p-3 bg-muted rounded font-mono text-sm">
                      Отсканирован: {scannedCode}
                    </div>
                  )}
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
                  {scannedCode && (
                    <Button 
                      onClick={handleAddBarcode} 
                      className="w-full"
                      data-testid="button-add-scanned"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить баркод
                    </Button>
                  )}
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
          {value.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Добавленные баркоды:</div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {value.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <div className="flex-1 font-mono text-sm truncate" title={mapping.code}>
                      {mapping.code}
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={mapping.qty}
                        onChange={(e) => handleUpdateQuantity(mapping.code, parseInt(e.target.value) || 0)}
                        className="h-8 w-20 text-center"
                        min={0}
                        max={totalQuantity}
                        data-testid={`input-qty-${index}`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveBarcode(mapping.code)}
                        data-testid={`button-remove-${index}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unmappedQuantity > 0 && value.length > 0 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
              ⚠️ Осталось {unmappedQuantity} товар(ов) без баркода
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
