import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, ChevronDown, ChevronRight, Pencil, Save, X, Trash2, ExternalLink, Image as ImageIcon, Copy } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import BarcodeEditor from "./BarcodeEditor";
import InventoryCsvImportDialog from "./InventoryCsvImportDialog";
import ImageGalleryModal from "./ImageGalleryModal";
import { DuplicatesDialog } from "./DuplicatesDialog";

interface BarcodeMapping {
  code: string;
  qty: number;
}

interface InventoryItem {
  id: string;
  productId: string | null;
  name: string | null;
  sku: string;
  location: string;
  quantity: number;
  barcode?: string;
  barcodeMappings?: string; // JSON string
  condition?: string | null; // New, Used, Exdisplay, Parts
  price?: number;
  length?: number;
  width?: number;
  height?: number;
  volume?: number;
  weight?: number;
  itemId?: string | null; // eBay item ID
  ebayUrl?: string | null; // eBay URL
  ebaySellerName?: string | null; // eBay seller name
  imageUrl1?: string | null;
  imageUrl2?: string | null;
  imageUrl3?: string | null;
  imageUrl4?: string | null;
  imageUrl5?: string | null;
  imageUrl6?: string | null;
  imageUrl7?: string | null;
  imageUrl8?: string | null;
  imageUrl9?: string | null;
  imageUrl10?: string | null;
  imageUrl11?: string | null;
  imageUrl12?: string | null;
  imageUrl13?: string | null;
  imageUrl14?: string | null;
  imageUrl15?: string | null;
  imageUrl16?: string | null;
  imageUrl17?: string | null;
  imageUrl18?: string | null;
  imageUrl19?: string | null;
  imageUrl20?: string | null;
  imageUrl21?: string | null;
  imageUrl22?: string | null;
  imageUrl23?: string | null;
  imageUrl24?: string | null;
}

interface InventoryTableProps {
  items: InventoryItem[];
  userRole?: string;
}

interface EditingRow {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  barcode: string;
  barcodeMappings: BarcodeMapping[];
  condition: string;
  price: string;
  length: string;
  width: string;
  height: string;
  weight: string;
}

// Resizable header component
function ResizableHeader({ 
  children, 
  columnKey, 
  width, 
  onResize,
  className = ""
}: { 
  children: React.ReactNode; 
  columnKey: string; 
  width: number;
  onResize: (columnKey: string, newWidth: number) => void;
  className?: string;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      onResize(columnKey, startWidth + diff);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <TableHead className={`relative ${className}`} style={{ width: `${width}px`, minWidth: `${width}px` }}>
      {children}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary"
        onMouseDown={handleMouseDown}
      />
    </TableHead>
  );
}

// Group items by location only (to show all items in same location in expandable menu)
function groupItemsByLocation(items: InventoryItem[]): Map<string, InventoryItem[]> {
  const groups = new Map<string, InventoryItem[]>();
  
  items.forEach(item => {
    const key = item.location;
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, item]);
  });
  
  return groups;
}

