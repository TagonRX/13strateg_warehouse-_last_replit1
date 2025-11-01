import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { Badge } from "@/components/ui/badge";
import { FileUp, CheckCircle2, AlertTriangle, XCircle, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

export default function InventoryCsvImportDialog({ onSuccess }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<'url' | 'file'>('url');
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sessionData, setSessionData] = useState<ImportSession | null>(null);
  const [resolutions, setResolutions] = useState<{ csvRowIndex: number; selectedProductId: string }[]>([]);
  const { toast } = useToast();

  const startImportMutation = useMutation({
    mutationFn: async () => {
      if (sourceType === 'url') {
        return apiRequest('/api/inventory/import-csv', {
          method: 'POST',
          body: JSON.stringify({ sourceType: 'url', sourceUrl }),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('sourceType', 'file');
        return apiRequest('/api/inventory/import-csv', {
          method: 'POST',
          body: formData,
        });
      }
    },
    onSuccess: (data) => {
      setSessionData(data);
      setStep(2);
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
        await apiRequest(`/api/inventory/import-sessions/${sessionData.session.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ resolutions }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Then commit the import
      return apiRequest(`/api/inventory/import-sessions/${sessionData.session.id}/commit`, {
        method: 'POST',
      });
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

  const handleStartImport = () => {
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
    
    startImportMutation.mutate();
  };

  const handleResolveConflict = (conflictIndex: number, productId: string) => {
    setResolutions(prev => {
      const filtered = prev.filter(r => r.csvRowIndex !== conflictIndex);
      return [...filtered, { csvRowIndex: conflictIndex, selectedProductId: productId }];
    });
  };

  const handleCommit = () => {
    setStep(3);
  };

  const handleFinalCommit = () => {
    commitImportMutation.mutate();
  };

  const handleReset = () => {
    setStep(1);
    setSourceType('url');
    setSourceUrl("");
    setFile(null);
    setSessionData(null);
    setResolutions([]);
    setOpen(false);
  };

  const parsedData = sessionData ? JSON.parse(sessionData.session.parsedData) : null;
  const hasUnresolvedConflicts = parsedData && parsedData.conflicts.length > resolutions.length;

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
            <Badge className="ml-2" variant="secondary">Шаг {step} из 3</Badge>
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
                onClick={handleStartImport} 
                disabled={startImportMutation.isPending}
                data-testid="button-start-import"
              >
                {startImportMutation.isPending ? "Обработка..." : "Далее"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review matches and conflicts */}
        {step === 2 && parsedData && (
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
              <Button variant="outline" onClick={handleReset} data-testid="button-back">
                Отмена
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

        {/* Step 3: Confirm and commit */}
        {step === 3 && parsedData && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Итоговая сводка</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Будет обновлено товаров:</p>
                      <p className="text-2xl font-bold text-green-600">
                        {sessionData?.summary.matched + resolutions.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Будет пропущено:</p>
                      <p className="text-2xl font-bold text-red-600">
                        {sessionData?.summary.unmatched + (sessionData?.summary.conflicts || 0) - resolutions.length}
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
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-to-review">
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
