import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Scan, Package, Trash2 } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";

interface StockInFormProps {
  onSubmit: (data: {
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode?: string;
    price?: number;
  }) => void;
}

export default function StockInForm({ onSubmit }: StockInFormProps) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [isWaitingForScan, setIsWaitingForScan] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  // Bulk mode states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);

  const handleScan = (scannedBarcode: string) => {
    if (isBulkMode) {
      // В режиме массового добавления добавляем в список
      if (scannedBarcode) {
        setScannedBarcodes(prev => [...prev, scannedBarcode]);
      }
    } else {
      // В обычном режиме просто заполняем поле
      setBarcode(scannedBarcode);
    }
    setIsWaitingForScan(false);
  };

  const handleActivateBarcodeScanner = () => {
    setIsWaitingForScan(true);
    barcodeInputRef.current?.focus();
    if (!isBulkMode) {
      setTimeout(() => setIsWaitingForScan(false), 5000);
    }
  };

  const handleRemoveBarcode = (index: number) => {
    setScannedBarcodes(scannedBarcodes.filter((_, i) => i !== index));
  };

  const handleToggleBulkMode = () => {
    if (isBulkMode) {
      // Выходим из режима массового добавления
      setScannedBarcodes([]);
      setIsWaitingForScan(false);
    }
    setIsBulkMode(!isBulkMode);
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
        price: price ? parseInt(price) : undefined,
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setPrice("");
      setScannedBarcodes([]);
      setIsWaitingForScan(false);
    } else {
      // Обычный режим
      onSubmit({
        productId: productId || undefined,
        name: name || undefined,
        sku,
        location,
        quantity,
        barcode: barcode || undefined,
        price: price ? parseInt(price) : undefined,
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setQuantity(1);
      setBarcode("");
      setPrice("");
      setIsWaitingForScan(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BarcodeScanner onScan={handleScan} />
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Информация о товаре</CardTitle>
          <Button 
            variant={isBulkMode ? "default" : "outline"} 
            onClick={handleToggleBulkMode}
            data-testid="button-toggle-bulk-mode"
          >
            <Package className="w-4 h-4 mr-2" />
            {isBulkMode ? "Обычный режим" : "Массовое добавление"}
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location">Локация *</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value.toUpperCase())}
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
              <Label htmlFor="price">Цена</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                data-testid="input-price"
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
                  <div className="flex items-center justify-between mb-2">
                    <Label>Сканирование штрихкодов</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleActivateBarcodeScanner}
                      className={isWaitingForScan ? "border-primary" : ""}
                      data-testid="button-activate-bulk-barcode"
                    >
                      <Scan className="w-4 h-4 mr-2" />
                      Сканировать
                    </Button>
                  </div>
                  <Input
                    ref={barcodeInputRef}
                    placeholder={isWaitingForScan ? "Ожидание сканирования..." : "Готов к сканированию"}
                    className={`font-mono ${isWaitingForScan ? "border-primary ring-2 ring-primary/20" : ""}`}
                    readOnly
                    data-testid="input-bulk-barcode-display"
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
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="barcode">Штрихкод</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleActivateBarcodeScanner}
                    className={isWaitingForScan ? "border-primary" : ""}
                    data-testid="button-activate-barcode"
                  >
                    <Scan className="w-4 h-4 mr-2" />
                    Добавить штрихкод
                  </Button>
                </div>
                <Input
                  id="barcode"
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={isWaitingForScan ? "Ожидание сканирования..." : "Введите или отсканируйте"}
                  className={`font-mono ${isWaitingForScan ? "border-primary ring-2 ring-primary/20" : ""}`}
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
    </div>
  );
}
