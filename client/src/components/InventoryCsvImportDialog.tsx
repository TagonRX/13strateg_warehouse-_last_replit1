import { useState, useEffect } from "react";
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
import { Progress } from "@/components/ui/progress";
import { FileUp, CheckCircle2, AlertTriangle, XCircle, Upload, Plus, Trash2 } from "lucide-react";
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
    dimensionConflicts: number;
  };
  session: {
    id: string;
    parsedData: string;
  };
}

interface DimensionConflict {
  csvRowIndex: number;
  productId: string;
  productName: string;
  conflicts: {
    weight?: { csv: number; current: number };
    width?: { csv: number; current: number };
    height?: { csv: number; current: number };
    length?: { csv: number; current: number };
  };
}

interface ColumnMapping {
  csvColumn: string;
  enabled: boolean;
  targetField: string;
  sampleData: string[];
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
  // Build header line
  const headerLine = headers.map(h => {
    // Escape commas and quotes in header
    if (h.includes(',') || h.includes('"') || h.includes('\n')) {
      return `"${h.replace(/"/g, '""')}"`;
    }
    return h;
  }).join(',');
  
  // Build data lines
  const dataLines = rows.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes in values
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [headerLine, ...dataLines].join('\n');
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
  if (lower.includes('quantity') || lower.includes('количество') || lower.includes('qty') || lower.includes('warehouse_inventory')) return 'quantity';
  if (lower.includes('price') || lower.includes('цена')) return 'price';
  if (lower.includes('itemid') || lower.includes('item id') || lower.includes('item_id')) return 'itemId';
  if (lower.includes('seller_ebay_seller_id') || lower.includes('ebay seller') || lower.includes('seller')) return 'ebaySellerName';
  
  // Image URL pattern matching for imageUrl1-24 (MUST come BEFORE general URL check)
  // Matches patterns like: "Image URLs 1", "image_url_1", "imageurl1", "img1", "photo1", "фото1"
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
  
