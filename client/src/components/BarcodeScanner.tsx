import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Usb, Camera, X, Wifi } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  label?: string;
}

export default function BarcodeScanner({ onScan, label = "Штрихкод / QR код" }: BarcodeScannerProps) {
  const [mode, setMode] = useState<"usb" | "mobile" | "remote">("usb");
  const { isConnected, lastMessage, sendMessage } = useWebSocket();
  const [barcode, setBarcode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastProcessedMessageRef = useRef<any>(null);

  // Глобальный автофокус на поле баркода (работает на всех страницах)
  const { inputRef } = useGlobalBarcodeInput(mode === "usb");

  // Handle incoming WebSocket messages (for receiving scans from phone)
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned") {
      // Prevent duplicate processing of the same message object
      if (lastProcessedMessageRef.current !== lastMessage) {
        lastProcessedMessageRef.current = lastMessage;
        const scannedBarcode = lastMessage.barcode;
        onScan(scannedBarcode);
      }
    }
  }, [lastMessage, onScan]);

  // Start camera when isCameraActive becomes true
  useEffect(() => {
    if (isCameraActive && (mode === "mobile" || mode === "remote")) {
      startCamera();
    }
    return () => {
      // Cleanup camera on unmount or when switching modes
      cleanupCamera();
    };
  }, [isCameraActive, mode]);

  const cleanupCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.error("Error cleaning up camera:", err);
      } finally {
        html5QrCodeRef.current = null;
      }
    }
  };

  const startCamera = async () => {
    try {
      const readerId = mode === "remote" ? "qr-reader-remote" : "qr-reader-mobile";
      const html5QrCode = new Html5Qrcode(readerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          // Html5Qrcode автоматически поддерживает все форматы: QR, CODE_128, EAN, UPC и другие
        },
        (decodedText) => {
          // Success callback
          if (mode === "remote") {
            // Remote mode: save code only if different and not currently sending
            setLastScanned(prev => {
              if (prev === decodedText || isSending) {
                return prev; // Don't update if same code or currently sending
              }
              return decodedText;
            });
          } else {
            // Mobile mode: scan and close
            onScan(decodedText);
            stopCamera();
          }
        },
        (errorMessage) => {
          // Error callback (can be ignored - happens frequently during scanning)
          console.debug("QR Code scan error:", errorMessage);
        }
      );
    } catch (err) {
      console.error("Camera start error:", err);
      setCameraError("Не удалось запустить камеру. Проверьте разрешения.");
      // Clean up on error
      await cleanupCamera();
      setIsCameraActive(false);
    }
  };

  const handleUSBScan = (e: React.FormEvent) => {
    e.preventDefault();
    // Get value directly from input to ensure we catch fast scanner input
    const inputValue = inputRef.current?.value || barcode;
    if (inputValue.trim()) {
      onScan(inputValue.trim());
      setBarcode("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      inputRef.current?.focus();
    }
  };

  // Handle Enter key on input directly for faster USB scanner response
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Предотвращает default поведение (submit формы)
      e.stopPropagation(); // Останавливает всплытие события к родителям
      const inputValue = inputRef.current?.value || barcode;
      if (inputValue.trim()) {
        onScan(inputValue.trim());
        setBarcode("");
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        inputRef.current?.focus();
      }
    }
  };

  const handleMobileScan = () => {
    setCameraError(null);
    setIsCameraActive(true);
  };

  const handleRemoteSend = () => {
    if (lastScanned && !isSending) {
      setIsSending(true);
      sendMessage({
        type: "remote_scan",
        barcode: lastScanned
      });
      
      // Clear after 1 second to allow scanning new code
      setTimeout(() => {
        setLastScanned(null);
        setIsSending(false);
      }, 1000);
    }
  };

  const stopCamera = async () => {
    await cleanupCamera();
    setIsCameraActive(false);
    setCameraError(null);
    setLastScanned(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2 p-3">
        <CardTitle className="text-sm">{label}</CardTitle>
        <CardDescription className="text-xs">Поддержка штрихкодов и QR кодов</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "usb" | "mobile" | "remote")}>
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="usb" data-testid="tab-usb-scanner" className="text-xs py-1">
              <Usb className="w-3 h-3 mr-1" />
              USB
            </TabsTrigger>
            <TabsTrigger value="mobile" data-testid="tab-mobile-scanner" className="text-xs py-1">
              <Camera className="w-3 h-3 mr-1" />
              Камера
            </TabsTrigger>
            <TabsTrigger value="remote" data-testid="tab-remote-scanner" className="text-xs py-1">
              <Wifi className="w-3 h-3 mr-1" />
              Телефон
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="usb" className="mt-2">
            <div className="space-y-2">
              {isConnected && (
                <Alert className="py-2">
                  <Wifi className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    <span className="text-green-600 dark:text-green-400">
                      🟢 Принимает сканы с телефона
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-1">
                <Label htmlFor="usb-barcode" className="text-xs">Отсканируйте или введите штрихкод</Label>
                <Input
                  id="usb-barcode"
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Наведите сканер..."
                  className="font-mono h-8 text-xs"
                  autoComplete="off"
                  data-testid="input-usb-barcode"
                />
              </div>
              <Button type="button" onClick={handleUSBScan} className="w-full h-8 text-xs" data-testid="button-submit-barcode">
                Подтвердить
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="mobile" className="mt-2">
            <div className="space-y-2">
              {!isCameraActive ? (
                <>
                  <Button
                    type="button"
                    onClick={handleMobileScan}
                    className="w-full h-8 text-xs"
                    data-testid="button-start-camera"
                  >
                    <Camera className="w-3 h-3 mr-1" />
                    Включить камеру
                  </Button>
                  {cameraError && (
                    <div className="bg-destructive/10 text-destructive text-xs p-2 rounded-md">
                      {cameraError}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <div id="qr-reader-mobile" className="w-full rounded-md overflow-hidden"></div>
                  <Button
                    type="button"
                    onClick={stopCamera}
                    variant="outline"
                    className="w-full h-8 text-xs"
                    data-testid="button-stop-camera"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Остановить камеру
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="remote" className="mt-2">
            <div className="space-y-2">
              <Alert className="py-2">
                <Wifi className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  {isConnected ? (
                    <span className="text-green-600 dark:text-green-400">
                      🟢 Подключено - готово к удаленному сканированию
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      🟡 Подключение...
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              {!isCameraActive ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Используйте телефон как беспроводной сканер для компьютера
                  </p>
                  <Button
                    type="button"
                    onClick={handleMobileScan}
                    className="w-full h-8 text-xs"
                    disabled={!isConnected}
                    data-testid="button-start-remote-scanner"
                  >
                    <Camera className="w-3 h-3 mr-1" />
                    Включить камеру телефона
                  </Button>
                  {cameraError && (
                    <div className="bg-destructive/10 text-destructive text-xs p-2 rounded-md">
                      {cameraError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div id="qr-reader-remote" className="w-full rounded-md overflow-hidden"></div>
                  
                  {lastScanned && (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-2 rounded-md">
                      <p className="text-[10px] text-muted-foreground mb-1">Отсканировано:</p>
                      <p className="font-mono text-xs font-bold text-green-700 dark:text-green-400">{lastScanned}</p>
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleRemoteSend}
                    disabled={!lastScanned || !isConnected || isSending}
                    className="w-full h-10 text-sm"
                    data-testid="button-send-to-computer"
                  >
                    <Wifi className="w-4 h-4 mr-1" />
                    {isSending ? "Отправлено ✓" : "Отправить на компьютер"}
                  </Button>

                  <Button
                    type="button"
                    onClick={stopCamera}
                    variant="outline"
                    className="w-full h-8 text-xs"
                    data-testid="button-stop-remote-camera"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Остановить камеру
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
