import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Scan, Package, Trash2 } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";

interface BulkStockInDialogProps {
  onSubmit: (data: {
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode?: string;
  }) => void;
}

export default function BulkStockInDialog({ onSubmit }: BulkStockInDialogProps) {
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [isWaitingForScan, setIsWaitingForScan] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const handleScan = (scannedBarcode: string) => {
    if (scannedBarcode) {
      setBarcodes([...barcodes, scannedBarcode]);
    }
    setIsWaitingForScan(false);
    barcodeInputRef.current?.focus();
  };

  const handleActivateBarcodeScanner = () => {
    setIsWaitingForScan(true);
    barcodeInputRef.current?.focus();
  };

  const handleRemoveBarcode = (index: number) => {
    setBarcodes(barcodes.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sku || !location || barcodes.length === 0) {
      return;
    }

    // Отправляем данные с одним штрихкодом (первым) и общим количеством
    // Количество = общее число отсканированных штрихкодов (включая дубликаты)
    onSubmit({
      productId: productId || undefined,
      name: name || undefined,
      sku,
      location,
      quantity: barcodes.length,
      barcode: barcodes[0] || undefined,
    });

    // Очистка формы
    setSku("");
    setLocation("");
    setProductId("");
    setName("");
    setBarcodes([]);
    setIsWaitingForScan(false);
    setOpen(false);
  };

  const handleCancel = () => {
    setSku("");
    setLocation("");
    setProductId("");
    setName("");
    setBarcodes([]);
    setIsWaitingForScan(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-bulk-stock-in">
          <Package className="w-4 h-4 mr-2" />
          Массовое добавление
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Массовое добавление товара</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarcodeScanner onScan={handleScan} />
          
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-location">Локация *</Label>
                <Input
                  id="bulk-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value.toUpperCase())}
                  placeholder="A101"
                  required
                  data-testid="input-bulk-location"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-sku">SKU *</Label>
                <Input
                  id="bulk-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="A101-J"
                  required
                  data-testid="input-bulk-sku"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-product-id">ID товара</Label>
                <Input
                  id="bulk-product-id"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="Уникальный идентификатор"
                  data-testid="input-bulk-product-id"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bulk-name">Название товара</Label>
                <Input
                  id="bulk-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название товара"
                  data-testid="input-bulk-name"
                />
              </div>
              
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
                  value={barcodes.length}
                  readOnly
                  className="font-bold text-lg"
                  data-testid="input-bulk-quantity"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  className="flex-1" 
                  disabled={!sku || !location || barcodes.length === 0}
                  data-testid="button-bulk-submit"
                >
                  Подтвердить ({barcodes.length} шт.)
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleCancel}
                  data-testid="button-bulk-cancel"
                >
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </div>

        {barcodes.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Отсканированные штрихкоды ({barcodes.length})</h3>
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
                  {barcodes.map((barcode, index) => (
                    <TableRow key={index} data-testid={`barcode-row-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono">{barcode}</TableCell>
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
      </DialogContent>
    </Dialog>
  );
}