  // General URL check (less specific, comes AFTER image URL checks)
  if (lower.includes('url') || lower.includes('ссылка') || lower.includes('ebay')) return 'ebayUrl';
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
  const [sourceType, setSourceType] = useState<'url' | 'file' | 'multiple-urls'>('url');
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [savedSources, setSavedSources] = useState<SavedSource[]>([]);
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [sessionData, setSessionData] = useState<ImportSession | null>(null);
  const [resolutions, setResolutions] = useState<{ csvRowIndex: number; selectedProductId: string }[]>([]);
  const [dimensionChoices, setDimensionChoices] = useState<{ productId: string; useCSV: boolean }[]>([]);
  const { toast } = useToast();

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
  const loadMultipleCSVs = async (): Promise<string> => {
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

    // Track which columns are unique to each CSV for warning messages
    const columnSources = new Map<string, Set<string>>();
    parsedCSVs.forEach(csv => {
      csv.headers.forEach(header => {
        if (!columnSources.has(header)) {
          columnSources.set(header, new Set());
        }
        columnSources.get(header)!.add(csv.label);
      });
    });

    // Find columns that don't appear in all CSVs
    const uniqueColumns = Array.from(columnSources.entries()).filter(
      ([_, sources]) => sources.size < parsedCSVs.length
    );

    // Show warning if CSVs have different columns
    if (uniqueColumns.length > 0) {
      const warningDetails = uniqueColumns.map(([col, sources]) => {
        const sourceList = Array.from(sources).join(', ');
        return `${col} (только в: ${sourceList})`;
      }).slice(0, 5); // Show first 5 unique columns

      toast({
        title: "Обнаружены различия в колонках",
        description: `${uniqueColumns.length} колонок не во всех CSV файлах. ${warningDetails.join('; ')}`,
        variant: "default",
      });
    }

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

    // Convert back to CSV text using helper function
    const mergedCsvText = convertToCSVText(mergedHeaders, normalizedRows);

    toast({
      title: "CSV файлы объединены",
      description: `Всего ${normalizedRows.length} строк, ${mergedHeaders.length} колонок`,
    });

    return mergedCsvText;
  };

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
      } else if (sourceType === 'file' && file) {
        csvText = await file.text();
      } else if (sourceType === 'multiple-urls') {
        csvText = await loadMultipleCSVs();
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
      } else if (sourceType === 'file' && file) {
        csvText = await file.text();
      } else if (sourceType === 'multiple-urls') {
        csvText = await loadMultipleCSVs();
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
      
      // Initialize dimension choices with default (keep current values = useCSV: false)
      const parsedData = JSON.parse(data.session.parsedData);
      if (parsedData.dimensionConflicts && parsedData.dimensionConflicts.length > 0) {
        const defaultChoices = parsedData.dimensionConflicts.map((conflict: DimensionConflict) => ({
          productId: conflict.productId,
          useCSV: false, // Default: keep current values (safe choice)
        }));
        setDimensionChoices(defaultChoices);
      }
      
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
      
      // Then commit the import with dimensionChoices
      const commitResponse = await apiRequest(
        'POST',
        `/api/inventory/import-sessions/${sessionData.session.id}/commit`,
        { dimensionChoices }
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

    if (sourceType === 'multiple-urls') {
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

  const handleDimensionChoice = (productId: string, useCSV: boolean) => {
    setDimensionChoices(prev => {
      const filtered = prev.filter(c => c.productId !== productId);
      return [...filtered, { productId, useCSV }];
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
    setLoadProgress(null);
    setColumnMapping([]);
    setCsvPreview(null);
    setSessionData(null);
    setResolutions([]);
    setDimensionChoices([]);
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
    { value: 'ebaySellerName', label: 'eBay Seller' },
    { value: 'imageUrl1', label: 'Image URLs 1' },
    { value: 'imageUrl2', label: 'Image URLs 2' },
    { value: 'imageUrl3', label: 'Image URLs 3' },
    { value: 'imageUrl4', label: 'Image URLs 4' },
    { value: 'imageUrl5', label: 'Image URLs 5' },
    { value: 'imageUrl6', label: 'Image URLs 6' },
    { value: 'imageUrl7', label: 'Image URLs 7' },
    { value: 'imageUrl8', label: 'Image URLs 8' },
    { value: 'imageUrl9', label: 'Image URLs 9' },
    { value: 'imageUrl10', label: 'Image URLs 10' },
    { value: 'imageUrl11', label: 'Image URLs 11' },
    { value: 'imageUrl12', label: 'Image URLs 12' },
    { value: 'imageUrl13', label: 'Image URLs 13' },
    { value: 'imageUrl14', label: 'Image URLs 14' },
    { value: 'imageUrl15', label: 'Image URLs 15' },
    { value: 'imageUrl16', label: 'Image URLs 16' },
    { value: 'imageUrl17', label: 'Image URLs 17' },
    { value: 'imageUrl18', label: 'Image URLs 18' },
    { value: 'imageUrl19', label: 'Image URLs 19' },
    { value: 'imageUrl20', label: 'Image URLs 20' },
    { value: 'imageUrl21', label: 'Image URLs 21' },
    { value: 'imageUrl22', label: 'Image URLs 22' },
    { value: 'imageUrl23', label: 'Image URLs 23' },
    { value: 'imageUrl24', label: 'Image URLs 24' },
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
              <RadioGroup value={sourceType} onValueChange={(v) => setSourceType(v as 'url' | 'file' | 'multiple-urls')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="url" id="source-url" data-testid="radio-source-url" />
                  <Label htmlFor="source-url">URL файла</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="file" id="source-file" data-testid="radio-source-file" />
                  <Label htmlFor="source-file">Загрузить файл</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="multiple-urls" id="source-multiple" data-testid="radio-source-multiple" />
                  <Label htmlFor="source-multiple">Несколько URL источников</Label>
                </div>
              </RadioGroup>
            </div>

            {sourceType === 'url' && (
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
            )}

            {sourceType === 'file' && (
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

            {sourceType === 'multiple-urls' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>URL источники</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addNewSource}
                      data-testid="button-add-url"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить
                    </Button>
                  </div>
                  
                  {savedSources.length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center text-muted-foreground">
                        Нет сохраненных источников. Нажмите "Добавить" чтобы начать.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="border rounded-md max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-32">Метка (4 макс.)</TableHead>
                            <TableHead>URL</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {savedSources.map((source, idx) => (
                            <TableRow key={source.id} data-testid={`row-url-source-${idx}`}>
                              <TableCell>
                                <Input
                                  placeholder="eBay"
                                  value={source.label}
                                  onChange={(e) => updateSource(source.id, 'label', e.target.value)}
                                  maxLength={4}
                                  className="font-mono uppercase"
                                  data-testid={`input-label-${idx}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  placeholder="https://example.com/data.csv"
                                  value={source.url}
                                  onChange={(e) => updateSource(source.id, 'url', e.target.value)}
                                  data-testid={`input-url-${idx}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeSource(source.id)}
                                  data-testid={`button-remove-${idx}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Метки должны быть уникальными (например: eBay, AMZN, ETSY). Все CSV файлы должны иметь одинаковые заголовки.
                  </p>
                </div>

                {loadProgress && (
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Загрузка CSV файлов</span>
                          <span className="text-muted-foreground">
                            {loadProgress.current} из {loadProgress.total}
                          </span>
                        </div>
                        <Progress 
                          value={(loadProgress.current / loadProgress.total) * 100} 
                          data-testid="progress-loading"
                        />
                      </div>
                      {loadProgress.errors.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-destructive">Ошибки:</p>
                          {loadProgress.errors.map((error, idx) => (
                            <p key={idx} className="text-xs text-muted-foreground">• {error}</p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReset} data-testid="button-cancel">
                Отмена
              </Button>
              <Button 
                onClick={handleLoadCSV} 
                disabled={previewCSVMutation.isPending || loadProgress !== null}
                data-testid={sourceType === 'multiple-urls' ? 'button-load-multiple' : 'button-load-csv'}
              >
                {previewCSVMutation.isPending || loadProgress !== null ? "Загрузка..." : "Загрузить"}
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

            {/* Dimension Conflicts Section */}
            {parsedData.dimensionConflicts && parsedData.dimensionConflicts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-semibold text-orange-900">Обнаружены конфликты размеров</p>
                    <p className="text-sm text-orange-700">
                      Найдено {parsedData.dimensionConflicts.length} товаров с отличающимися размерами. Выберите, какие значения сохранить.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {parsedData.dimensionConflicts.map((dimConflict: DimensionConflict, idx: number) => {
                    const choice = dimensionChoices.find(c => c.productId === dimConflict.productId);
                    const useCSV = choice?.useCSV ?? false;
                    
                    return (
                      <Card key={`dim-conflict-${idx}`} className="border-orange-200" data-testid={`card-dimension-conflict-${idx}`}>
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-600" />
                              <p className="font-medium">{dimConflict.productName}</p>
                            </div>
                            
                            <div className="ml-6 space-y-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Поле</TableHead>
                                    <TableHead>Текущее значение</TableHead>
                                    <TableHead>Значение из CSV</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {dimConflict.conflicts.weight && (
                                    <TableRow data-testid={`row-dimension-weight-${idx}`}>
                                      <TableCell className="font-medium">Вес (кг)</TableCell>
                                      <TableCell>{dimConflict.conflicts.weight.current}</TableCell>
                                      <TableCell>{dimConflict.conflicts.weight.csv}</TableCell>
                                    </TableRow>
                                  )}
                                  {dimConflict.conflicts.width && (
                                    <TableRow data-testid={`row-dimension-width-${idx}`}>
                                      <TableCell className="font-medium">Ширина (см)</TableCell>
                                      <TableCell>{dimConflict.conflicts.width.current}</TableCell>
                                      <TableCell>{dimConflict.conflicts.width.csv}</TableCell>
                                    </TableRow>
                                  )}
                                  {dimConflict.conflicts.height && (
                                    <TableRow data-testid={`row-dimension-height-${idx}`}>
                                      <TableCell className="font-medium">Высота (см)</TableCell>
                                      <TableCell>{dimConflict.conflicts.height.current}</TableCell>
                                      <TableCell>{dimConflict.conflicts.height.csv}</TableCell>
                                    </TableRow>
                                  )}
                                  {dimConflict.conflicts.length && (
                                    <TableRow data-testid={`row-dimension-length-${idx}`}>
                                      <TableCell className="font-medium">Длина (см)</TableCell>
                                      <TableCell>{dimConflict.conflicts.length.current}</TableCell>
                                      <TableCell>{dimConflict.conflicts.length.csv}</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                              
                              <div className="pt-2">
                                <Label className="text-sm font-medium">Выберите какие значения использовать:</Label>
                                <RadioGroup
                                  value={useCSV ? "csv" : "current"}
                                  onValueChange={(value) => handleDimensionChoice(dimConflict.productId, value === "csv")}
                                  className="mt-2"
                                  data-testid={`radio-group-dimension-${idx}`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="current" id={`dim-current-${idx}`} data-testid={`radio-keep-current-${idx}`} />
                                    <Label htmlFor={`dim-current-${idx}`} className="font-normal cursor-pointer">
                                      Оставить текущие значения (безопасно)
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="csv" id={`dim-csv-${idx}`} data-testid={`radio-use-csv-${idx}`} />
                                    <Label htmlFor={`dim-csv-${idx}`} className="font-normal cursor-pointer">
                                      Использовать значения из CSV
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

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
