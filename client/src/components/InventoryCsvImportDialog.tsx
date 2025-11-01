import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, CheckCircle2, AlertTriangle, XCircle, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/api";

interface CsvImportDialogProps {
  onSuccess: () => void;
}

interface ImportSession {
  id: string;
  summary: {
    total: number;
    matched: number;
    conflicts: number;
    unmatched: number;
  };
  session: {
    id: string;
    parsedData: string;
  };
}

interface ColumnMapping {
  csvColumn: string;
  enabled: boolean;
  targetField: string;
  sampleData: string[];
}

// Helper: Parse CSV text to get headers and rows
function parseCSV(text: string): { headers: string[]; rows: any[] } {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    return row;
  });
  
  return { headers, rows };
}

// Helper: Check if column should be skipped
function shouldSkipColumn(csvColumn: string): boolean {
  const lower = csvColumn.toLowerCase();
  // Skip columns with "c:" prefix or "variation" in name
  return csvColumn.startsWith('c:') || lower.includes('variation');
}

// Helper: Auto-suggest target field based on CSV column name
function suggestTargetField(csvColumn: string): string {
  // Skip if this column should be filtered out
  if (shouldSkipColumn(csvColumn)) {
    return '(skip)';
  }
  
  const lower = csvColumn.toLowerCase();
  
  if (lower.includes('product') || lower.includes('title') || lower.includes('название')) return 'productName';
  if (lower.includes('sku') || lower.includes('артикул')) return 'sku';
  if (lower.includes('location') || lower.includes('локация')) return 'location';
  if (lower.includes('barcode') || lower.includes('штрихкод')) return 'barcode';
  if (lower.includes('quantity') || lower.includes('количество') || lower.includes('qty')) return 'quantity';
  if (lower.includes('price') || lower.includes('цена')) return 'price';
  if (lower.includes('itemid') || lower.includes('item id')) return 'itemId';
  if (lower.includes('url') || lower.includes('ссылка') || lower.includes('ebay')) return 'ebayUrl';
  if (lower.includes('image') || lower.includes('photo') || lower.includes('фото')) return 'imageUrls';
  if (lower.includes('condition') || lower.includes('состояние')) return 'condition';
  
  // Dimensions and weight
  if (lower.includes('weight') || lower.includes('вес')) return 'weight';
  if (lower.includes('width') || lower.includes('ширина')) return 'width';
  if (lower.includes('height') || lower.includes('высота')) return 'height';
  if (lower.includes('length') || lower.includes('depth') || lower.includes('длина') || lower.includes('глубина')) return 'length';
  
  return '(skip)';
}

