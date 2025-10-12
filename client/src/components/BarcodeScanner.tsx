import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Usb } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  label?: string;
}

export default function BarcodeScanner({ onScan, label = "Штрихкод" }: BarcodeScannerProps) {
  const [mode, setMode] = useState<"usb" | "mobile">("usb");
  const [barcode, setBarcode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus для USB сканера
  useEffect(() => {
    if (mode === "usb" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const handleUSBScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcode.trim()) {
      onScan(barcode.trim());
      setBarcode("");
      inputRef.current?.focus();
    }
  };

  const handleMobileScan = () => {
    setIsCameraActive(true);
    // В реальном приложении здесь будет инициализация html5-qrcode
    // Для прототипа показываем имитацию
    setTimeout(() => {
      const mockBarcode = "1234567890123";
      onScan(mockBarcode);
      setIsCameraActive(false);
    }, 1500);
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
                <Button
                  type="button"
                  onClick={handleMobileScan}
                  className="w-full"
                  data-testid="button-start-camera"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Включить камеру
                </Button>
              ) : (
                <div className="bg-muted rounded-md p-8 text-center">
                  <div className="animate-pulse">
                    <p className="text-sm text-muted-foreground">Сканирование...</p>
                    <div className="mt-4 w-48 h-48 mx-auto border-2 border-primary rounded-md"></div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
