import { useState, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { Camera, X, Check, Wifi, WifiOff, AlertCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";

export default function ScannerMode() {
  const { toast } = useToast();
  const { isConnected, sendMessage } = useWebSocket();
  const [scanning, setScanning] = useState(false);
  const [reader, setReader] = useState<BrowserMultiFormatReader | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [lastBarcode, setLastBarcode] = useState<string>("");
  const [cameraError, setCameraError] = useState<string>("");
  const [pendingBarcode, setPendingBarcode] = useState<string>(""); // Баркод ожидающий подтверждения
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [zoomSupported, setZoomSupported] = useState(false);

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    return () => {
      if (reader) {
        try { reader.stopContinuousDecode(); } catch {}
      }
    };
  }, [reader]);

  const startScanning = async () => {
    setCameraError("");
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА #1: Камера работает только через HTTPS или localhost
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      const serverIP = window.location.hostname;
      const errorMsg = `⚠️ КАМЕРА НЕ РАБОТАЕТ ЧЕРЕЗ HTTP!\n\nВаш сервер: ${serverIP}\n\nКамера работает только через HTTPS или localhost.\n\nРЕШЕНИЕ:\n✓ Используйте USB сканер (работает всегда)\n✓ Или настройте HTTPS на сервере`;
      setCameraError(errorMsg);
      toast({
        variant: "destructive",
        title: "⚠️ Требуется HTTPS",
        description: "Камера заблокирована браузером из-за HTTP. Используйте USB сканер или настройте HTTPS.",
        duration: 10000,
      });
      return;
    }

    // Проверка #2: Поддержка камеры браузером (после проверки HTTPS!)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errorMsg = "Ваш браузер не поддерживает доступ к камере. Используйте современный браузер (Chrome, Firefox, Safari, Brave).";
      setCameraError(errorMsg);
      toast({
        variant: "destructive",
        title: "Браузер не поддерживается",
        description: errorMsg,
      });
      return;
    }

    try {
      const videoElem = document.getElementById("qr-reader") as HTMLDivElement;
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.style.width = "100%";
      video.style.height = "100%";
      videoElem.innerHTML = "";
      videoElem.appendChild(video);

      const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE
      ]);

      const r = new BrowserMultiFormatReader(hints);
      setReader(r);
      r.decodeFromVideoDevice(undefined, video, (result, err) => {
        if (result?.getText) {
          handleScan(result.getText());
        }
      });

      try {
        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() || {};
        if (caps.zoom) {
          setZoomSupported(true);
          setZoomRange({ min: caps.zoom.min ?? 1, max: caps.zoom.max ?? 8 });
          const initialZoom = Math.min(2, caps.zoom.max ?? 1);
          setZoom(initialZoom);
          track.applyConstraints({ advanced: [{ zoom: initialZoom } as any] });
        }
      } catch (e) {
        setZoomSupported(false);
      }

      setScanning(true);
      setCameraError("");
      toast({ title: "Камера запущена", description: "Наведите камеру на штрихкод или QR код" });
    } catch (error: any) {
      console.error("Camera start error:", error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);
      console.error("Full error object:", error);
      
      let errorMessage = "Не удалось запустить камеру";
      let helpText = "";
      
      // Более детальная обработка ошибок
      const errorStr = String(error?.message || error || "").toLowerCase();
      
      if (error?.name === "NotAllowedError" || errorStr.includes("notallowed") || errorStr.includes("permission denied")) {
        errorMessage = "Доступ к камере запрещен";
        helpText = "Нажмите на значок 🔒 в адресной строке браузера и разрешите доступ к камере";
      } else if (error?.name === "NotFoundError" || errorStr.includes("notfound") || errorStr.includes("no camera")) {
        errorMessage = "Камера не найдена";
        helpText = "Убедитесь что на вашем устройстве есть камера";
      } else if (error?.name === "NotReadableError" || errorStr.includes("notreadable") || errorStr.includes("in use")) {
        errorMessage = "Камера занята другим приложением";
        helpText = "Закройте другие приложения использующие камеру и попробуйте снова";
      } else if (error?.name === "OverconstrainedError" || errorStr.includes("overconstrained")) {
        errorMessage = "Камера не поддерживает требуемые настройки";
        helpText = "Попробуйте использовать другую камеру";
      } else if (error?.name === "SecurityError" || errorStr.includes("security")) {
        errorMessage = "Доступ заблокирован по соображениям безопасности";
        helpText = "Убедитесь что сайт открыт через HTTPS";
      } else if (errorStr.includes("permission")) {
        errorMessage = "Нет разрешения на использование камеры";
        helpText = "Разрешите доступ к камере в настройках браузера";
      } else if (errorStr.includes("https") || errorStr.includes("insecure")) {
        errorMessage = "Требуется безопасное соединение";
        helpText = "Камера работает только через HTTPS. Убедитесь что адрес начинается с https://";
      } else {
        // Показываем полное сообщение ошибки для отладки
        helpText = `Детали: ${error?.message || String(error)}`;
      }
      
      setCameraError(errorMessage + (helpText ? "\n\n" + helpText : ""));
      setReader(null);
      
      toast({
        variant: "destructive",
        title: errorMessage,
        description: helpText || "Проверьте разрешения браузера",
      });
    }
  };

  const stopScanning = async () => {
    if (reader) {
      try {
        reader.stopContinuousDecode();
        setScanning(false);
        setReader(null);
        setZoomSupported(false);
        setZoom(1);
        toast({
          title: "Камера остановлена",
        });
      } catch (error) {
        console.error("Camera stop error:", error);
      }
    }
  };

  const handleZoomChange = async (value: number[]) => {
    if (!zoomSupported) return;
    
    const newZoom = value[0];
    setZoom(newZoom);
    
    try {
      const stream = (document.querySelector("#qr-reader video") as HTMLVideoElement)?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      await track?.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
    } catch (error) {
      console.error("Zoom change error:", error);
    }
  };

  const handleZoomIn = async () => {
    if (!zoomSupported) return;
    const newZoom = Math.min(zoom + 0.5, zoomRange.max);
    setZoom(newZoom);
    try {
      const stream = (document.querySelector("#qr-reader video") as HTMLVideoElement)?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      await track?.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
    } catch (error) {
      console.error("Zoom in error:", error);
    }
  };

  const handleZoomOut = async () => {
    if (!zoomSupported) return;
    const newZoom = Math.max(zoom - 0.5, zoomRange.min);
    setZoom(newZoom);
    try {
      const stream = (document.querySelector("#qr-reader video") as HTMLVideoElement)?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      await track?.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
    } catch (error) {
      console.error("Zoom out error:", error);
    }
  };

  const handleScan = (barcode: string) => {
    if (!barcode || barcode === pendingBarcode) return;

    // Показываем баркод для подтверждения
    setPendingBarcode(barcode);
    
    // При ZXing не останавливаем поток, просто показываем подтверждение
  };

  const handleConfirmSend = () => {
    if (!pendingBarcode) return;

    setLastBarcode(pendingBarcode);

    // Отправляем баркод через WebSocket
    const qty = parseInt(quantity) || 1;
    sendMessage({
      type: "remote_scan",
      barcode: pendingBarcode,
      qty: qty,
    });

    toast({
      title: "✓ Отправлено",
      description: `Код: ${pendingBarcode}, Кол-во: ${qty}`,
    });

    // Очищаем и возобновляем сканирование
    setPendingBarcode("");
    // Продолжаем поток без паузы

    // Clear last barcode after 2 seconds to allow re-scanning
    setTimeout(() => setLastBarcode(""), 2000);
  };

  const handleCancelScan = () => {
    setPendingBarcode("");
    // Возобновление не требуется
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Режим сканера</CardTitle>
              <CardDescription>
                {currentUser?.name || "Пользователь"} • Штрихкоды и QR коды
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

          {/* QR Reader - всегда в DOM */}
          <div className="space-y-3">
            {scanning && !pendingBarcode && (
              <div className="text-center text-sm text-muted-foreground">
                Наведите камеру на штрихкод или QR код
              </div>
            )}
            
            {/* Область камеры с зум-контролами */}
            <div className="relative flex gap-2">
              <div 
                id="qr-reader" 
                className="rounded-md overflow-hidden flex-1 border-2 border-dashed border-muted"
                style={{ 
                  minHeight: '400px', // Увеличена высота
                  backgroundColor: scanning ? 'transparent' : '#f5f5f5'
                }}
              />
              
              {/* Боковая панель зума (только во время сканирования и если поддерживается) */}
              {scanning && zoomSupported && (
                <div className="flex flex-col items-center gap-2 py-4" data-testid="zoom-controls">
                  {/* Кнопка увеличения */}
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleZoomIn}
                    disabled={zoom >= zoomRange.max}
                    data-testid="button-zoom-in"
                    className="h-10 w-10"
                  >
                    <ZoomIn className="w-5 h-5" />
                  </Button>
                  
                  {/* Вертикальный слайдер */}
                  <div className="flex-1 flex items-center justify-center min-h-[200px]">
                    <Slider
                      orientation="vertical"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={0.1}
                      value={[zoom]}
                      onValueChange={handleZoomChange}
                      className="h-full"
                      data-testid="slider-zoom"
                    />
                  </div>
                  
                  {/* Индикатор зума */}
                  <div className="text-xs font-mono text-center min-w-[3rem] px-2 py-1 bg-muted rounded" data-testid="text-zoom-level">
                    {zoom.toFixed(1)}x
                  </div>
                  
                  {/* Кнопка уменьшения */}
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleZoomOut}
                    disabled={zoom <= zoomRange.min}
                    data-testid="button-zoom-out"
                    className="h-10 w-10"
                  >
                    <ZoomOut className="w-5 h-5" />
                  </Button>
                </div>
              )}
              
              {/* Оверлей с подтверждением баркода */}
              {pendingBarcode && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-md">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
                    <div className="text-center space-y-4">
                      <div className="text-lg font-semibold text-foreground">
                        Найден код
                      </div>
                      
                      <div className="p-4 bg-muted rounded-md">
                        <div className="text-2xl font-mono font-bold text-primary break-all">
                          {pendingBarcode}
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        Количество: {quantity}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCancelScan}
                          variant="outline"
                          className="flex-1"
                          data-testid="button-cancel-scan"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Отмена
                        </Button>
                        <Button
                          onClick={handleConfirmSend}
                          className="flex-1"
                          data-testid="button-confirm-send"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Отправить
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Последний отправленный баркод */}
            {scanning && lastBarcode && !pendingBarcode && (
              <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-mono text-green-800 dark:text-green-200">
                  Отправлено: {lastBarcode}
                </span>
              </div>
            )}
          </div>

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
