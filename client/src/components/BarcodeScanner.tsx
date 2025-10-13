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

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  label?: string;
}

export default function BarcodeScanner({ onScan, label = "Штрихкод" }: BarcodeScannerProps) {
  const [mode, setMode] = useState<"usb" | "mobile" | "remote">("usb");
  const { isConnected, lastMessage, sendMessage } = useWebSocket();
  const [barcode, setBarcode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Auto-focus для USB сканера
  useEffect(() => {
    if (mode === "usb" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  // Handle incoming WebSocket messages (for receiving scans from phone)
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned") {
      const scannedBarcode = lastMessage.barcode;
      onScan(scannedBarcode);
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
        },
        (decodedText) => {
          // Success callback
          if (mode === "remote") {
            // Remote mode: save code and keep camera active
            setLastScanned(decodedText);
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
    if (barcode.trim()) {
      onScan(barcode.trim());
      setBarcode("");
      inputRef.current?.focus();
    }
  };

  const handleMobileScan = () => {
    setCameraError(null);
    setIsCameraActive(true);
  };

  const handleRemoteSend = () => {
    if (lastScanned) {
      sendMessage({
        type: "remote_scan",
        barcode: lastScanned
      });
      setLastScanned(null); // Clear after sending
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
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{label}</CardTitle>
        <CardDescription>Выберите способ сканирования</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "usb" | "mobile" | "remote")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="usb" data-testid="tab-usb-scanner">
              <Usb className="w-4 h-4 mr-2" />
              USB
            </TabsTrigger>
            <TabsTrigger value="mobile" data-testid="tab-mobile-scanner">
              <Smartphone className="w-4 h-4 mr-2" />
              Камера
            </TabsTrigger>
            <TabsTrigger value="remote" data-testid="tab-remote-scanner">
              <Wifi className="w-4 h-4 mr-2" />
              Телефон
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="usb" className="mt-4">
            <form onSubmit={handleUSBScan} className="space-y-4">
              {isConnected && (
                <Alert>
                  <Wifi className="h-4 w-4" />
                  <AlertDescription>
                    <span className="text-green-600 dark:text-green-400">
                      🟢 Принимает сканы с телефона
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="usb-barcode">Отсканируйте или введите штрихкод</Label>
                <Input
                  id="usb-barcode"
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Наведите сканер..."
                  className="font-mono"
                  data-testid="input-usb-barcode"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-barcode">
                Подтвердить
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="mobile" className="mt-4">
            <div className="space-y-4">
              {!isCameraActive ? (
                <>
                  <Button
                    type="button"
                    onClick={handleMobileScan}
                    className="w-full"
                    data-testid="button-start-camera"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Включить камеру
                  </Button>
                  {cameraError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                      {cameraError}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div id="qr-reader-mobile" className="w-full rounded-md overflow-hidden"></div>
                  <Button
                    type="button"
                    onClick={stopCamera}
                    variant="outline"
                    className="w-full"
                    data-testid="button-stop-camera"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Остановить камеру
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="remote" className="mt-4">
            <div className="space-y-4">
              <Alert>
                <Wifi className="h-4 w-4" />
                <AlertDescription>
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
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Используйте телефон как беспроводной сканер для компьютера
                  </p>
                  <Button
                    type="button"
                    onClick={handleMobileScan}
                    className="w-full"
                    disabled={!isConnected}
                    data-testid="button-start-remote-scanner"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Включить камеру телефона
                  </Button>
                  {cameraError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                      {cameraError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div id="qr-reader-remote" className="w-full rounded-md overflow-hidden"></div>
                  
                  {lastScanned && (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 rounded-md">
                      <p className="text-xs text-muted-foreground mb-1">Отсканировано:</p>
                      <p className="font-mono font-bold text-green-700 dark:text-green-400">{lastScanned}</p>
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleRemoteSend}
                    disabled={!lastScanned || !isConnected}
                    className="w-full h-14 text-lg"
                    data-testid="button-send-to-computer"
                  >
                    <Wifi className="w-5 h-5 mr-2" />
                    Отправить на компьютер
                  </Button>

                  <Button
                    type="button"
                    onClick={stopCamera}
                    variant="outline"
                    className="w-full"
                    data-testid="button-stop-remote-camera"
                  >
                    <X className="w-4 h-4 mr-2" />
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