export default function InventoryCsvImportDialog({ onSuccess }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<'url' | 'file'>('url');
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [sessionData, setSessionData] = useState<ImportSession | null>(null);
  const [resolutions, setResolutions] = useState<{ csvRowIndex: number; selectedProductId: string }[]>([]);
  const { toast } = useToast();

  // Helper: Load saved column mapping from localStorage
  const loadSavedMapping = (headers: string[]): ColumnMapping[] | null => {
    try {
      const saved = localStorage.getItem('csvColumnMapping');
      if (!saved) return null;
      
      const savedMappings: {[key: string]: string} = JSON.parse(saved);
      
      // Apply saved mappings to current headers
      const mappings: ColumnMapping[] = headers.map(csvColumn => {
        const savedTarget = savedMappings[csvColumn];
        const targetField = savedTarget || suggestTargetField(csvColumn);
        
        return {
          csvColumn,
          enabled: targetField !== '(skip)',
          targetField,
          sampleData: [],
        };
      });
      
      return mappings;
    } catch (e) {
      console.error('Failed to load saved mapping:', e);
      return null;
    }
  };

  // Helper: Save column mapping to localStorage
  const saveMapping = (mappings: ColumnMapping[]) => {
    try {
      const mappingObj: {[key: string]: string} = {};
      mappings.forEach(m => {
        if (m.enabled && m.targetField !== '(skip)') {
          mappingObj[m.csvColumn] = m.targetField;
        }
      });
      localStorage.setItem('csvColumnMapping', JSON.stringify(mappingObj));
    } catch (e) {
      console.error('Failed to save mapping:', e);
    }
  };

  // Preview CSV mutation - parses CSV and generates column mapping suggestions
  const previewCSVMutation = useMutation({
    mutationFn: async () => {
      let csvText = '';
      
      if (sourceType === 'url') {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error('Failed to fetch CSV from URL');
        csvText = await response.text();
      } else if (file) {
        csvText = await file.text();
      }
      
      return csvText;
    },
    onSuccess: (csvText) => {
      const { headers, rows } = parseCSV(csvText);
      setCsvPreview({ headers, rows });
      
      // Try to load saved mapping first
      let mappings = loadSavedMapping(headers);
      
      // If no saved mapping, generate auto-suggestions
      if (!mappings) {
        mappings = headers.map(csvColumn => {
          const targetField = suggestTargetField(csvColumn);
          const sampleData = rows.slice(0, 3).map(row => row[csvColumn] || '');
          
          return {
            csvColumn,
            enabled: targetField !== '(skip)',
            targetField,
            sampleData,
          };
        });
      } else {
        // Add sample data to saved mappings
        mappings.forEach(m => {
          m.sampleData = rows.slice(0, 3).map(row => row[m.csvColumn] || '');
        });
      }
      
      setColumnMapping(mappings);
      setStep(2); // Move to column mapping step
      
      toast({
        title: "CSV загружен",
        description: `Найдено ${headers.length} колонок. Проверьте соответствие полей.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка загрузки CSV",
        description: error.message || "Не удалось прочитать CSV файл",
        variant: "destructive",
      });
    },
  });

  // Start import mutation - sends CSV with column mapping to backend
  const startImportMutation = useMutation({
    mutationFn: async () => {
      let csvText = '';
      
      if (sourceType === 'url') {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error('Failed to fetch CSV from URL');
        csvText = await response.text();
      } else if (file) {
        csvText = await file.text();
      }
      
      // Save column mapping to localStorage for future use
      saveMapping(columnMapping);
      
      // Send CSV text and column mapping to backend
      const response = await apiRequest('POST', '/api/inventory/import-csv', {
        sourceType: 'text',
        csvText,
        columnMapping: columnMapping.filter(m => m.enabled),
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      setSessionData(data);
      setStep(3); // Move to matching step
      toast({
        title: "CSV обработан",
        description: `Найдено: ${data.summary.matched} совпадений, ${data.summary.conflicts} конфликтов, ${data.summary.unmatched} не найдено`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка импорта",
        description: error.message || "Не удалось обработать CSV файл",
        variant: "destructive",
      });
    },
  });

  const commitImportMutation = useMutation({
    mutationFn: async () => {
      if (!sessionData) return;
      
      // First resolve conflicts if any
      if (resolutions.length > 0) {
        const resolveResponse = await apiRequest(
          'POST',
          `/api/inventory/import-sessions/${sessionData.session.id}/resolve`,
          { resolutions }
        );
        await resolveResponse.json();
      }
      
      // Then commit the import
      const commitResponse = await apiRequest(
        'POST',
        `/api/inventory/import-sessions/${sessionData.session.id}/commit`
      );
      return commitResponse.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Импорт завершен",
        description: data.message || "Товары успешно обновлены",
      });
      handleReset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка применения импорта",
        description: error.message || "Не удалось применить изменения",
        variant: "destructive",
      });
    },
  });

  const handleLoadCSV = () => {
    if (sourceType === 'url' && !sourceUrl.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите URL CSV файла",
        variant: "destructive",
      });
      return;
    }
    
    if (sourceType === 'file' && !file) {
      toast({
        title: "Ошибка",
        description: "Выберите файл",
        variant: "destructive",
      });
      return;
    }
    
    // Load CSV and show column mapping
    previewCSVMutation.mutate();
  };

  const handleProceedWithMapping = () => {
    // Validate that at least one column is enabled with valid target field
    const validMappings = columnMapping.filter(m => 
      m.enabled && m.targetField !== '(skip)' && m.targetField.trim() !== ''
    );
    
    if (validMappings.length === 0) {
      toast({
        title: "Ошибка валидации",
        description: "Необходимо выбрать хотя бы один столбец для импорта",
        variant: "destructive",
      });
      return;
    }
    
    // Proceed with import using selected column mapping
    startImportMutation.mutate();
  };

  const handleColumnMappingChange = (index: number, field: 'enabled' | 'targetField', value: boolean | string) => {
    setColumnMapping(prev => {
      const updated = [...prev];
      if (field === 'enabled') {
        updated[index].enabled = value as boolean;
      } else if (field === 'targetField') {
        updated[index].targetField = value as string;
        // Auto-disable if "(skip)" is selected
        if (value === '(skip)') {
          updated[index].enabled = false;
        }
      }
      return updated;
    });
  };

  const handleResolveConflict = (conflictIndex: number, productId: string) => {
    setResolutions(prev => {
      const filtered = prev.filter(r => r.csvRowIndex !== conflictIndex);
      return [...filtered, { csvRowIndex: conflictIndex, selectedProductId: productId }];
    });
  };

  const handleCommit = () => {
    setStep(4);
  };

  const handleFinalCommit = () => {
    commitImportMutation.mutate();
  };

  const handleReset = () => {
    setStep(1);
    setSourceType('url');
    setSourceUrl("");
    setFile(null);
    setColumnMapping([]);
    setCsvPreview(null);
    setSessionData(null);
    setResolutions([]);
    setOpen(false);
  };

  const parsedData = sessionData ? JSON.parse(sessionData.session.parsedData) : null;
  const hasUnresolvedConflicts = parsedData && parsedData.conflicts.length > resolutions.length;

  // Target field options for dropdown
  const targetFieldOptions = [
    { value: 'productName', label: 'Product Name' },
    { value: 'sku', label: 'SKU' },
    { value: 'location', label: 'Location' },
    { value: 'barcode', label: 'Barcode' },
    { value: 'quantity', label: 'Quantity' },
    { value: 'price', label: 'Price' },
    { value: 'itemId', label: 'eBay Item ID' },
    { value: 'ebayUrl', label: 'eBay URL' },
    { value: 'imageUrls', label: 'Image URLs' },
    { value: 'condition', label: 'Condition' },
    { value: '(skip)', label: '(Пропустить)' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" data-testid="button-inventory-csv-import">
          <Upload className="h-4 w-4 mr-2" />
          Импорт CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Импорт товаров из CSV
            <Badge className="ml-2" variant="secondary">Шаг {step} из 4</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose source */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label>Выберите источник</Label>
              <RadioGroup value={sourceType} onValueChange={(v) => setSourceType(v as 'url' | 'file')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="url" id="source-url" data-testid="radio-source-url" />
                  <Label htmlFor="source-url">URL файла</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="file" id="source-file" data-testid="radio-source-file" />
                  <Label htmlFor="source-file">Загрузить файл</Label>
                </div>
              </RadioGroup>
            </div>

            {sourceType === 'url' ? (
              <div className="space-y-2">
                <Label htmlFor="csv-url">URL CSV файла</Label>
                <Input
                  id="csv-url"
                  data-testid="input-csv-url"
                  placeholder="https://example.com/inventory.csv"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Ожидаемые колонки: Product Name/Title, Item ID, eBay URL, Image URL, Quantity, Price
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="csv-file">Выберите CSV файл</Label>
                <Input
                  id="csv-file"
                  data-testid="input-csv-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <p className="text-sm text-muted-foreground">
                    Выбран: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReset} data-testid="button-cancel">
                Отмена
              </Button>
              <Button 
                onClick={handleLoadCSV} 
                disabled={previewCSVMutation.isPending}
                data-testid="button-load-csv"
              >
                {previewCSVMutation.isPending ? "Загрузка..." : "Далее"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && columnMapping.length > 0 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="font-semibold">Настройка соответствия колонок</h3>
              <p className="text-sm text-muted-foreground">
                Укажите, какие колонки из CSV файла соответствуют полям в системе.
                Отключите ненужные колонки с помощью чекбоксов.
              </p>
            </div>

            <div className="border rounded-md max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Вкл.</TableHead>
                    <TableHead>Колонка CSV</TableHead>
                    <TableHead>Поле в системе</TableHead>
                    <TableHead>Примеры данных</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnMapping.map((mapping, idx) => (
                    <TableRow key={idx} data-testid={`row-column-mapping-${idx}`}>
                      <TableCell>
                        <Checkbox
                          checked={mapping.enabled}
                          onCheckedChange={(checked) => 
                            handleColumnMappingChange(idx, 'enabled', checked as boolean)
                          }
                          data-testid={`checkbox-column-${idx}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">
                        {mapping.csvColumn}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping.targetField}
                          onValueChange={(value) => 
                            handleColumnMappingChange(idx, 'targetField', value)
                          }
                          disabled={!mapping.enabled}
                        >
                          <SelectTrigger data-testid={`select-target-field-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {targetFieldOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {mapping.sampleData.filter(d => d).slice(0, 3).join(', ') || '(нет данных)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-to-upload">
                Назад
              </Button>
              <Button 
                onClick={handleProceedWithMapping}
                disabled={startImportMutation.isPending || columnMapping.filter(m => m.enabled).length === 0}
                data-testid="button-proceed-mapping"
              >
                {startImportMutation.isPending ? "Обработка..." : "Продолжить"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review matches and conflicts */}
        {step === 3 && parsedData && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Всего строк</p>
                    <p className="text-2xl font-bold">{sessionData?.summary.total}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Совпадений</p>
                    <p className="text-2xl font-bold text-green-600">{sessionData?.summary.matched}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Конфликтов</p>
                    <p className="text-2xl font-bold text-yellow-600">{sessionData?.summary.conflicts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Не найдено</p>
                    <p className="text-2xl font-bold text-red-600">{sessionData?.summary.unmatched}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {/* Matched items */}
              {parsedData.matched.map((match: any, idx: number) => (
                <Card key={`match-${idx}`} className="border-green-200 bg-green-50" data-testid={`card-matched-${idx}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div className="flex-1">
                        <p className="font-medium">{match.csvRow['Product Name'] || match.csvRow['Title']}</p>
                        <p className="text-sm text-muted-foreground">→ {match.inventoryItem.name}</p>
                        <p className="text-xs text-muted-foreground">Совпадение: {(match.score * 100).toFixed(0)}%</p>
                      </div>
                      <Badge variant="secondary">Автоматически</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Conflicted items */}
              {parsedData.conflicts.map((conflict: any, idx: number) => (
                <Card key={`conflict-${idx}`} className="border-yellow-200 bg-yellow-50" data-testid={`card-conflict-${idx}`}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        <p className="font-medium">{conflict.csvRow['Product Name'] || conflict.csvRow['Title']}</p>
                      </div>
                      <div className="ml-7">
                        <Label htmlFor={`conflict-select-${idx}`} className="text-sm">
                          Выберите правильный товар:
                        </Label>
                        <Select
                          value={resolutions.find(r => r.csvRowIndex === idx)?.selectedProductId || ""}
                          onValueChange={(value) => handleResolveConflict(idx, value)}
                        >
                          <SelectTrigger id={`conflict-select-${idx}`} data-testid={`select-conflict-${idx}`}>
                            <SelectValue placeholder="Выберите товар" />
                          </SelectTrigger>
                          <SelectContent>
                            {conflict.candidates.map((candidate: any) => (
                              <SelectItem key={candidate.productId} value={candidate.productId}>
                                {candidate.name} ({(candidate.score * 100).toFixed(0)}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Unmatched items */}
              {parsedData.unmatched.slice(0, 10).map((unmatched: any, idx: number) => (
                <Card key={`unmatched-${idx}`} className="border-red-200 bg-red-50" data-testid={`card-unmatched-${idx}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <div className="flex-1">
                        <p className="font-medium">{unmatched.csvRow['Product Name'] || unmatched.csvRow['Title'] || '(нет названия)'}</p>
                        <p className="text-sm text-muted-foreground">Причина: {unmatched.reason}</p>
                      </div>
                      <Badge variant="destructive">Пропущено</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {parsedData.unmatched.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  ... и еще {parsedData.unmatched.length - 10} не найденных товаров
                </p>
              )}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back">
                Назад
              </Button>
              <Button 
                onClick={handleCommit}
                disabled={hasUnresolvedConflicts}
                data-testid="button-review"
              >
                {hasUnresolvedConflicts 
                  ? `Разрешите ${parsedData.conflicts.length - resolutions.length} конфликтов` 
                  : "Подтвердить"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm and commit */}
        {step === 4 && parsedData && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Итоговая сводка</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Будет обновлено товаров:</p>
                      <p className="text-2xl font-bold text-green-600">
                        {(sessionData?.summary?.matched || 0) + resolutions.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Будет пропущено:</p>
                      <p className="text-2xl font-bold text-red-600">
                        {(sessionData?.summary?.unmatched || 0) + (sessionData?.summary?.conflicts || 0) - resolutions.length}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Нажмите "Применить" для обновления товаров в инвентаре. Это действие нельзя отменить.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="button-back-to-review">
                Назад
              </Button>
              <Button 
                onClick={handleFinalCommit}
                disabled={commitImportMutation.isPending}
                data-testid="button-commit"
              >
                {commitImportMutation.isPending ? "Применение..." : "Применить"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
