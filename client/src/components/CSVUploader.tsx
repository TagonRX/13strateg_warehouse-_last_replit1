import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, FileText, CheckCircle, RefreshCw, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";

interface CSVUploaderProps {
  onUpload: (file: File) => Promise<{
    success: number;
    updated: number;
    errors: number;
  }>;
}

interface SavedSource {
  id: string;
  label: string;
  url: string;
}

interface LoadProgress {
  current: number;
  total: number;
  errors: string[];
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

// Helper: Convert headers and rows to CSV text with proper escaping
function convertToCSVText(headers: string[], rows: Record<string, string>[]): string {
  const headerLine = headers.map(h => {
    if (h.includes(',') || h.includes('"') || h.includes('\n')) {
      return `"${h.replace(/"/g, '""')}"`;
    }
    return h;
  }).join(',');
  
  const dataLines = rows.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [headerLine, ...dataLines].join('\n');
}

export default function CSVUploader({ onUpload }: CSVUploaderProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    success: number;
    updated: number;
    errors: number;
    deleted?: number;
    isSync?: boolean;
  } | null>(null);
  
  const [sourceType, setSourceType] = useState<'file' | 'url' | 'multiple-urls'>('file');
  const [sourceUrl, setSourceUrl] = useState("");
  const [savedSources, setSavedSources] = useState<SavedSource[]>([]);
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);

  // Load saved sources from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('csvImportSources');
      if (saved) {
        const sources: SavedSource[] = JSON.parse(saved);
        setSavedSources(sources);
      }
    } catch (e) {
      console.error('Failed to load saved sources:', e);
    }
  }, []);

  // Helper: Save sources to localStorage
  const saveSourcesToLocalStorage = (sources: SavedSource[]) => {
    try {
      localStorage.setItem('csvImportSources', JSON.stringify(sources));
    } catch (e) {
      console.error('Failed to save sources:', e);
    }
  };

  // Helper: Add new source
  const addNewSource = () => {
    const newSource: SavedSource = {
      id: crypto.randomUUID(),
      label: '',
      url: '',
    };
    const updated = [...savedSources, newSource];
    setSavedSources(updated);
    saveSourcesToLocalStorage(updated);
  };

  // Helper: Remove source
  const removeSource = (id: string) => {
    const updated = savedSources.filter(s => s.id !== id);
    setSavedSources(updated);
    saveSourcesToLocalStorage(updated);
  };

  // Helper: Update source
  const updateSource = (id: string, field: 'label' | 'url', value: string) => {
    const updated = savedSources.map(s => {
      if (s.id === id) {
        if (field === 'label') {
          return { ...s, label: value.toUpperCase().slice(0, 4) };
        } else {
          return { ...s, url: value };
        }
      }
      return s;
    });
    setSavedSources(updated);
    saveSourcesToLocalStorage(updated);
  };

  // Helper: Load multiple CSVs sequentially
  const loadMultipleCSVs = async (): Promise<File> => {
    const validSources = savedSources.filter(s => s.label && s.url);
    
    if (validSources.length === 0) {
      throw new Error('Нет валидных источников для загрузки');
    }

    setLoadProgress({ current: 0, total: validSources.length, errors: [] });

    interface ParsedCSV {
      label: string;
      headers: string[];
      rows: Record<string, string>[];
    }

    const parsedCSVs: ParsedCSV[] = [];
    const errors: string[] = [];

    // Load and parse all CSVs
    for (let i = 0; i < validSources.length; i++) {
      const source = validSources[i];
      setLoadProgress({ current: i + 1, total: validSources.length, errors });

      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const csvText = await response.text();
        const { headers, rows } = parseCSV(csvText);

        parsedCSVs.push({
          label: source.label,
          headers,
          rows,
        });

        toast({
          title: `${source.label} загружен`,
          description: `${rows.length} строк, ${headers.length} колонок`,
        });
      } catch (error: any) {
        const errorMsg = `${source.label}: ${error.message}`;
        errors.push(errorMsg);
        
        toast({
          title: `Ошибка загрузки ${source.label}`,
          description: error.message,
          variant: "destructive",
        });
      }
    }

    setLoadProgress(null);

    if (parsedCSVs.length === 0) {
      throw new Error('Не удалось загрузить ни один CSV файл');
    }

    // Collect all unique headers from all CSVs
    const allHeaders = new Set<string>();
    parsedCSVs.forEach(csv => {
      csv.headers.forEach(h => allHeaders.add(h));
    });
    const mergedHeaders = Array.from(allHeaders);

    // Normalize rows to include all merged headers
    const normalizedRows = parsedCSVs.flatMap(csv => {
      return csv.rows.map(row => {
        const normalizedRow: Record<string, string> = {};
        mergedHeaders.forEach(header => {
          normalizedRow[header] = row[header] || '';
        });
        return normalizedRow;
      });
    });

    // Convert back to CSV text
    const mergedCsvText = convertToCSVText(mergedHeaders, normalizedRows);

    toast({
      title: "CSV файлы объединены",
      description: `Всего ${normalizedRows.length} строк, ${mergedHeaders.length} колонок`,
    });

    // Convert to File object
    const blob = new Blob([mergedCsvText], { type: 'text/csv' });
    return new File([blob], 'merged.csv', { type: 'text/csv' });
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/inventory/sync-from-file");
      return response.json();
    },
    onSuccess: (data) => {
      const deletedCount = data.deleted ?? 0;
      setResult({
        success: data.created ?? 0,
        updated: data.updated ?? 0,
        errors: data.errors ?? 0,
        deleted: deletedCount,
        isSync: true,
      });
      toast({
        title: "Синхронизация завершена",
        description: `Создано: ${data.created ?? 0}, Обновлено: ${data.updated ?? 0}, Удалено: ${deletedCount}`,
      });
      if (data.deletedItems && data.deletedItems.length > 0) {
        console.log("[FILE SYNC] Deleted items:", data.deletedItems);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка синхронизации",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAllItemsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/inventory/all/items', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Все товары удалены",
        description: `Удалено записей: ${data.deleted ?? 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const uploadResult = await onUpload(file);
      setProgress(100);
      setResult(uploadResult);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      clearInterval(interval);
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUrlUpload = async () => {
    if (!sourceUrl.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите URL CSV файла",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const csvText = await response.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const file = new File([blob], 'url-import.csv', { type: 'text/csv' });
      
      const uploadResult = await onUpload(file);
      setProgress(100);
      setResult(uploadResult);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      clearInterval(interval);
      setUploading(false);
    }
  };

  const handleMultipleUrlsUpload = async () => {
    const validSources = savedSources.filter(s => s.label && s.url);
    
    if (validSources.length === 0) {
      toast({
        title: "Ошибка",
        description: "Добавьте хотя бы один источник с меткой и URL",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate labels
    const labels = validSources.map(s => s.label);
    const uniqueLabels = new Set(labels);
    if (labels.length !== uniqueLabels.size) {
      toast({
        title: "Ошибка",
        description: "Метки должны быть уникальными",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const mergedFile = await loadMultipleCSVs();
      const uploadResult = await onUpload(mergedFile);
      setProgress(100);
      setResult(uploadResult);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Массовая загрузка CSV</CardTitle>
        <CardDescription>
          Формат: ID товара; Название; SKU; Количество; Штрихкод (опц.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label>Источник данных</Label>
          <RadioGroup value={sourceType} onValueChange={(value) => setSourceType(value as any)} data-testid="radio-source-type">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="file" id="source-file" data-testid="radio-source-file" />
              <Label htmlFor="source-file" className="cursor-pointer">Локальный файл</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="url" id="source-url" data-testid="radio-source-url" />
              <Label htmlFor="source-url" className="cursor-pointer">URL адрес</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="multiple-urls" id="source-multiple" data-testid="radio-source-multiple" />
              <Label htmlFor="source-multiple" className="cursor-pointer">Несколько URL (объединение)</Label>
            </div>
          </RadioGroup>
        </div>

        {sourceType === 'file' && (
          <div className="border-2 border-dashed rounded-md p-8 text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Перетащите CSV файл или нажмите для выбора
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
                disabled={uploading}
                data-testid="input-csv-file"
              />
              <label htmlFor="csv-upload">
                <Button 
                  variant="outline" 
                  disabled={uploading}
                  asChild
                  data-testid="button-upload-csv"
                >
                  <span>
                    <FileText className="w-4 h-4 mr-2" />
                    Выбрать файл
                  </span>
                </Button>
              </label>
            </div>
          </div>
        )}

        {sourceType === 'url' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-url">URL CSV файла</Label>
              <Input
                id="csv-url"
                type="url"
                placeholder="https://example.com/data.csv"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={uploading}
                data-testid="input-csv-url"
              />
            </div>
            <Button
              onClick={handleUrlUpload}
              disabled={uploading || !sourceUrl.trim()}
              className="w-full"
              data-testid="button-load-url"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              {uploading ? "Загрузка..." : "Загрузить из URL"}
            </Button>
          </div>
        )}

        {sourceType === 'multiple-urls' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Источники (метка 4 символа)</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addNewSource}
                  data-testid="button-add-source"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </div>
              
              {savedSources.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет сохраненных источников. Нажмите "Добавить" чтобы начать.
                </p>
              ) : (
                <div className="space-y-2">
                  {savedSources.map((source) => (
                    <div key={source.id} className="flex gap-2">
                      <Input
                        placeholder="ABCD"
                        value={source.label}
                        onChange={(e) => updateSource(source.id, 'label', e.target.value)}
                        className="w-20 font-mono"
                        maxLength={4}
                        data-testid={`input-source-label-${source.id}`}
                      />
                      <Input
                        type="url"
                        placeholder="https://example.com/data.csv"
                        value={source.url}
                        onChange={(e) => updateSource(source.id, 'url', e.target.value)}
                        className="flex-1"
                        data-testid={`input-source-url-${source.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeSource(source.id)}
                        data-testid={`button-remove-source-${source.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {loadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Загрузка {loadProgress.current} из {loadProgress.total}...</span>
                  <span>{Math.round((loadProgress.current / loadProgress.total) * 100)}%</span>
                </div>
                <Progress value={(loadProgress.current / loadProgress.total) * 100} />
                {loadProgress.errors.length > 0 && (
                  <div className="text-sm text-destructive">
                    {loadProgress.errors.map((err, idx) => (
                      <div key={idx}>• {err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleMultipleUrlsUpload}
              disabled={uploading || savedSources.filter(s => s.label && s.url).length === 0}
              className="w-full"
              data-testid="button-load-multiple-urls"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              {uploading ? "Загрузка..." : `Загрузить из ${savedSources.filter(s => s.label && s.url).length} источников`}
            </Button>
          </div>
        )}

        {uploading && !loadProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Загрузка...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                <strong>Загрузка завершена</strong>
                <div className="mt-2 space-y-1 text-sm">
                  <p>✓ Новых записей: {result.success}</p>
                  <p>↻ Обновлено: {result.updated}</p>
                  {result.isSync && (
                    <p className="text-muted-foreground">Удалено: {result.deleted ?? 0}</p>
                  )}
                  {!result.isSync && result.errors > 0 && (
                    <p className="text-destructive">✗ Ошибок: {result.errors}</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="border-t pt-4">
          <div className="bg-accent/50 rounded-md p-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Синхронизация из файла
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Обновите инвентарь из <code className="bg-background px-1 rounded">data/inventory.csv</code>. 
              Позиции, отсутствующие в файле, будут удалены.
            </p>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              variant="secondary"
              className="w-full"
              data-testid="button-sync-from-file"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? "Синхронизация..." : "Обновить из файла"}
            </Button>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="bg-destructive/10 rounded-md p-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              Опасная зона
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Удалить все товары из базы данных. Это действие необратимо!
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
                  data-testid="button-delete-all-items"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить все товары
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Вы абсолютно уверены?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие удалит ВСЕ товары из базы данных. Это действие необратимо 
                    и данные невозможно будет восстановить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteAllItemsMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover-elevate"
                    data-testid="button-confirm-delete"
                  >
                    Да, удалить все
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="bg-muted rounded-md p-4">
          <h4 className="text-sm font-medium mb-2">Правила обработки:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• При совпадении ID товара - обновляется количество</li>
            <li>• Локация извлекается из SKU (A101-G → локация A101)</li>
            <li>• Если SKU без формата (kjkhk) → локация = SKU</li>
            <li>• Штрихкод опционален (5-й столбец)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
