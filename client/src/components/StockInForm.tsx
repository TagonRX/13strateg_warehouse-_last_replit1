import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Trash2, Usb, Smartphone, Wifi } from "lucide-react";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";
import { useWebSocket } from "@/hooks/useWebSocket";

interface StockInFormProps {
  onSubmit: (data: {
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode?: string;
  }) => void;
}

type ScannerMode = "usb" | "phone";

export default function StockInForm({ onSubmit }: StockInFormProps) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("usb");
  
  // Bulk mode states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  
  // Track manual location edits and previous auto-extracted value
  const [locationTouched, setLocationTouched] = useState(false);
  const prevExtracted = useRef<string>("");

  // WebSocket for phone mode
  const { isConnected: isPhoneConnected, lastMessage } = useWebSocket();

  // Строгая маршрутизация: данные со сканера ТОЛЬКО в barcode поле
  // В USB режиме работает глобальная маршрутизация
  const { inputRef: barcodeInputRef } = useGlobalBarcodeInput(!isBulkMode && scannerMode === "usb");
  const { inputRef: bulkBarcodeInputRef } = useGlobalBarcodeInput(isBulkMode && scannerMode === "usb");

  // Обработка сообщений от телефона
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned" && scannerMode === "phone") {
      const code = lastMessage.barcode;
      const qty = lastMessage.quantity || 1;
      
      if (isBulkMode) {
        // Добавляем все штрихкоды в список
        const codes = Array(qty).fill(code);
        setScannedBarcodes(prev => [...prev, ...codes]);
      } else {
        // Обычный режим - заполняем поля
        setBarcode(code);
        setQuantity(qty);
      }
    }
  }, [lastMessage, scannerMode, isBulkMode]);

  // Автоматическое извлечение локации из SKU (первые 4 символа до "-")
  useEffect(() => {
    if (sku) {
      // Унифицированная логика извлечения: до 4 символов до "-" или до конца строки
      const dashIndex = sku.indexOf("-");
      const end = dashIndex >= 0 ? Math.min(4, dashIndex) : Math.min(4, sku.length);
      const extracted = sku.substring(0, end);
      
      // Обновляем локацию только если:
      // 1. Пользователь не редактировал вручную, ИЛИ
      // 2. Текущая локация совпадает с предыдущим авто-значением
      if (!locationTouched || location === prevExtracted.current) {
        setLocation(extracted);
        prevExtracted.current = extracted;
        setLocationTouched(false); // Сбрасываем флаг при авто-обновлении
      }
    } else {
      // Если SKU пустой и локация была авто-заполнена - очищаем
      if (!locationTouched) {
        setLocation("");
        prevExtracted.current = "";
      }
    }
  }, [sku, location, locationTouched]);

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocation(e.target.value.toUpperCase());
    setLocationTouched(true); // Отмечаем что пользователь редактировал вручную
  };

  const handleRemoveBarcode = (index: number) => {
    setScannedBarcodes(scannedBarcodes.filter((_, i) => i !== index));
  };

  const handleToggleBulkMode = () => {
    if (isBulkMode) {
      // Выходим из режима массового добавления
      setScannedBarcodes([]);
    }
    setIsBulkMode(!isBulkMode);
  };

  const handleBulkBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const scannedCode = e.currentTarget.value.trim();
      setScannedBarcodes(prev => [...prev, scannedCode]);
      e.currentTarget.value = ''; // Очистка после добавления
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBulkMode) {
      // В режиме массового добавления
      if (!sku || !location || scannedBarcodes.length === 0) {
        return;
      }
      
      onSubmit({
        productId: productId || undefined,
        name: name || undefined,
        sku,
        location,
        quantity: scannedBarcodes.length,
        barcode: scannedBarcodes[0] || undefined,
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setScannedBarcodes([]);
      setLocationTouched(false);
      prevExtracted.current = "";
    } else {
      // Обычный режим
      onSubmit({
        productId: productId || undefined,
        name: name || undefined,
        sku,
        location,
        quantity,
        barcode: barcode || undefined,
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setQuantity(1);
      setBarcode("");
      setLocationTouched(false);
      prevExtracted.current = "";
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Информация о товаре</CardTitle>
          <Button 
            variant={isBulkMode ? "default" : "outline"} 
            onClick={handleToggleBulkMode}
            data-testid="button-toggle-bulk-mode"
          >
            <Package className="w-4 h-4 mr-2" />
            {isBulkMode ? "Обычный режим" : "Массовое добавление"}
          </Button>
        </div>
        
        {/* Scanner Mode Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Сканер:</span>
          <Button
            size="sm"
            variant={scannerMode === "usb" ? "default" : "outline"}
            onClick={() => setScannerMode("usb")}
            data-testid="button-scanner-usb"
            className="h-8"
          >
            <Usb className="w-3.5 h-3.5 mr-1.5" />
            USB
          </Button>
          <Button
            size="sm"
            variant={scannerMode === "phone" ? "default" : "outline"}
            onClick={() => setScannerMode("phone")}
            data-testid="button-scanner-phone"
            className="h-8"
          >
            <Smartphone className="w-3.5 h-3.5 mr-1.5" />
            Телефон
          </Button>
          
          {/* Phone Connection Indicator */}
          {scannerMode === "phone" && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md bg-muted/50">
              <Wifi className={`w-3.5 h-3.5 ${isPhoneConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
              <span className={`text-xs font-medium ${isPhoneConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isPhoneConnected ? "Подключен" : "Ожидание..."}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location">Локация *</Label>
            <Input
              id="location"
              value={location}
              onChange={handleLocationChange}
              placeholder="A101"
              required
              data-testid="input-location"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="productId">ID товара</Label>
            <Input
              id="productId"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Уникальный идентификатор"
              data-testid="input-product-id"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Название товара</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название товара"
              data-testid="input-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sku">SKU *</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="A101-J"
              required
              data-testid="input-sku"
            />
          </div>
          
          {!isBulkMode && (
            <div className="space-y-2">
              <Label htmlFor="quantity">Количество *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                required
                data-testid="input-quantity"
              />
            </div>
          )}
          
          {isBulkMode ? (
            <>
              <div className="space-y-2">
                <Label>Штрихкод (сканируйте каждый товар)</Label>
                <Input
                  ref={scannerMode === "usb" ? bulkBarcodeInputRef : undefined}
                  placeholder={scannerMode === "usb" ? "Отсканируйте штрихкод и нажмите Enter" : "Отсканируйте с телефона"}
                  className="font-mono"
                  onKeyDown={scannerMode === "usb" ? handleBulkBarcodeInput : undefined}
                  readOnly={scannerMode === "phone"}
                  data-testid="input-bulk-barcode"
                />
              </div>

              <div className="space-y-2">
                <Label>Количество товара</Label>
                <Input
                  value={scannedBarcodes.length}
                  readOnly
                  className="font-bold text-lg"
                  data-testid="input-bulk-quantity"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="barcode">Штрихкод</Label>
              <Input
                id="barcode"
                ref={scannerMode === "usb" ? barcodeInputRef : undefined}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder={scannerMode === "usb" ? "Введите или отсканируйте" : "Отсканируйте с телефона"}
                className="font-mono"
                readOnly={scannerMode === "phone"}
                data-testid="input-barcode"
              />
            </div>
          )}
          
          <Button 
            type="submit" 
            className="w-full" 
            data-testid="button-submit"
            disabled={isBulkMode && scannedBarcodes.length === 0}
          >
            {isBulkMode ? `Подтвердить (${scannedBarcodes.length} шт.)` : "Добавить товар"}
          </Button>
        </form>

        {isBulkMode && scannedBarcodes.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Отсканированные штрихкоды ({scannedBarcodes.length})</h3>
            <div className="max-h-48 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Штрихкод</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scannedBarcodes.map((code, index) => (
                    <TableRow key={index} data-testid={`barcode-row-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono">{code}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveBarcode(index)}
                          data-testid={`button-remove-barcode-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
