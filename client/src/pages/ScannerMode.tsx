import { useState, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { Camera, X, Check, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ScannerMode() {
  const { toast } = useToast();
  const { isConnected, sendMessage } = useWebSocket();
  const [scanning, setScanning] = useState(false);
  const [html5QrCode, setHtml5QrCode] = useState<Html5Qrcode | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [lastBarcode, setLastBarcode] = useState<string>("");
  const [cameraError, setCameraError] = useState<string>("");

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [html5QrCode]);

  const startScanning = async () => {
    setCameraError("");
    
    // Проверка поддержки камеры браузером
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errorMsg = "Ваш браузер не поддерживает доступ к камере. Используйте Chrome, Firefox или Safari.";
      setCameraError(errorMsg);
      toast({
        variant: "destructive",
        title: "Браузер не поддерживается",
        description: errorMsg,
      });
      return;
    }

    try {
      // Сначала явно запрашиваем разрешение на камеру
      await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
          // Останавливаем поток - нам нужно только разрешение
          stream.getTracks().forEach(track => track.stop());
        });

      const scanner = new Html5Qrcode("qr-reader");
      setHtml5QrCode(scanner);

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {}
      );

      setScanning(true);
      setCameraError("");
      toast({
        title: "Камера запущена",
        description: "Наведите камеру на штрихкод",
      });
    } catch (error: any) {
      console.error("Camera start error:", error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);
      
      let errorMessage = "Не удалось запустить камеру";
      let helpText = "";
      
      // Более детальная обработка ошибок
      if (error?.name === "NotAllowedError" || error?.message?.includes("NotAllowed")) {
        errorMessage = "Доступ к камере запрещен";
        helpText = "Нажмите на значок 🔒 в адресной строке браузера и разрешите доступ к камере";
      } else if (error?.name === "NotFoundError" || error?.message?.includes("NotFound")) {
        errorMessage = "Камера не найдена";
        helpText = "Убедитесь что на вашем устройстве есть камера";
      } else if (error?.name === "NotReadableError" || error?.message?.includes("NotReadable")) {
        errorMessage = "Камера занята другим приложением";
        helpText = "Закройте другие приложения использующие камеру и попробуйте снова";
      } else if (error?.name === "OverconstrainedError" || error?.message?.includes("Overconstrained")) {
        errorMessage = "Камера не поддерживает требуемые настройки";
        helpText = "Попробуйте использовать другую камеру";
      } else if (error?.name === "SecurityError" || error?.message?.includes("Security")) {
        errorMessage = "Доступ заблокирован по соображениям безопасности";
        helpText = "Убедитесь что сайт открыт через HTTPS";
      } else if (error?.message?.includes("Permission")) {
        errorMessage = "Нет разрешения на использование камеры";
        helpText = "Разрешите доступ к камере в настройках браузера";
      }
      
      setCameraError(errorMessage + (helpText ? "\n\n" + helpText : ""));
      setHtml5QrCode(null);
      
      toast({
        variant: "destructive",
        title: errorMessage,
        description: helpText || "Проверьте разрешения браузера",
      });
    }
  };

  const stopScanning = async () => {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        setScanning(false);
        setHtml5QrCode(null);
        toast({
          title: "Камера остановлена",
        });
      } catch (error) {
        console.error("Camera stop error:", error);
      }
    }
  };

  const handleScan = (barcode: string) => {
    if (!barcode || barcode === lastBarcode) return;

    setLastBarcode(barcode);

    // Send barcode via WebSocket
    const qty = parseInt(quantity) || 1;
    sendMessage({
      type: "barcode_scanned",
      barcode,
      quantity: qty,
    });

    toast({
      title: "✓ Отправлено",
      description: `Штрихкод: ${barcode}, Кол-во: ${qty}`,
    });

    // Clear last barcode after 2 seconds to allow re-scanning
    setTimeout(() => setLastBarcode(""), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Режим сканера</CardTitle>
              <CardDescription>
                {currentUser?.name || "Пользователь"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <div className="flex items-center gap-1 text-green-600" data-testid="status-connected">
                  <Wifi className="w-4 h-4" />
                  <span className="text-xs">Подключено</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-600" data-testid="status-connecting">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-xs">Подключение...</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected && (
            <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-800 dark:text-amber-200" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Нет подключения к серверу. Убедитесь что вы авторизованы на компьютере.
              </AlertDescription>
            </Alert>
          )}

          {cameraError && (
            <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
              <AlertCircle className="h-4 w-4 text-red-800 dark:text-red-200" />
              <AlertDescription className="text-red-800 dark:text-red-200 whitespace-pre-wrap">
                {cameraError}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="quantity">Количество</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={scanning}
              data-testid="input-quantity"
            />
          </div>

          <div className="space-y-2">
            {!scanning ? (
              <Button
                onClick={startScanning}
                className="w-full"
                size="lg"
                disabled={!isConnected}
                data-testid="button-start-scan"
              >
                <Camera className="w-5 h-5 mr-2" />
                Запустить камеру
              </Button>
            ) : (
              <Button
                onClick={stopScanning}
                variant="destructive"
                className="w-full"
                size="lg"
                data-testid="button-stop-scan"
              >
                <X className="w-5 h-5 mr-2" />
                Остановить камеру
              </Button>
            )}
          </div>

          {scanning && (
            <div className="space-y-2">
              <div id="qr-reader" className="rounded-md overflow-hidden" />
              {lastBarcode && (
                <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-mono text-green-800 dark:text-green-200">
                    {lastBarcode}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Эта страница работает как удалённый сканер.<br/>
              Отсканированные коды отправляются на компьютер.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
