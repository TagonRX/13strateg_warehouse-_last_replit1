import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Usb, Camera, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  label?: string;
}

export default function BarcodeScanner({ onScan, label = "Штрихкод" }: BarcodeScannerProps) {
  const [mode, setMode] = useState<"usb" | "mobile">("usb");
  const [barcode, setBarcode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Auto-focus для USB сканера
  useEffect(() => {
    if (mode === "usb" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  // Start camera when isCameraActive becomes true
  useEffect(() => {
    if (isCameraActive && mode === "mobile") {
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
      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Success callback
          onScan(decodedText);
          stopCamera();
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

  const stopCamera = async () => {
    await cleanupCamera();
    setIsCameraActive(false);
    setCameraError(null);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{label}</CardTitle>
        <CardDescription>Выберите способ сканирования</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "usb" | "mobile")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="usb" data-testid="tab-usb-scanner">
              <Usb className="w-4 h-4 mr-2" />
              USB Сканер
            </TabsTrigger>
            <TabsTrigger value="mobile" data-testid="tab-mobile-scanner">
              <Smartphone className="w-4 h-4 mr-2" />
              Камера
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="usb" className="mt-4">
            <form onSubmit={handleUSBScan} className="space-y-4">
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
                  <div id="qr-reader" className="w-full rounded-md overflow-hidden"></div>
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
