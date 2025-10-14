import { useState, useEffect, Fragment } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronDown, ChevronRight, Pencil, Save, X, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import BarcodeEditor from "./BarcodeEditor";

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
  length?: number;
  width?: number;
  height?: number;
  volume?: number;
  weight?: number;
}

interface InventoryTableProps {
  items: InventoryItem[];
  userRole?: string;
}

interface EditingRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  barcode: string;
  barcodeMappings: BarcodeMapping[];
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
  const { toast } = useToast();

  // Default column widths
  const defaultWidths = {
    actions: 48,
    location: 100,
    productId: 140,
    name: 200,
    sku: 120,
    quantity: 100,
    barcode: 150,
    dimensions: 180,
    volume: 100,
    weight: 100,
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

  const filteredItems = items
    .filter(
      (item) =>
        (item.productId || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.name || "").toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.location.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, pageLimit === "all" ? undefined : parseInt(pageLimit));

  const groupedItems = groupItemsByLocation(filteredItems);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
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

    setEditingRow({
      id: item.id,
      productId: item.productId || "",
      name: item.name || "",
      sku: item.sku,
      location: item.location,
      quantity: item.quantity,
      barcode: item.barcode || "",
      barcodeMappings,
      length: item.length?.toString() || "",
      width: item.width?.toString() || "",
      height: item.height?.toString() || "",
      weight: item.weight?.toString() || "",
    });
  };

  const cancelEdit = () => {
    setEditingRow(null);
  };

  const saveEdit = () => {
    if (!editingRow) return;

    const length = editingRow.length ? parseInt(editingRow.length) : undefined;
    const width = editingRow.width ? parseInt(editingRow.width) : undefined;
    const height = editingRow.height ? parseInt(editingRow.height) : undefined;
    const volume = length && width && height ? length * width * height : undefined;

    const barcodeMappingsJson = editingRow.barcodeMappings.length > 0 
      ? JSON.stringify(editingRow.barcodeMappings)
      : undefined;

    updateMutation.mutate({
      id: editingRow.id,
      updates: {
        productId: editingRow.productId || undefined,
        name: editingRow.name || undefined,
        sku: editingRow.sku,
        location: editingRow.location,
        quantity: editingRow.quantity,
        barcode: editingRow.barcode || undefined,
        barcodeMappings: barcodeMappingsJson,
        length,
        width,
        height,
        volume,
        weight: editingRow.weight ? parseInt(editingRow.weight) : undefined,
      },
    });
  };

  const deleteItem = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить этот товар?")) {
      deleteMutation.mutate(id);
    }
  };

  const renderRow = (item: InventoryItem, isExpanded: boolean = false) => {
    const isEditing = editingRow?.id === item.id;
    const volume = item.volume || (item.length && item.width && item.height ? item.length * item.width * item.height : undefined);

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
          <TableCell style={{ width: `${columnWidths.location}px`, minWidth: `${columnWidths.location}px` }}>
            <Input
              value={editingRow.location}
              onChange={(e) => setEditingRow({...editingRow, location: e.target.value.toUpperCase()})}
              className="h-8 w-full font-mono text-xs"
              maxLength={5}
            />
          </TableCell>
          <TableCell style={{ width: `${columnWidths.productId}px`, minWidth: `${columnWidths.productId}px` }}>
            <Input
              value={editingRow.productId}
              onChange={(e) => setEditingRow({...editingRow, productId: e.target.value})}
              className="h-8 w-full font-mono text-xs"
              maxLength={14}
            />
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
        <TableCell style={{ width: `${columnWidths.location}px`, minWidth: `${columnWidths.location}px` }} className="font-mono text-xs">{isExpanded ? "" : item.location}</TableCell>
        <TableCell style={{ width: `${columnWidths.productId}px`, minWidth: `${columnWidths.productId}px` }} className="font-mono text-xs">{item.productId || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px` }} className="text-xs">{item.name || "-"}</TableCell>
        <TableCell style={{ width: `${columnWidths.sku}px`, minWidth: `${columnWidths.sku}px` }} className="font-mono text-xs">{item.sku}</TableCell>
        <TableCell style={{ width: `${columnWidths.quantity}px`, minWidth: `${columnWidths.quantity}px` }} className="text-right text-xs font-medium">{item.quantity}</TableCell>
        <TableCell style={{ width: `${columnWidths.barcode}px`, minWidth: `${columnWidths.barcode}px` }} className="font-mono text-xs">{item.barcode || "-"}</TableCell>
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
      </TableRow>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <CardTitle>Инвентаризация</CardTitle>
          <div className="text-sm text-muted-foreground">
            Всего товаров: {items.length}
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
              placeholder="Поиск по ID, названию, SKU или локации..."
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
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}></TableHead>
                <ResizableHeader columnKey="location" width={columnWidths.location} onResize={handleResize} className="text-xs">
                  Локация
                </ResizableHeader>
                <ResizableHeader columnKey="productId" width={columnWidths.productId} onResize={handleResize} className="text-xs">
                  ID товара
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
                <ResizableHeader columnKey="dimensions" width={columnWidths.dimensions} onResize={handleResize} className="text-xs">
                  Размеры (см)
                </ResizableHeader>
                <ResizableHeader columnKey="volume" width={columnWidths.volume} onResize={handleResize} className="text-xs">
                  Объем
                </ResizableHeader>
                <ResizableHeader columnKey="weight" width={columnWidths.weight} onResize={handleResize} className="text-xs">
                  Вес (кг)
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
                        <TableCell style={{ width: `${columnWidths.location}px`, minWidth: `${columnWidths.location}px` }} className="font-mono text-xs font-bold">{firstItem.location}</TableCell>
                        <TableCell style={{ width: `${columnWidths.productId}px`, minWidth: `${columnWidths.productId}px` }} className="text-xs text-muted-foreground">
                          {groupItems.length} позиций
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px` }} className="text-xs text-muted-foreground">
                          {uniqueSkus} SKU
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.sku}px`, minWidth: `${columnWidths.sku}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.quantity}px`, minWidth: `${columnWidths.quantity}px` }} className="text-right text-xs font-medium">{totalQuantity}</TableCell>
                        <TableCell style={{ width: `${columnWidths.barcode}px`, minWidth: `${columnWidths.barcode}px` }} className="text-xs text-muted-foreground">
                          {totalBarcodes} штрихкодов
                        </TableCell>
                        <TableCell style={{ width: `${columnWidths.dimensions}px`, minWidth: `${columnWidths.dimensions}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.volume}px`, minWidth: `${columnWidths.volume}px` }} className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell style={{ width: `${columnWidths.weight}px`, minWidth: `${columnWidths.weight}px` }} className="text-xs text-muted-foreground">-</TableCell>
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
    </Card>
  );
}