export default function InventoryTable({ items, userRole }: InventoryTableProps) {
  const [search, setSearch] = useState("");
  const [pageLimit, setPageLimit] = useState<string>("50");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [showFaultyDialog, setShowFaultyDialog] = useState(false);
  const [pendingCondition, setPendingCondition] = useState<string>("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const { toast } = useToast();

  // Fetch tested items for condition display
  const { data: testedItems = [] } = useQuery<any[]>({
    queryKey: ['/api/tested-items'],
  });

  // Helper function to get condition color classes
  const getConditionClasses = (condition: string | null): string => {
    if (!condition) return "";
    
    switch (condition) {
      case "New":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
      case "Exdisplay":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      case "Used":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100";
      case "Parts":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
      case "Faulty":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
      default:
        return "";
    }
  };

  // Default column widths
  const defaultWidths = {
    actions: 48,
    photo: 80,
    name: 250,
    sku: 150,
    quantity: 100,
    barcode: 150,
    condition: 120,
    price: 100,
    dimensions: 180,
    volume: 100,
    weight: 100,
    itemId: 120,
    ebaySeller: 120,
    ebay: 80,
  };

  // Column widths state with localStorage persistence (lazy initialization)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    // Guard against SSR/test environments
    if (typeof window === 'undefined') {
      return defaultWidths;
    }

    const saved = localStorage.getItem('inventory-column-widths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new columns
        return { ...defaultWidths, ...parsed };
      } catch {
        return defaultWidths;
      }
    }
    return defaultWidths;
  });

  // Save to localStorage whenever widths change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('inventory-column-widths', JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  // Resize handler
  const handleResize = (columnKey: string, newWidth: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: Math.max(50, newWidth), // Minimum 50px
    }));
  };

  // Sort items by location A-Z first (memoized for performance)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      return a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [items]);

  // Filter and paginate items (memoized to prevent lag on search input)
  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase();
    return sortedItems
      .filter(
        (item) =>
          (item.name || "").toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          (item.barcode || "").toLowerCase().includes(searchLower)
      )
      .slice(0, pageLimit === "all" ? undefined : parseInt(pageLimit));
  }, [sortedItems, search, pageLimit]);

  // Cache parsed barcode mappings to avoid repeated JSON.parse on each render
  const parsedMappingsCache = useMemo(() => {
    const cache = new Map<string, BarcodeMapping[]>();
    filteredItems.forEach(item => {
      if (item.barcodeMappings) {
        try {
          const mappings = JSON.parse(item.barcodeMappings);
          cache.set(item.id, mappings);
        } catch (e) {
          console.error(`Failed to parse barcodeMappings for item ${item.id}:`, e);
        }
      }
    });
    return cache;
  }, [filteredItems]);

  // Helper function to get condition (checks server-provided condition first, then ALL barcodes)
  const getConditionForItem = useCallback((item: InventoryItem, overrideBarcode?: string, overrideMappings?: BarcodeMapping[]): string | null => {
    // First priority: use server-provided condition (from barcode field LEFT JOIN match)
    if (item.condition) {
      return item.condition;
    }
    
    // Second priority: check ALL barcodes (simple + mappings) against testedItems
    let barcodesToCheck: string[] = [];
    
    // Add simple barcode (use override if provided, otherwise item's barcode)
    const barcode = overrideBarcode !== undefined ? overrideBarcode : item.barcode;
    if (barcode) {
      barcodesToCheck.push(barcode);
    }
    
    // Add barcodes from mappings (use override if provided, otherwise item's mappings, otherwise cache)
    const mappingsToUse = overrideMappings !== undefined 
      ? overrideMappings 
      : parsedMappingsCache.get(item.id);
    if (mappingsToUse) {
      const mappings: BarcodeMapping[] = Array.isArray(mappingsToUse) ? mappingsToUse : [];
      barcodesToCheck.push(...mappings.map(m => m.code));
    }
    
    // If no barcodes to check, return null
    if (barcodesToCheck.length === 0) return null;
    
    // Find tested item by any of the barcodes
    const testedItem = testedItems.find((tested) => {
      return barcodesToCheck.some(bc => tested.barcode === bc);
    });
    
    return testedItem?.condition || null;
  }, [parsedMappingsCache, testedItems]);

  // Group items by location (memoized)
  const groupedItems = useMemo(() => {
    return groupItemsByLocation(filteredItems);
  }, [filteredItems]);

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<InventoryItem> }) => {
      const response = await fetch(`/api/inventory/${data.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getAuthToken()}`,
        },
        body: JSON.stringify(data.updates),
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: async (updatedItem) => {
      // Force refetch to ensure data is updated
      await queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      await queryClient.refetchQueries({ queryKey: ['/api/inventory'] });
      
      setEditingRow(null);
      
      toast({
        title: "Обновлено",
        description: "Данные товара успешно обновлены",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/inventory/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${api.getAuthToken()}`,
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: "Удалено",
        description: "Товар успешно удален",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConditionMutation = useMutation({
    mutationFn: async (data: { id: string; condition: string }) => {
      const response = await fetch(`/api/inventory/${data.id}/condition`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getAuthToken()}`,
        },
        body: JSON.stringify({ condition: data.condition }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tested-items'] });
      await queryClient.refetchQueries({ queryKey: ['/api/inventory'] });
      await queryClient.refetchQueries({ queryKey: ['/api/tested-items'] });
      
      toast({
        title: "Обновлено",
        description: "Состояние товара успешно обновлено",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const startEdit = (item: InventoryItem) => {
    let barcodeMappings: BarcodeMapping[] = [];
    
    try {
      if (item.barcodeMappings) {
        barcodeMappings = JSON.parse(item.barcodeMappings);
      }
    } catch (e) {
      console.error("Failed to parse barcodeMappings:", e);
    }
    
    // Migrate old simple barcode to barcodeMappings format
    // Use qty=1 to allow adding additional barcodes
    if (barcodeMappings.length === 0 && item.barcode) {
      barcodeMappings = [{ code: item.barcode, qty: 1 }];
    }

    setEditingRow({
      id: item.id,
      name: item.name || "",
      sku: item.sku,
      quantity: item.quantity,
      barcode: item.barcode || "",
      barcodeMappings,
      condition: getConditionForItem(item) || "",
      price: item.price?.toString() || "",
      length: item.length?.toString() || "",
      width: item.width?.toString() || "",
      height: item.height?.toString() || "",
      weight: item.weight?.toString() || "",
    });
  };

  const handleConditionChange = (value: string) => {
    if (!editingRow) return;
    
    // Convert "-" to empty string
    const actualValue = value === "-" ? "" : value;
    
    if (actualValue === "Faulty") {
      setPendingCondition(actualValue);
      setShowFaultyDialog(true);
    } else {
      setEditingRow({ ...editingRow, condition: actualValue });
    }
  };

  const confirmFaultyCondition = () => {
    if (!editingRow) return;
    setEditingRow({ ...editingRow, condition: pendingCondition });
    setShowFaultyDialog(false);
    setPendingCondition("");
  };

  const cancelFaultyCondition = () => {
    setShowFaultyDialog(false);
    setPendingCondition("");
  };

  const cancelEdit = () => {
    setEditingRow(null);
  };

  const saveEdit = async () => {
    if (!editingRow) return;

    try {
      const length = editingRow.length ? parseInt(editingRow.length) : undefined;
      const width = editingRow.width ? parseInt(editingRow.width) : undefined;
      const height = editingRow.height ? parseInt(editingRow.height) : undefined;
      const volume = length && width && height ? length * width * height : undefined;

      const barcodeMappingsJson = editingRow.barcodeMappings.length > 0 
        ? JSON.stringify(editingRow.barcodeMappings)
        : undefined;

      // First update the basic inventory item data
      await updateMutation.mutateAsync({
        id: editingRow.id,
        updates: {
          name: editingRow.name || undefined,
          sku: editingRow.sku,
          quantity: editingRow.quantity,
          barcode: editingRow.barcode || undefined,
          barcodeMappings: barcodeMappingsJson,
          price: editingRow.price ? parseInt(editingRow.price) : undefined,
          length,
          width,
          height,
          volume,
          weight: editingRow.weight ? parseInt(editingRow.weight) : undefined,
        },
      });

      // Then update the condition if it was changed
      const originalItem = items.find(item => item.id === editingRow.id);
      const originalCondition = originalItem ? getConditionForItem(originalItem) || "" : "";
      
      if (editingRow.condition !== originalCondition) {
        await updateConditionMutation.mutateAsync({
          id: editingRow.id,
          condition: editingRow.condition,
        });
      }

      // Show success notification
      toast({
        title: "Изменения сохранены",
        description: "Данные товара успешно обновлены",
      });
    } catch (error) {
      console.error("Error saving edit:", error);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить изменения",
        variant: "destructive",
      });
    }
  };

  const deleteItem = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить этот товар?")) {
      deleteMutation.mutate(id);
    }
  };

  const renderRow = (item: InventoryItem, isExpanded: boolean = false) => {
    const isEditing = editingRow?.id === item.id;
    const volume = item.volume || (item.length && item.width && item.height ? item.length * item.width * item.height : undefined);
    
    // Extract barcodes for display
    let displayBarcodes: string = "-";
    if (item.barcodeMappings) {
      try {
        const mappings: BarcodeMapping[] = JSON.parse(item.barcodeMappings);
        if (mappings.length > 0) {
          displayBarcodes = mappings.map(m => `${m.code}(${m.qty})`).join(", ");
        }
      } catch (e) {
        // If parsing fails, fall back to simple barcode field
        displayBarcodes = item.barcode || "-";
      }
    } else if (item.barcode) {
      displayBarcodes = item.barcode;
    }

    if (isEditing && editingRow) {
      return (
        <TableRow key={item.id} className="bg-muted/50">
          <TableCell style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={saveEdit} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </TableCell>
          <TableCell style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px` }}>
            <Input
              value={editingRow.name}
              onChange={(e) => setEditingRow({...editingRow, name: e.target.value})}
              className="h-8 w-full text-xs"
              maxLength={82}
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.sku}px`, minWidth: `${columnWidths.sku}px` }}>
            <Input
              value={editingRow.sku}
              onChange={(e) => setEditingRow({...editingRow, sku: e.target.value.toUpperCase()})}
              className="h-8 w-full font-mono text-xs"
              maxLength={10}
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.quantity}px`, minWidth: `${columnWidths.quantity}px` }}>
            <Input
              type="number"
              value={editingRow.quantity}
              onChange={(e) => setEditingRow({...editingRow, quantity: parseInt(e.target.value) || 0})}
              className="h-8 w-full text-xs text-right"
              max={99999}
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.barcode}px`, minWidth: `${columnWidths.barcode}px` }}>
            <BarcodeEditor
              value={editingRow.barcodeMappings}
              onChange={(mappings) => setEditingRow({...editingRow, barcodeMappings: mappings})}
              totalQuantity={editingRow.quantity}
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.condition}px`, minWidth: `${columnWidths.condition}px` }} className="text-xs">
            <Select value={editingRow.condition || "-"} onValueChange={handleConditionChange}>
              <SelectTrigger 
                className={`h-9 md:h-8 w-full text-sm md:text-xs ${getConditionClasses(editingRow.condition)}`}
                data-testid={`select-condition-${item.id}`}
              >
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-" className="text-sm md:text-xs">-</SelectItem>
                <SelectItem value="New" className="text-sm md:text-xs">New</SelectItem>
                <SelectItem value="Used" className="text-sm md:text-xs">Used</SelectItem>
                <SelectItem value="Exdisplay" className="text-sm md:text-xs">Exdisplay</SelectItem>
                <SelectItem value="Parts" className="text-sm md:text-xs">Parts</SelectItem>
                <SelectItem value="Faulty" className="text-sm md:text-xs">Faulty</SelectItem>
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell style={{ width: `${columnWidths.price}px`, minWidth: `${columnWidths.price}px` }}>
            <Input
              type="number"
              value={editingRow.price}
              onChange={(e) => setEditingRow({...editingRow, price: e.target.value})}
              placeholder="Цена"
              className="h-8 w-full text-xs"
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.dimensions}px`, minWidth: `${columnWidths.dimensions}px` }}>
            <div className="flex gap-1">
              <Input
                type="number"
                value={editingRow.length}
                onChange={(e) => setEditingRow({...editingRow, length: e.target.value})}
                placeholder="Д"
                className="h-8 w-14 text-xs"
                max={999}
              />
              <Input
                type="number"
                value={editingRow.width}
                onChange={(e) => setEditingRow({...editingRow, width: e.target.value})}
                placeholder="Ш"
                className="h-8 w-14 text-xs"
                max={999}
              />
              <Input
                type="number"
                value={editingRow.height}
                onChange={(e) => setEditingRow({...editingRow, height: e.target.value})}
                placeholder="В"
                className="h-8 w-14 text-xs"
                max={999}
              />
            </div>
          </TableCell>
          <TableCell style={{ width: `${columnWidths.volume}px`, minWidth: `${columnWidths.volume}px` }} className="text-xs text-muted-foreground">
            {editingRow.length && editingRow.width && editingRow.height
              ? (parseInt(editingRow.length) * parseInt(editingRow.width) * parseInt(editingRow.height)).toLocaleString()
              : "-"}
          </TableCell>
          <TableCell style={{ width: `${columnWidths.weight}px`, minWidth: `${columnWidths.weight}px` }}>
            <Input
              type="number"
              value={editingRow.weight}
              onChange={(e) => setEditingRow({...editingRow, weight: e.target.value})}
              className="h-8 w-full text-xs"
              max={999}
            />
          </TableCell>
        </TableRow>
      );
    }

    // Collect image URLs from imageUrl1-24 fields
    const imageUrls = [
      item.imageUrl1, item.imageUrl2, item.imageUrl3, item.imageUrl4,
      item.imageUrl5, item.imageUrl6, item.imageUrl7, item.imageUrl8,
      item.imageUrl9, item.imageUrl10, item.imageUrl11, item.imageUrl12,
      item.imageUrl13, item.imageUrl14, item.imageUrl15, item.imageUrl16,
      item.imageUrl17, item.imageUrl18, item.imageUrl19, item.imageUrl20,
      item.imageUrl21, item.imageUrl22, item.imageUrl23, item.imageUrl24,
    ].filter((url): url is string => url !== null && url !== undefined && url.trim() !== '');
    const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

    return (
      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
        <TableCell style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => startEdit(item)} data-testid={`button-edit-${item.id}`}>
              <Pencil className="w-3 h-3" />
            </Button>
            {userRole === "admin" && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => deleteItem(item.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-${item.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </TableCell>
        <TableCell style={{ width: `${columnWidths.photo}px`, minWidth: `${columnWidths.photo}px` }} className="text-xs">
          {firstImageUrl ? (
            <button
              onClick={() => openImageGallery(imageUrls)}
              className="hover-elevate rounded overflow-hidden relative"
              data-testid={`button-open-gallery-${item.id}`}
            >
              <img 
                src={firstImageUrl} 
                alt={item.name || "Product"} 
                className="w-12 h-12 object-cover"
                data-testid={`image-thumbnail-${item.id}`}
              />
              {imageUrls.length > 1 && (
                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                  +{imageUrls.length - 1}
                </div>
              )}
            </button>
          ) : (
            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center" data-testid={`placeholder-image-${item.id}`}>
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </TableCell>
        <TableCell style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px` }} className="text-xs">
          <div className="flex items-center gap-1">
            <span>{item.name || "-"}</span>
            {item.ebayUrl && (
              <Button 
                size="icon" 
                variant="ghost"
                onClick={() => setSelectedUrl(item.ebayUrl || null)}
                data-testid={`button-open-url-${item.id}`}
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </div>
        </TableCell>
        <TableCell style={{ width: `${columnWidths.sku}px`, minWidth: `${columnWidths.sku}px` }} className="font-mono text-xs">{item.sku}</TableCell>
        <TableCell style={{ width: `${columnWidths.quantity}px`, minWidth: `${columnWidths.quantity}px` }} className="text-right text-xs font-medium">{item.quantity}</TableCell>
        <TableCell style={{ width: `${columnWidths.barcode}px`, minWidth: `${columnWidths.barcode}px` }} className="font-mono text-xs">{displayBarcodes}</TableCell>
        <TableCell style={{ width: `${columnWidths.condition}px`, minWidth: `${columnWidths.condition}px` }} className="text-xs">
          {(() => {
            const condition = getConditionForItem(item);
            return condition ? (
              <Badge variant="secondary" className={getConditionClasses(condition)} data-testid={`badge-condition-${item.id}`}>
                {condition}
              </Badge>
            ) : (
              <span className="text-muted-foreground" data-testid={`text-condition-${item.id}`}>-</span>
            );
          })()}
        </TableCell>
        <TableCell style={{ width: `${columnWidths.price}px`, minWidth: `${columnWidths.price}px` }} className="text-xs">{item.price || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.dimensions}px`, minWidth: `${columnWidths.dimensions}px` }} className="text-xs">
          {item.length || item.width || item.height ? (
            <span className="text-muted-foreground">
              {item.length || "-"}×{item.width || "-"}×{item.height || "-"}
            </span>
          ) : "-"}
        </TableCell>
        <TableCell style={{ width: `${columnWidths.volume}px`, minWidth: `${columnWidths.volume}px` }} className="text-xs text-muted-foreground">
          {volume ? volume.toLocaleString() : "-"}
        </TableCell>
        <TableCell style={{ width: `${columnWidths.weight}px`, minWidth: `${columnWidths.weight}px` }} className="text-xs">{item.weight || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.itemId}px`, minWidth: `${columnWidths.itemId}px` }} className="text-xs font-mono" data-testid={`text-itemid-${item.id}`}>{item.itemId || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.ebaySeller}px`, minWidth: `${columnWidths.ebaySeller}px` }} className="text-xs" data-testid={`text-ebayseller-${item.id}`}>{item.ebaySellerName || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.ebay}px`, minWidth: `${columnWidths.ebay}px` }} className="text-xs">
          {item.ebayUrl ? (
            <Button 
              size="sm" 
              variant="ghost" 
              asChild
              data-testid={`button-ebay-${item.id}`}
            >
              <a href={item.ebayUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          ) : (
            <span className="text-muted-foreground" data-testid={`text-no-ebay-${item.id}`}>-</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const handleRefreshInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    toast({
      title: "Обновлено",
      description: "Инвентарь обновлен",
    });
  };

  const openImageGallery = (imageUrls: string[]) => {
    setSelectedImageUrls(imageUrls);
    setImageModalOpen(true);
  };

  // Find duplicates query - enabled manually on button click
  const {
    data: duplicatesData,
    refetch: refetchDuplicates,
    isLoading: isLoadingDuplicates,
  } = useQuery<{ duplicates: any[] }>({
    queryKey: ['/api/inventory/duplicates'],
    enabled: false, // Don't auto-fetch, only on manual trigger
  });

  // Handle duplicates data changes
  useEffect(() => {
    if (duplicatesData) {
      setDuplicates(duplicatesData.duplicates || []);
      setDuplicatesDialogOpen(true);
      if (duplicatesData.duplicates.length === 0) {
        toast({
          title: "Дубликаты не найдены",
          description: "В инвентаре нет дубликатов",
        });
      }
    }
  }, [duplicatesData]);

  // Trigger function for button click
  const handleFindDuplicates = async () => {
    try {
      await refetchDuplicates();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить дубликаты",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDuplicates = async (itemIds: string[]) => {
    const results: { id: string; success: boolean; error?: string }[] = [];
    
    // Delete items sequentially to catch individual errors
    for (const itemId of itemIds) {
      try {
        await api.deleteInventoryItem(itemId);
        results.push({ id: itemId, success: true });
      } catch (error: any) {
        results.push({ 
          id: itemId, 
          success: false, 
          error: error.message || 'Ошибка удаления'
        });
      }
    }
    
    const failures = results.filter(r => !r.success);
    const successes = results.filter(r => r.success);
    
    // Invalidate caches if at least one deletion succeeded
    if (successes.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/duplicates'] });
    }
    
    // Handle different outcomes
    if (failures.length === 0) {
      // All succeeded - DuplicatesDialog will show success toast and close
      setDuplicates([]);
      return;
    } else if (successes.length === 0) {
      // All failed - throw error so DuplicatesDialog shows error toast
      throw new Error(`Не удалось удалить ни один из ${failures.length} товаров`);
    } else {
      // Partial success - show detailed toast and refetch to update dialog
      toast({
        title: "Частичное удаление",
        description: `Удалено ${successes.length} из ${results.length} товаров. ${failures.length} не удалось удалить.`,
        variant: "destructive",
      });
      // Refetch to show updated duplicate list (dialog stays open)
      await refetchDuplicates();
      // Throw error to prevent DuplicatesDialog from closing
      throw new Error("Частичное удаление");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <CardTitle>Инвентаризация</CardTitle>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              Всего товаров: {items.length}
            </div>
            {userRole === "admin" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFindDuplicates}
                  disabled={isLoadingDuplicates}
                  data-testid="button-find-duplicates"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {isLoadingDuplicates ? "Поиск..." : "Найти дубликаты"}
                </Button>
                <InventoryCsvImportDialog onSuccess={handleRefreshInventory} />
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, SKU или штрихкоду..."
              className="pl-10"
              data-testid="input-search-inventory"
            />
          </div>
          <Select value={pageLimit} onValueChange={setPageLimit}>
            <SelectTrigger data-testid="select-inventory-page-limit" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-12" style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}></TableHead>
                <ResizableHeader columnKey="photo" width={columnWidths.photo} onResize={handleResize} className="text-xs">
                  Фото
                </ResizableHeader>
                <ResizableHeader columnKey="name" width={columnWidths.name} onResize={handleResize} className="text-xs">
                  Название
                </ResizableHeader>
                <ResizableHeader columnKey="sku" width={columnWidths.sku} onResize={handleResize} className="text-xs">
                  SKU
                </ResizableHeader>
                <ResizableHeader columnKey="quantity" width={columnWidths.quantity} onResize={handleResize} className="text-right text-xs">
                  Кол-во
                </ResizableHeader>
                <ResizableHeader columnKey="barcode" width={columnWidths.barcode} onResize={handleResize} className="text-xs">
                  Штрихкод
                </ResizableHeader>
                <ResizableHeader columnKey="condition" width={columnWidths.condition} onResize={handleResize} className="text-xs">
                  Состояние
                </ResizableHeader>
                <ResizableHeader columnKey="price" width={columnWidths.price} onResize={handleResize} className="text-xs">
                  Цена
                </ResizableHeader>
                <ResizableHeader columnKey="dimensions" width={columnWidths.dimensions} onResize={handleResize} className="text-xs">
                  Размеры (см)
                </ResizableHeader>
                <ResizableHeader columnKey="volume" width={columnWidths.volume} onResize={handleResize} className="text-xs">
                  Объем
                </ResizableHeader>
                <ResizableHeader columnKey="weight" width={columnWidths.weight} onResize={handleResize} className="text-xs">
                  Вес (кг)
                </ResizableHeader>
                <ResizableHeader columnKey="itemId" width={columnWidths.itemId} onResize={handleResize} className="text-xs">
                  Item ID
                </ResizableHeader>
                <ResizableHeader columnKey="ebaySeller" width={columnWidths.ebaySeller} onResize={handleResize} className="text-xs">
                  eBay Seller
                </ResizableHeader>
                <ResizableHeader columnKey="ebay" width={columnWidths.ebay} onResize={handleResize} className="text-xs">
                  eBay
                </ResizableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(groupedItems.entries()).map(([groupKey, groupItems]) => {
                if (groupItems.length === 1) {
                  // Single item in location: render normally
                  return renderRow(groupItems[0]);
                } else {
                  // Multiple items in same location: use collapsible
                  const isExpanded = expandedGroups.has(groupKey);
                  const firstItem = groupItems[0];
                  const totalQuantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
                  const uniqueSkus = new Set(groupItems.map(item => item.sku)).size;
                  const totalBarcodes = groupItems.filter(item => item.barcode).length;
                  
                  return (
                    <Fragment key={`group-${groupKey}`}>
                      <TableRow 
                        className="cursor-pointer hover-elevate"
                        onClick={() => toggleGroup(groupKey)}
                        data-testid={`group-row-${groupKey}`}
                      >
                        <TableCell style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}>
                          <div className="flex gap-1">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px` }} className="text-xs text-muted-foreground">
                          {groupItems.length} позиций
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.sku}px`, minWidth: `${columnWidths.sku}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.quantity}px`, minWidth: `${columnWidths.quantity}px` }} className="text-right text-xs font-medium">{totalQuantity}</TableCell>
                        <TableCell style={{ width: `${columnWidths.barcode}px`, minWidth: `${columnWidths.barcode}px` }} className="text-xs text-muted-foreground">
                          {totalBarcodes} штрихкодов
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.condition}px`, minWidth: `${columnWidths.condition}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.price}px`, minWidth: `${columnWidths.price}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.dimensions}px`, minWidth: `${columnWidths.dimensions}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.volume}px`, minWidth: `${columnWidths.volume}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.weight}px`, minWidth: `${columnWidths.weight}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.itemId}px`, minWidth: `${columnWidths.itemId}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.ebaySeller}px`, minWidth: `${columnWidths.ebaySeller}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.ebay}px`, minWidth: `${columnWidths.ebay}px` }} className="text-xs text-muted-foreground">-</TableCell>
                      </TableRow>
                      {isExpanded && groupItems.map(item => renderRow(item, true))}
                    </Fragment>
                  );
                }
              })}
            </TableBody>
          </Table>
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Товары не найдены
          </div>
        )}
      </CardContent>

      <AlertDialog open={showFaultyDialog} onOpenChange={setShowFaultyDialog}>
        <AlertDialogContent data-testid="dialog-faulty-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Подтверждение установки состояния 'Faulty'</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите установить состояние 'Faulty' для этого товара?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelFaultyCondition} data-testid="button-cancel-faulty">
              Отменить
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmFaultyCondition} data-testid="button-confirm-faulty">
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Gallery Modal */}
      <ImageGalleryModal
        imageUrls={selectedImageUrls}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />

      {/* eBay URL Dialog */}
      <Dialog open={selectedUrl !== null} onOpenChange={(open) => !open && setSelectedUrl(null)}>
        <DialogContent data-testid="dialog-ebay-url">
          <DialogHeader>
            <DialogTitle>Ссылка на товар</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded text-sm break-all" data-testid="text-ebay-url">
              {selectedUrl}
            </div>
            <Button 
              onClick={() => window.open(selectedUrl!, '_blank', 'noopener,noreferrer')}
              data-testid="button-open-ebay-url"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Перейти по ссылке
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicates Management Dialog */}
      <DuplicatesDialog
        open={duplicatesDialogOpen}
        onClose={() => setDuplicatesDialogOpen(false)}
        duplicates={duplicates}
        onDelete={handleDeleteDuplicates}
      />
    </Card>
  );
}
