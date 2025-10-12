import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BarcodeScanner from "./BarcodeScanner";

interface StockInFormProps {
  onSubmit: (data: {
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    barcode?: string;
  }) => void;
}

export default function StockInForm({ onSubmit }: StockInFormProps) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");

  const handleScan = (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      productId,
      name,
      sku,
      quantity,
      barcode: barcode || undefined,
    });
    // Очистка формы
    setProductId("");
    setName("");
    setSku("");
    setQuantity(1);
    setBarcode("");
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
              <Label htmlFor="productId">ID товара *</Label>
              <Input
                id="productId"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="PROD001"
                required
                data-testid="input-product-id"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Название товара *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название товара"
                required
                data-testid="input-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sku">SKU / Локация *</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="A101 или A101-J"
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
              <Label htmlFor="barcode">Штрихкод</Label>
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Отсканирован или введите вручную"
                className="font-mono"
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
