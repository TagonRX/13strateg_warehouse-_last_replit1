import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, X, Wifi, Send } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { getAuthToken } from "@/lib/api";

export default function RemoteBarcodeScanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isSending, setIsSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket when dialog opens
  useEffect(() => {
    if (isOpen) {
      connectWebSocket();
    }
    return () => {
      disconnectWebSocket();
    };
  }, [isOpen]);

  // Start camera when activated
  useEffect(() => {
    if (isCameraActive && isOpen) {
      startCamera();
    }
    return () => {
      cleanupCamera();
    };
  }, [isCameraActive, isOpen]);

  const connectWebSocket = () => {
    const token = getAuthToken();
    if (!token) {
      console.log("[Remote Scanner] No auth token");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log("[Remote Scanner] Connecting to WebSocket...");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Remote Scanner] WebSocket connected, authenticating...");
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("[Remote Scanner] Received:", message);
        
        if (message.type === "auth_success") {
          console.log("[Remote Scanner] Authenticated successfully");
          setIsConnected(true);
        } else if (message.type === "auth_error") {
          console.error("[Remote Scanner] Auth failed:", message.error);
          setIsConnected(false);
        }
      } catch (error) {
        console.error("[Remote Scanner] Message parse error:", error);
      }
    };

    ws.onclose = () => {
      console.log("[Remote Scanner] WebSocket disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[Remote Scanner] WebSocket error:", error);
    };
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

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
      // КРИТИЧЕСКАЯ ПРОВЕРКА: Камера работает только через HTTPS или localhost
      const isSecure = window.location.protocol === 'https:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
      
      if (!isSecure) {
        const serverIP = window.location.hostname;
        throw new Error(`⚠️ КАМЕРА НЕ РАБОТАЕТ ЧЕРЕЗ HTTP!\n\nВаш сервер: ${serverIP}\n\nДля работы камеры нужен HTTPS.\n\nИспользуйте USB сканер или настройте HTTPS.`);
      }

      // Wait for DOM element to be available
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = document.getElementById("remote-scanner-reader");
      if (!element) {
        throw new Error("Scanner element not found in DOM");
      }

      const html5QrCode = new Html5Qrcode("remote-scanner-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          // Html5Qrcode автоматически поддерживает все форматы: QR, CODE_128, EAN, UPC и другие
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
      const errorMessage = err instanceof Error ? err.message : "Не удалось запустить камеру. Проверьте разрешения.";
      setCameraError(errorMessage);
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

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[Remote Scanner] Sending message:", message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.log("[Remote Scanner] Cannot send, not connected");
    }
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
