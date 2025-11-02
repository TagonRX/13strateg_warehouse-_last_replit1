import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InventoryItem {
  id: string;
  name: string | null;
  sku: string;
  location: string;
  quantity: number;
  barcode?: string;
  itemId?: string | null;
}

interface DuplicateGroup {
  type: 'itemId' | 'sku';
  key: string;
  items: InventoryItem[];
}

interface DuplicatesDialogProps {
  open: boolean;
  onClose: () => void;
  duplicates: DuplicateGroup[];
  onDelete: (itemIds: string[]) => Promise<void>;
}

export function DuplicatesDialog({
  open,
  onClose,
  duplicates,
  onDelete,
}: DuplicatesDialogProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (group: DuplicateGroup, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    group.items.forEach(item => {
      if (checked) {
        newSelected.add(item.id);
      } else {
        newSelected.delete(item.id);
      }
    });
    setSelectedItems(newSelected);
  };

  const handleDelete = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите товары для удаления",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(Array.from(selectedItems));
      setSelectedItems(new Set());
      toast({
        title: "Дубликаты удалены",
        description: `Удалено ${selectedItems.size} товар(ов)`,
      });
      onClose();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !isDeleting && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh]" data-testid="dialog-duplicates">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Найдены дубликаты
          </DialogTitle>
          <DialogDescription>
            Обнаружено {duplicates.length} групп(ы) дубликатов. Выберите записи для удаления.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {duplicates.map((group, groupIndex) => {
              const allSelected = group.items.every(item => selectedItems.has(item.id));
              const someSelected = group.items.some(item => selectedItems.has(item.id));
              
              return (
                <div 
                  key={`${group.type}-${group.key}`}
                  className="border rounded-lg p-4 space-y-3"
                  data-testid={`duplicate-group-${groupIndex}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => handleSelectAll(group, checked as boolean)}
                        data-testid={`checkbox-select-all-${groupIndex}`}
                      />
                      <div>
                        <h4 className="font-medium text-base">
                          {group.type === 'itemId' ? 'Дубликат Item ID' : 'Дубликат SKU'}
                        </h4>
                        <Badge variant="outline" className="text-xs mt-1">
                          {group.type === 'itemId' ? `Item ID: ${group.key}` : `SKU: ${group.key}`}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="destructive">
                      {group.items.length} записей
                    </Badge>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Название</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Item ID</TableHead>
                        <TableHead>Локация</TableHead>
                        <TableHead>Количество</TableHead>
                        <TableHead>Баркод</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedItems.has(item.id)}
                              onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </TableCell>
                          <TableCell>{item.name || '—'}</TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.itemId || '—'}</TableCell>
                          <TableCell>{item.location}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell className="font-mono text-sm">{item.barcode || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}

            {duplicates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Дубликатов не найдено
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Выбрано: {selectedItems.size} товар(ов)
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isDeleting}
                data-testid="button-cancel"
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || selectedItems.size === 0}
                data-testid="button-delete-selected"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить выбранные ({selectedItems.size})
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
