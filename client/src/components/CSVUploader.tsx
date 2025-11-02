import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Upload, FileText, CheckCircle, RefreshCw, Plus, Trash2, Link as LinkIcon, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConflictResolutionDialog } from "@/components/ConflictResolutionDialog";
import type { CSVConflict } from "@shared/schema";

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

interface ColumnMapping {
  csvColumn: string;
  enabled: boolean;
  targetField: string;
  sampleData: string[];
}

// Helper: Check if column should be skipped
function shouldSkipColumn(csvColumn: string): boolean {
  const lower = csvColumn.toLowerCase();
  return csvColumn.startsWith('c:') || lower.includes('variation');
}

// Helper: Auto-suggest target field based on CSV column name
function suggestTargetField(csvColumn: string): string {
  if (shouldSkipColumn(csvColumn)) {
    return '(skip)';
  }
  
  const lower = csvColumn.toLowerCase();
  
  if (lower.includes('product') || lower.includes('title') || lower.includes('название')) return 'productName';
  if (lower.includes('sku') || lower.includes('артикул')) return 'sku';
  if (lower.includes('location') || lower.includes('локация')) return 'location';
  if (lower.includes('barcode') || lower.includes('штрихкод')) return 'barcode';
  if (lower.includes('quantity') || lower.includes('количество') || lower.includes('qty') || lower.includes('warehouse_inventory')) return 'quantity';
  if (lower.includes('price') || lower.includes('цена')) return 'price';
  if (lower.includes('itemid') || lower.includes('item id') || lower.includes('item_id')) return 'itemId';
  if (lower.includes('seller_ebay_seller_id') || lower.includes('ebay seller') || lower.includes('seller')) return 'ebaySellerName';
  
  // Image URL pattern matching for imageUrl1-24 (MUST come BEFORE general URL check)
  if (/image.*url.*\s*1|image_url_1|imageurl\s*1|img\s*1|photo\s*1|фото\s*1/i.test(csvColumn)) return 'imageUrl1';
  if (/image.*url.*\s*2|image_url_2|imageurl\s*2|img\s*2|photo\s*2|фото\s*2/i.test(csvColumn)) return 'imageUrl2';
  if (/image.*url.*\s*3|image_url_3|imageurl\s*3|img\s*3|photo\s*3|фото\s*3/i.test(csvColumn)) return 'imageUrl3';
  if (/image.*url.*\s*4|image_url_4|imageurl\s*4|img\s*4|photo\s*4|фото\s*4/i.test(csvColumn)) return 'imageUrl4';
  if (/image.*url.*\s*5|image_url_5|imageurl\s*5|img\s*5|photo\s*5|фото\s*5/i.test(csvColumn)) return 'imageUrl5';
  if (/image.*url.*\s*6|image_url_6|imageurl\s*6|img\s*6|photo\s*6|фото\s*6/i.test(csvColumn)) return 'imageUrl6';
  if (/image.*url.*\s*7|image_url_7|imageurl\s*7|img\s*7|photo\s*7|фото\s*7/i.test(csvColumn)) return 'imageUrl7';
  if (/image.*url.*\s*8|image_url_8|imageurl\s*8|img\s*8|photo\s*8|фото\s*8/i.test(csvColumn)) return 'imageUrl8';
  if (/image.*url.*\s*9|image_url_9|imageurl\s*9|img\s*9|photo\s*9|фото\s*9/i.test(csvColumn)) return 'imageUrl9';
  if (/image.*url.*\s*10|image_url_10|imageurl\s*10|img\s*10|photo\s*10|фото\s*10/i.test(csvColumn)) return 'imageUrl10';
  if (/image.*url.*\s*11|image_url_11|imageurl\s*11|img\s*11|photo\s*11|фото\s*11/i.test(csvColumn)) return 'imageUrl11';
  if (/image.*url.*\s*12|image_url_12|imageurl\s*12|img\s*12|photo\s*12|фото\s*12/i.test(csvColumn)) return 'imageUrl12';
  if (/image.*url.*\s*13|image_url_13|imageurl\s*13|img\s*13|photo\s*13|фото\s*13/i.test(csvColumn)) return 'imageUrl13';
  if (/image.*url.*\s*14|image_url_14|imageurl\s*14|img\s*14|photo\s*14|фото\s*14/i.test(csvColumn)) return 'imageUrl14';
  if (/image.*url.*\s*15|image_url_15|imageurl\s*15|img\s*15|photo\s*15|фото\s*15/i.test(csvColumn)) return 'imageUrl15';
  if (/image.*url.*\s*16|image_url_16|imageurl\s*16|img\s*16|photo\s*16|фото\s*16/i.test(csvColumn)) return 'imageUrl16';
  if (/image.*url.*\s*17|image_url_17|imageurl\s*17|img\s*17|photo\s*17|фото\s*17/i.test(csvColumn)) return 'imageUrl17';
  if (/image.*url.*\s*18|image_url_18|imageurl\s*18|img\s*18|photo\s*18|фото\s*18/i.test(csvColumn)) return 'imageUrl18';
  if (/image.*url.*\s*19|image_url_19|imageurl\s*19|img\s*19|photo\s*19|фото\s*19/i.test(csvColumn)) return 'imageUrl19';
  if (/image.*url.*\s*20|image_url_20|imageurl\s*20|img\s*20|photo\s*20|фото\s*20/i.test(csvColumn)) return 'imageUrl20';
  if (/image.*url.*\s*21|image_url_21|imageurl\s*21|img\s*21|photo\s*21|фото\s*21/i.test(csvColumn)) return 'imageUrl21';
  if (/image.*url.*\s*22|image_url_22|imageurl\s*22|img\s*22|photo\s*22|фото\s*22/i.test(csvColumn)) return 'imageUrl22';
  if (/image.*url.*\s*23|image_url_23|imageurl\s*23|img\s*23|photo\s*23|фото\s*23/i.test(csvColumn)) return 'imageUrl23';
  if (/image.*url.*\s*24|image_url_24|imageurl\s*24|img\s*24|photo\s*24|фото\s*24/i.test(csvColumn)) return 'imageUrl24';
  
  if (lower.includes('url') || lower.includes('ссылка') || lower.includes('ebay')) return 'ebayUrl';
  if (lower.includes('condition') || lower.includes('состояние')) return 'condition';
  
  if (lower.includes('weight') || lower.includes('вес')) return 'weight';
  if (lower.includes('width') || lower.includes('ширина')) return 'width';
  if (lower.includes('height') || lower.includes('высота')) return 'height';
  if (lower.includes('length') || lower.includes('depth') || lower.includes('длина') || lower.includes('глубина')) return 'length';
  
  return '(skip)';
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

// Target field options
const TARGET_FIELDS = [
  { value: '(skip)', label: '(пропустить)' },
  { value: 'productName', label: 'Название товара' },
  { value: 'sku', label: 'SKU' },
  { value: 'location', label: 'Локация' },
  { value: 'barcode', label: 'Штрихкод' },
  { value: 'quantity', label: 'Количество' },
  { value: 'price', label: 'Цена' },
  { value: 'condition', label: 'Состояние' },
  { value: 'itemId', label: 'ID товара' },
  { value: 'ebayUrl', label: 'eBay URL' },
  { value: 'ebaySellerName', label: 'Продавец eBay' },
  { value: 'weight', label: 'Вес' },
  { value: 'width', label: 'Ширина' },
  { value: 'height', label: 'Высота' },
  { value: 'length', label: 'Длина' },
  ...Array.from({ length: 24 }, (_, i) => ({ 
    value: `imageUrl${i + 1}`, 
    label: `Изображение ${i + 1}` 
  })),
];

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
  
  // Column mapping dialog state
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingStep, setMappingStep] = useState(1);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  // Conflict resolution state
  const [conflicts, setConflicts] = useState<CSVConflict[]>([]);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCsvData, setPendingCsvData] = useState<any[]>([]);

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

  // Helper: Save column mapping to localStorage
  const saveColumnMapping = (mapping: ColumnMapping[]) => {
    try {
      const simplified = mapping.map(m => ({
        csvColumn: m.csvColumn,
        targetField: m.targetField,
        enabled: m.enabled,
      }));
      localStorage.setItem('csvColumnMapping', JSON.stringify(simplified));
    } catch (e) {
      console.error('Failed to save column mapping:', e);
    }
  };

  // Helper: Load column mapping from localStorage
  const loadColumnMapping = (csvColumns: string[]): ColumnMapping[] => {
    try {
      const saved = localStorage.getItem('csvColumnMapping');
      if (!saved) return [];
      
      const savedMappings = JSON.parse(saved);
      const mappingMap = new Map<string, { targetField: string; enabled: boolean }>(
        savedMappings.map((m: any) => [m.csvColumn, { targetField: m.targetField, enabled: m.enabled }])
      );
      
      return csvColumns.map(col => {
        const savedMapping = mappingMap.get(col);
        return {
          csvColumn: col,
          targetField: savedMapping ? savedMapping.targetField : suggestTargetField(col),
          enabled: savedMapping ? savedMapping.enabled : !shouldSkipColumn(col),
          sampleData: [],
        };
      });
    } catch (e) {
      console.error('Failed to load column mapping:', e);
      return [];
    }
  };

  // Helper: Reset column mapping
  const resetColumnMapping = () => {
    try {
      localStorage.removeItem('csvColumnMapping');
      toast({
        title: "Настройки сброшены",
        description: "Сохраненные настройки маппинга удалены",
      });
      
      if (csvPreview) {
        const newMapping = csvPreview.headers.map(header => ({
          csvColumn: header,
          targetField: suggestTargetField(header),
          enabled: !shouldSkipColumn(header),
          sampleData: csvPreview.rows.slice(0, 3).map(row => row[header] || ''),
        }));
        setColumnMapping(newMapping);
      }
    } catch (e) {
      console.error('Failed to reset column mapping:', e);
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

    const allHeaders = new Set<string>();
    parsedCSVs.forEach(csv => {
      csv.headers.forEach(h => allHeaders.add(h));
    });
    const mergedHeaders = Array.from(allHeaders);

    const normalizedRows = parsedCSVs.flatMap(csv => {
      return csv.rows.map(row => {
        const normalizedRow: Record<string, string> = {};
        mergedHeaders.forEach(header => {
          normalizedRow[header] = row[header] || '';
        });
        return normalizedRow;
      });
    });

    const mergedCsvText = convertToCSVText(mergedHeaders, normalizedRows);

    toast({
      title: "CSV файлы объединены",
      description: `Всего ${normalizedRows.length} строк, ${mergedHeaders.length} колонок`,
    });

    const blob = new Blob([mergedCsvText], { type: 'text/csv' });
    return new File([blob], 'merged.csv', { type: 'text/csv' });
  };

  // Helper: Open mapping dialog with file
  const openMappingDialog = async (file: File) => {
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      
      setCsvPreview({ headers, rows });
      setPendingFile(file);
      
      const savedMapping = loadColumnMapping(headers);
      const mapping = savedMapping.length > 0 
        ? savedMapping.map(m => ({
            ...m,
            sampleData: rows.slice(0, 3).map(row => row[m.csvColumn] || ''),
          }))
        : headers.map(header => ({
            csvColumn: header,
            targetField: suggestTargetField(header),
            enabled: !shouldSkipColumn(header),
            sampleData: rows.slice(0, 3).map(row => row[header] || ''),
          }));
      
      setColumnMapping(mapping);
      setMappingStep(1);
      setMappingDialogOpen(true);
    } catch (error: any) {
      toast({
        title: "Ошибка чтения файла",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Helper: Apply mapping and upload
  const applyMappingAndUpload = async () => {
    if (!csvPreview || !pendingFile) return;
    
    saveColumnMapping(columnMapping);
    
    const enabledMappings = columnMapping.filter(m => m.enabled && m.targetField !== '(skip)');
    
    if (enabledMappings.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите хотя бы одну колонку для импорта",
        variant: "destructive",
      });
      return;
    }
    
    const targetHeaders = enabledMappings.map(m => m.targetField);
    const transformedRows = csvPreview.rows.map(row => {
      const newRow: Record<string, string> = {};
      enabledMappings.forEach(mapping => {
        newRow[mapping.targetField] = row[mapping.csvColumn] || '';
      });
      return newRow;
    });
    
    const transformedCsvText = convertToCSVText(targetHeaders, transformedRows);
    const blob = new Blob([transformedCsvText], { type: 'text/csv' });
    const transformedFile = new File([blob], pendingFile.name, { type: 'text/csv' });
    
    setMappingDialogOpen(false);
    setUploading(true);
    setProgress(0);
    setResult(null);

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const uploadResult = await onUpload(transformedFile);
      setProgress(100);
      setResult(uploadResult);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      clearInterval(interval);
      setUploading(false);
      setPendingFile(null);
      setCsvPreview(null);
      setColumnMapping([]);
    }
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/inventory/sync-from-file");
      return response.json();
    },
    onSuccess: async (data) => {
      // Check for conflicts
      if (data.hasConflicts && data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts);
        setPendingCsvData(data.csvData || []);
        setConflictDialogOpen(true);
        
        toast({
          title: "Обнаружены конфликты",
          description: `Найдено ${data.conflicts.length} товаров с отличающимися данными или дубликатами. Выберите действия.`,
        });
        return;
      }
      
      // No conflicts - process as usual
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

  const handleConflictResolution = async (resolutions: Array<{ itemId: string; sku: string; action: 'accept_csv' | 'keep_existing' | 'create_duplicate' | 'replace_existing' | 'skip' }>) => {
    try {
      const response = await apiRequest("POST", "/api/inventory/resolve-conflicts", {
        resolutions,
        csvData: pendingCsvData,
      });
      
      const data = await response.json();
      
      toast({
        title: "Конфликты разрешены",
        description: `Обновлено/Создано: ${data.updated ?? 0}, Пропущено: ${data.skipped ?? 0}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      setConflictDialogOpen(false);
      setConflicts([]);
      setPendingCsvData([]);
    } catch (error: any) {
      toast({
        title: "Ошибка разрешения конфликтов",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    await openMappingDialog(file);
    e.target.value = '';
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

    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const csvText = await response.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const file = new File([blob], 'url-import.csv', { type: 'text/csv' });
      
      await openMappingDialog(file);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
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

    try {
      const mergedFile = await loadMultipleCSVs();
      await openMappingDialog(mergedFile);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateColumnMapping = (csvColumn: string, field: 'enabled' | 'targetField', value: boolean | string) => {
    setColumnMapping(prev => prev.map(m => {
      if (m.csvColumn === csvColumn) {
        return { ...m, [field]: value };
      }
      return m;
    }));
  };

  return (
    <>
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
                Это действие удалит ВСЕ товары из инвентаря без возможности восстановления. Используйте с осторожностью!
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    data-testid="button-delete-all-trigger"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить все товары
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Вы абсолютно уверены?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя отменить. Все товары будут безвозвратно удалены из базы данных.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllItemsMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Да, удалить все
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Шаг {mappingStep} из 3: {
                mappingStep === 1 ? "Проверка данных" :
                mappingStep === 2 ? "Сопоставление колонок" :
                "Подтверждение"
              }
            </DialogTitle>
          </DialogHeader>

          {mappingStep === 1 && csvPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{csvPreview.rows.length}</div>
                    <div className="text-sm text-muted-foreground">Строк данных</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{csvPreview.headers.length}</div>
                    <div className="text-sm text-muted-foreground">Колонок</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{columnMapping.filter(m => m.enabled).length}</div>
                    <div className="text-sm text-muted-foreground">Активных</div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Превью данных (первые 3 строки)</h4>
                <ScrollArea className="h-48 border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvPreview.headers.slice(0, 6).map((header, idx) => (
                          <TableHead key={idx} className="whitespace-nowrap">{header}</TableHead>
                        ))}
                        {csvPreview.headers.length > 6 && (
                          <TableHead className="text-muted-foreground">... еще {csvPreview.headers.length - 6}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvPreview.rows.slice(0, 3).map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {csvPreview.headers.slice(0, 6).map((header, colIdx) => (
                            <TableCell key={colIdx} className="text-sm">{row[header] || '-'}</TableCell>
                          ))}
                          {csvPreview.headers.length > 6 && <TableCell className="text-muted-foreground">...</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}

          {mappingStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Настройте сопоставление колонок CSV с полями системы
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetColumnMapping}
                  data-testid="button-reset-mapping"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Сбросить
                </Button>
              </div>

              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>CSV колонка</TableHead>
                      <TableHead>Целевое поле</TableHead>
                      <TableHead>Превью данных</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {columnMapping.map((mapping, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Checkbox
                            checked={mapping.enabled}
                            onCheckedChange={(checked) => 
                              updateColumnMapping(mapping.csvColumn, 'enabled', checked as boolean)
                            }
                            data-testid={`checkbox-column-${idx}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{mapping.csvColumn}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping.targetField}
                            onValueChange={(value) => 
                              updateColumnMapping(mapping.csvColumn, 'targetField', value)
                            }
                            disabled={!mapping.enabled}
                          >
                            <SelectTrigger className="w-48" data-testid={`select-target-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TARGET_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {mapping.sampleData.slice(0, 2).join(', ') || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {mappingStep === 3 && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Готово к загрузке</strong>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>✓ Активных колонок: {columnMapping.filter(m => m.enabled && m.targetField !== '(skip)').length}</p>
                    <p>✓ Строк данных: {csvPreview?.rows.length ?? 0}</p>
                    <p className="text-muted-foreground">Настройки маппинга будут сохранены для следующего импорта</p>
                  </div>
                </AlertDescription>
              </Alert>

              <div>
                <h4 className="text-sm font-medium mb-2">Итоговое сопоставление:</h4>
                <ScrollArea className="h-64 border rounded-md p-4">
                  <div className="space-y-2">
                    {columnMapping
                      .filter(m => m.enabled && m.targetField !== '(skip)')
                      .map((mapping, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-muted-foreground">{mapping.csvColumn}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">
                            {TARGET_FIELDS.find(f => f.value === mapping.targetField)?.label}
                          </span>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {mappingStep > 1 && (
              <Button
                variant="outline"
                onClick={() => setMappingStep(prev => prev - 1)}
                data-testid="button-prev-step"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Назад
              </Button>
            )}
            
            {mappingStep < 3 ? (
              <Button
                onClick={() => setMappingStep(prev => prev + 1)}
                data-testid="button-next-step"
              >
                Далее
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={applyMappingAndUpload}
                data-testid="button-confirm-upload"
              >
                <Upload className="w-4 h-4 mr-2" />
                Загрузить
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictResolutionDialog
        open={conflictDialogOpen}
        onClose={() => setConflictDialogOpen(false)}
        conflicts={conflicts}
        onResolve={handleConflictResolution}
      />
    </>
  );
}
