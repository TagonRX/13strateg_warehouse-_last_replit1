import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CSVData {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
}

interface FieldMapping {
  sku: string;
  name: string;
  quantity: string;
  ebaySellerName: string;
}

interface CSVImportDialogProps {
  onImport: (data: { sku: string; itemName?: string; requiredQuantity: number; ebaySellerName?: string }[]) => void;
}

const MAPPING_STORAGE_KEY = 'csv_field_mapping';

export default function CSVImportDialog({ onImport }: CSVImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [csvUrl, setCsvUrl] = useState("");
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    sku: "",
    name: "",
    quantity: "",
    ebaySellerName: "",
  });
  const { toast } = useToast();

  // Load saved mapping from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (saved) {
      try {
        const mapping = JSON.parse(saved);
        setFieldMapping(mapping);
      } catch (e) {
        console.error("Failed to load saved mapping:", e);
      }
    }
  }, []);

  // Save mapping to localStorage whenever it changes
  useEffect(() => {
    if (fieldMapping.sku || fieldMapping.name || fieldMapping.quantity) {
      localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(fieldMapping));
    }
  }, [fieldMapping]);

  const handleLoadCSV = async () => {
    if (!csvUrl.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите URL CSV файла",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "Загрузка CSV...",
      description: "Подключение к серверу и загрузка файла",
    });
    
    try {
      const response = await fetch('/api/picking/parse-csv-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: csvUrl, full: false }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка загрузки файла");
      }

      const data: CSVData = await response.json();
      setCsvData(data);

      toast({
        title: "Успешно загружено!",
        description: `Обработано ${data.totalRows} строк, ${data.headers.length} колонок`,
      });

      // Auto-detect common field mappings
      const autoMapping: Partial<FieldMapping> = {};
      
      data.headers.forEach(header => {
        const lowerHeader = header.toLowerCase();
        if (!autoMapping.sku && (lowerHeader.includes('sku') || lowerHeader === 'item_sku')) {
          autoMapping.sku = header;
        }
        if (!autoMapping.name && (lowerHeader.includes('title') || lowerHeader.includes('name') || lowerHeader === 'item_title')) {
          autoMapping.name = header;
        }
        if (!autoMapping.quantity && (lowerHeader.includes('quantity') || lowerHeader.includes('qty') || lowerHeader === 'transaction_quantity')) {
          autoMapping.quantity = header;
        }
        if (!autoMapping.ebaySellerName && (lowerHeader.includes('seller_ebay_seller_id') || lowerHeader.includes('ebay seller') || lowerHeader === 'seller')) {
          autoMapping.ebaySellerName = header;
        }
      });

      setFieldMapping(prev => ({
        sku: autoMapping.sku || prev.sku || "",
        name: autoMapping.name || prev.name || "",
        quantity: autoMapping.quantity || prev.quantity || "",
        ebaySellerName: autoMapping.ebaySellerName || prev.ebaySellerName || "",
      }));

    } catch (error: any) {
      let errorMessage = error.message;
      
      // Provide more helpful error messages
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        errorMessage = "Не удалось подключиться к серверу CSV. Проверьте URL и доступность сервера.";
      } else if (error.message.includes("timeout") || error.message.includes("60 сек")) {
        errorMessage = "Превышено время ожидания (60 сек). Файл слишком большой или сервер не отвечает.";
      }
      
      toast({
        title: "Ошибка загрузки",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromImport = async () => {
    if (!csvData) return;

    if (!fieldMapping.sku || !fieldMapping.quantity) {
      toast({
        title: "Ошибка",
        description: "Укажите поля для SKU и количества",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch full CSV data with full=true parameter
      const response = await fetch('/api/picking/parse-csv-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: csvUrl, full: true }),
      });
      if (!response.ok) throw new Error("Ошибка загрузки данных");
      
      const fullData: CSVData & { data?: Record<string, string>[] } = await response.json();
      
      // Use full data if available, otherwise fall back to preview
      const rows = fullData.data || fullData.preview;

      // Parse all rows
      const tasks: { sku: string; itemName?: string; requiredQuantity: number; ebaySellerName?: string }[] = [];
      const skuMap = new Map<string, { name?: string; quantity: number; ebaySellerName?: string }>();

      rows.forEach(row => {
        const sku = row[fieldMapping.sku]?.trim();
        const quantity = parseInt(row[fieldMapping.quantity] || "0", 10);
        const name = fieldMapping.name ? row[fieldMapping.name]?.trim() : undefined;
        const ebaySellerName = fieldMapping.ebaySellerName ? row[fieldMapping.ebaySellerName]?.trim() : undefined;

        if (!sku || !quantity) return;

        const existing = skuMap.get(sku);
        if (existing) {
          existing.quantity += quantity;
          if (name && !existing.name) {
            existing.name = name;
          }
          if (ebaySellerName && !existing.ebaySellerName) {
            existing.ebaySellerName = ebaySellerName;
          }
        } else {
          skuMap.set(sku, { name, quantity, ebaySellerName });
        }
      });

      skuMap.forEach((value, sku) => {
        tasks.push({
          sku,
          itemName: value.name,
          requiredQuantity: value.quantity,
          ebaySellerName: value.ebaySellerName,
        });
      });

      onImport(tasks);
      setOpen(false);
      setCsvData(null);
      setCsvUrl("");

      toast({
        title: "Успешно",
        description: `Импортировано ${tasks.length} позиций`,
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setCsvData(null);
    setCsvUrl("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-csv-import">
          <Download className="h-4 w-4 mr-2" />
          Импорт из CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Импорт данных из CSV файла</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="csv-url">URL CSV файла</Label>
            <div className="flex gap-2">
              <Input
                id="csv-url"
                data-testid="input-csv-url"
                placeholder="https://example.com/file.csv"
                value={csvUrl}
                onChange={(e) => setCsvUrl(e.target.value)}
                disabled={loading}
              />
              <Button 
                onClick={handleLoadCSV} 
                disabled={loading || !csvUrl.trim()}
                data-testid="button-load-csv"
              >
                {loading ? "Загрузка..." : "Подгрузить"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Параметры: Разделитель - запятая (,), Ограничитель - кавычки ("), Кодировка - UTF-8
            </p>
          </div>

          {/* CSV Data Preview */}
          {csvData && (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Найдено полей: {csvData.headers.length}, Строк: {csvData.totalRows}
                    </span>
                  </div>

                  {/* Preview Table */}
                  <div className="border rounded-md overflow-auto max-h-48">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {csvData.headers.map((header, i) => (
                            <th key={i} className="px-3 py-2 text-left font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.preview.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t">
                            {csvData.headers.map((header, j) => (
                              <td key={j} className="px-3 py-2">
                                {row[header]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Field Mapping */}
              <div className="space-y-4">
                <h4 className="font-medium">Сопоставление полей</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mapping-sku">SKU (обязательно)</Label>
                    <Select
                      value={fieldMapping.sku}
                      onValueChange={(value) => setFieldMapping(prev => ({ ...prev, sku: value }))}
                    >
                      <SelectTrigger id="mapping-sku" data-testid="select-mapping-sku">
                        <SelectValue placeholder="Выберите поле" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvData.headers.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mapping-quantity">Количество (обязательно)</Label>
                    <Select
                      value={fieldMapping.quantity}
                      onValueChange={(value) => setFieldMapping(prev => ({ ...prev, quantity: value }))}
                    >
                      <SelectTrigger id="mapping-quantity" data-testid="select-mapping-quantity">
                        <SelectValue placeholder="Выберите поле" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvData.headers.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mapping-name">Название товара (опционально)</Label>
                    <Select
                      value={fieldMapping.name}
                      onValueChange={(value) => setFieldMapping(prev => ({ ...prev, name: value }))}
                    >
                      <SelectTrigger id="mapping-name" data-testid="select-mapping-name">
                        <SelectValue placeholder="Выберите поле" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Не использовать</SelectItem>
                        {csvData.headers.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mapping-seller">eBay Seller (опционально)</Label>
                    <Select
                      value={fieldMapping.ebaySellerName}
                      onValueChange={(value) => setFieldMapping(prev => ({ ...prev, ebaySellerName: value }))}
                    >
                      <SelectTrigger id="mapping-seller" data-testid="select-mapping-seller">
                        <SelectValue placeholder="Выберите поле" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Не использовать</SelectItem>
                        {csvData.headers.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Сбросить
                </Button>
                <Button 
                  onClick={handleCreateFromImport}
                  disabled={!fieldMapping.sku || !fieldMapping.quantity}
                  data-testid="button-create-from-import"
                >
                  Создать из импорта
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
