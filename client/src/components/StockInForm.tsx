import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";

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

export default function StockInForm({ onSubmit }: StockInFormProps) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");
  const [isWaitingForScan, setIsWaitingForScan] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const handleScan = (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setIsWaitingForScan(false);
  };

  const handleActivateBarcodeScanner = () => {
    setIsWaitingForScan(true);
    barcodeInputRef.current?.focus();
    setTimeout(() => setIsWaitingForScan(false), 5000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    setIsWaitingForScan(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BarcodeScanner onScan={handleScan} />
      
      <Card>
        <CardHeader>
          <CardTitle>Информация о товаре</CardTitle>
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
            
            <Button type="submit" className="w-full" data-testid="button-submit">
              Добавить товар
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
