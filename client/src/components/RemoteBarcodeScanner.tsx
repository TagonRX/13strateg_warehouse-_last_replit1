import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, X, Wifi, Send } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function RemoteBarcodeScanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isSending, setIsSending] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const { isConnected, sendMessage } = useWebSocket();

  useEffect(() => {
    if (isCameraActive && isOpen) {
      startCamera();
    }
    return () => {
      cleanupCamera();
    };
  }, [isCameraActive, isOpen]);

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
      const html5QrCode = new Html5Qrcode("remote-scanner-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Save scanned code, don't send automatically
          setLastScanned(prev => {
            if (prev === decodedText || isSending) {
              return prev;
            }
            return decodedText;
          });
        },
        (errorMessage) => {
          console.debug("QR Code scan error:", errorMessage);
        }
      );
    } catch (err) {
      console.error("Camera start error:", err);
      setCameraError("Не удалось запустить камеру. Проверьте разрешения.");
      await cleanupCamera();
      setIsCameraActive(false);
    }
  };

  const handleStartCamera = () => {
    setCameraError(null);
    setIsCameraActive(true);
  };

  const handleStopCamera = async () => {
    await cleanupCamera();
    setIsCameraActive(false);
    setCameraError(null);
    setLastScanned(null);
  };

  const handleSend = () => {
    if (lastScanned && !isSending) {
      const qty = parseInt(quantity) || 1;
      setIsSending(true);
      
      sendMessage({
        type: "remote_scan",
        barcode: lastScanned,
        qty
      });
      
      // Clear after 1 second
      setTimeout(() => {
        setLastScanned(null);
        setQuantity("1");
        setIsSending(false);
      }, 1000);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      handleStopCamera();
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          className="w-full sm:w-auto"
          data-testid="button-open-remote-scanner"
        >
          <Wifi className="w-4 h-4 mr-2" />
          Передача баркодов на компьютер
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Передача баркодов</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection status */}
          <Alert className={isConnected ? "border-green-500" : "border-amber-500"}>
            <Wifi className="h-4 w-4" />
            <AlertDescription>
              {isConnected ? (
                <span className="text-green-600 dark:text-green-400">
                  🟢 Подключено - готово к передаче
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
                Сканируйте баркоды и отправляйте их на компьютер для редактирования товаров
              </p>
              <Button
                type="button"
                onClick={handleStartCamera}
                className="w-full"
                disabled={!isConnected}
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
            </div>
          ) : (
            <div className="space-y-4">
              <div id="remote-scanner-reader" className="w-full rounded-md overflow-hidden"></div>
              
              {lastScanned && (
                <div className="space-y-3">
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Отсканировано:</p>
                    <p className="font-mono font-bold text-green-700 dark:text-green-400">{lastScanned}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity">Количество</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      min="1"
                      max="999"
                      className="font-mono"
                      data-testid="input-quantity"
                    />
                    <p className="text-xs text-muted-foreground">
                      Укажите количество товаров с этим баркодом (по умолчанию 1)
                    </p>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={handleSend}
                disabled={!lastScanned || !isConnected || isSending}
                className="w-full h-12 text-base"
                data-testid="button-send"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSending ? "Отправлено ✓" : "Отправить на компьютер"}
              </Button>

              <Button
                type="button"
                onClick={handleStopCamera}
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
      </DialogContent>
    </Dialog>
  );
}
