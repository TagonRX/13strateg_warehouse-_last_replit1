import { useState, useEffect } from "react";
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

interface InventoryItem {
  id: string;
  productId: string | null;
  name: string | null;
  sku: string;
  location: string;
  quantity: number;
  barcode?: string;
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
  length: string;
  width: string;
  height: string;
  weight: string;
}

// Group items by location
function groupItemsByLocation(items: InventoryItem[]): Map<string, InventoryItem[]> {
  const groups = new Map<string, InventoryItem[]>();
  
  items.forEach(item => {
    const existing = groups.get(item.location) || [];
    groups.set(item.location, [...existing, item]);
  });
  
  return groups;
}

export default function InventoryTable({ items, userRole }: InventoryTableProps) {
  const [search, setSearch] = useState("");
  const [pageLimit, setPageLimit] = useState<string>("50");
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const { toast } = useToast();

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

  const toggleLocation = (location: string) => {
    const newExpanded = new Set(expandedLocations);
    if (newExpanded.has(location)) {
      newExpanded.delete(location);
    } else {
      newExpanded.add(location);
    }
    setExpandedLocations(newExpanded);
  };

  const startEdit = (item: InventoryItem) => {
    setEditingRow({
      id: item.id,
      productId: item.productId || "",
      name: item.name || "",
      sku: item.sku,
      location: item.location,
      quantity: item.quantity,
      barcode: item.barcode || "",
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

    updateMutation.mutate({
      id: editingRow.id,
      updates: {
        productId: editingRow.productId || undefined,
        name: editingRow.name || undefined,
        sku: editingRow.sku,
        location: editingRow.location,
        quantity: editingRow.quantity,
        barcode: editingRow.barcode || undefined,
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
          <TableCell className="w-12">
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={saveEdit} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </TableCell>
          <TableCell>
            <Input
              value={editingRow.location}
              onChange={(e) => setEditingRow({...editingRow, location: e.target.value.toUpperCase()})}
              className="h-8 w-20 font-mono text-xs"
              maxLength={5}
            />
          </TableCell>
          <TableCell>
            <Input
              value={editingRow.productId}
              onChange={(e) => setEditingRow({...editingRow, productId: e.target.value})}
              className="h-8 w-32 font-mono text-xs"
              maxLength={14}
            />
          </TableCell>
          <TableCell>
            <Input
              value={editingRow.name}
              onChange={(e) => setEditingRow({...editingRow, name: e.target.value})}
              className="h-8 text-xs"
              maxLength={82}
            />
          </TableCell>
          <TableCell>
            <Input
              value={editingRow.sku}
              onChange={(e) => setEditingRow({...editingRow, sku: e.target.value.toUpperCase()})}
              className="h-8 w-24 font-mono text-xs"
              maxLength={10}
            />
          </TableCell>
          <TableCell>
            <Input
              type="number"
              value={editingRow.quantity}
              onChange={(e) => setEditingRow({...editingRow, quantity: parseInt(e.target.value) || 0})}
              className="h-8 w-20 text-xs text-right"
              max={99999}
            />
          </TableCell>
          <TableCell>
            <Input
              value={editingRow.barcode}
              onChange={(e) => setEditingRow({...editingRow, barcode: e.target.value})}
              className="h-8 font-mono text-xs"
            />
          </TableCell>
          <TableCell>
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
          <TableCell className="text-xs text-muted-foreground">
            {editingRow.length && editingRow.width && editingRow.height
              ? (parseInt(editingRow.length) * parseInt(editingRow.width) * parseInt(editingRow.height)).toLocaleString()
              : "-"}
          </TableCell>
          <TableCell>
            <Input
              type="number"
              value={editingRow.weight}
              onChange={(e) => setEditingRow({...editingRow, weight: e.target.value})}
              className="h-8 w-16 text-xs"
              max={999}
            />
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
        <TableCell className="w-12">
          {!isExpanded && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                <Pencil className="w-3 h-3" />
              </Button>
              {userRole === "admin" && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => deleteItem(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{item.location}</TableCell>
        <TableCell className="font-mono text-xs">{item.productId || "-"}</TableCell>
        <TableCell className="text-xs">{item.name || "-"}</TableCell>
        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
        <TableCell className="text-right text-xs font-medium">{item.quantity}</TableCell>
        <TableCell className="font-mono text-xs">{item.barcode || "-"}</TableCell>
        <TableCell className="text-xs">
          {item.length || item.width || item.height ? (
            <span className="text-muted-foreground">
              {item.length || "-"}×{item.width || "-"}×{item.height || "-"}
            </span>
          ) : "-"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {volume ? volume.toLocaleString() : "-"}
        </TableCell>
        <TableCell className="text-xs">{item.weight || "-"}</TableCell>
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
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-xs">Локация</TableHead>
                <TableHead className="text-xs">ID товара</TableHead>
                <TableHead className="text-xs">Название</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-right text-xs">Кол-во</TableHead>
                <TableHead className="text-xs">Штрихкод</TableHead>
                <TableHead className="text-xs">Размеры (см)</TableHead>
                <TableHead className="text-xs">Объем</TableHead>
                <TableHead className="text-xs">Вес (кг)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(groupedItems.entries()).map(([location, locationItems]) => {
                if (locationItems.length === 1) {
                  // Single item: render normally
                  return renderRow(locationItems[0]);
                } else {
                  // Multiple items: use collapsible
                  const isExpanded = expandedLocations.has(location);
                  const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);
                  
                  return (
                    <>
                      <TableRow 
                        key={`group-${location}`} 
                        className="cursor-pointer hover-elevate"
                        onClick={() => toggleLocation(location)}
                      >
                        <TableCell>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold">{location}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" colSpan={3}>
                          {locationItems.length} штрихкодов
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">{totalQuantity}</TableCell>
                        <TableCell colSpan={4}></TableCell>
                      </TableRow>
                      {isExpanded && locationItems.map(item => renderRow(item, true))}
                    </>
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
