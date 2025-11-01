import { useState, useEffect } from "react";
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
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { CSVConflict } from "@shared/schema";

interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  conflicts: CSVConflict[];
  onResolve: (resolutions: Array<{ itemId: string; action: 'accept_csv' | 'keep_existing' }>) => Promise<void>;
}

export function ConflictResolutionDialog({
  open,
  onClose,
  conflicts,
  onResolve,
}: ConflictResolutionDialogProps) {
  // Track individual decisions: itemId -> 'accept_csv' | 'keep_existing' | undefined
  const [decisions, setDecisions] = useState<Record<string, 'accept_csv' | 'keep_existing'>>({});
  const [isResolving, setIsResolving] = useState(false);

  // Reset decisions when dialog opens or conflicts change
  useEffect(() => {
    if (open) {
      setDecisions({});
    }
  }, [open, conflicts]);

  const handleDecision = (itemId: string, action: 'accept_csv' | 'keep_existing') => {
    setDecisions(prev => ({
      ...prev,
      [itemId]: action,
    }));
  };

  const handleAcceptAll = () => {
    const allDecisions: Record<string, 'accept_csv' | 'keep_existing'> = {};
    conflicts.forEach(conflict => {
      allDecisions[conflict.itemId] = 'accept_csv';
    });
    setDecisions(allDecisions);
  };

  const handleKeepAll = () => {
    const allDecisions: Record<string, 'accept_csv' | 'keep_existing'> = {};
    conflicts.forEach(conflict => {
      allDecisions[conflict.itemId] = 'keep_existing';
    });
    setDecisions(allDecisions);
  };

  const handleSubmit = async () => {
    // Convert decisions to resolutions array
    const resolutions = Object.entries(decisions).map(([itemId, action]) => ({
      itemId,
      action,
    }));

    // For items without explicit decision, default to keep_existing
    conflicts.forEach(conflict => {
      if (!decisions[conflict.itemId]) {
        resolutions.push({
          itemId: conflict.itemId,
          action: 'keep_existing',
        });
      }
    });

    setIsResolving(true);
    try {
      await onResolve(resolutions);
      onClose();
    } catch (error) {
      console.error("Failed to resolve conflicts:", error);
    } finally {
      setIsResolving(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    return String(value);
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      name: 'Название',
      quantity: 'Количество',
      price: 'Цена',
      location: 'Локация',
      sku: 'SKU',
      length: 'Длина',
      width: 'Ширина',
      height: 'Высота',
      weight: 'Вес',
      condition: 'Состояние',
    };
    return labels[field] || field;
  };

  return (
    <Dialog open={open} onOpenChange={() => !isResolving && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh]" data-testid="dialog-conflict-resolution">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Обнаружены конфликты данных
          </DialogTitle>
          <DialogDescription>
            При загрузке CSV файла обнаружено {conflicts.length} товар(ов) с отличающимися данными.
            Выберите какие данные использовать для каждого товара. Обратите внимание: штрихкоды всегда сохраняются из существующих данных.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {conflicts.map((conflict, index) => {
              const decision = decisions[conflict.itemId];
              
              return (
                <div 
                  key={conflict.itemId} 
                  className="border rounded-lg p-4 space-y-3"
                  data-testid={`conflict-item-${conflict.itemId}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-base" data-testid={`text-conflict-name-${conflict.itemId}`}>
                        {conflict.name}
                      </h4>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          SKU: {conflict.sku}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Item ID: {conflict.itemId}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={decision === 'accept_csv' ? 'default' : 'outline'}
                        onClick={() => handleDecision(conflict.itemId, 'accept_csv')}
                        data-testid={`button-accept-csv-${conflict.itemId}`}
                        className="whitespace-nowrap"
                      >
                        {decision === 'accept_csv' && <CheckCircle className="h-4 w-4 mr-1" />}
                        Принять из файла
                      </Button>
                      <Button
                        size="sm"
                        variant={decision === 'keep_existing' ? 'default' : 'outline'}
                        onClick={() => handleDecision(conflict.itemId, 'keep_existing')}
                        data-testid={`button-keep-existing-${conflict.itemId}`}
                        className="whitespace-nowrap"
                      >
                        {decision === 'keep_existing' && <CheckCircle className="h-4 w-4 mr-1" />}
                        Оставить существующие
                      </Button>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Поле</TableHead>
                        <TableHead>Существующее значение</TableHead>
                        <TableHead>Значение из CSV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conflict.conflicts.map((fieldConflict) => (
                        <TableRow key={fieldConflict.field}>
                          <TableCell className="font-medium">
                            {getFieldLabel(fieldConflict.field)}
                          </TableCell>
                          <TableCell>
                            <span className={decision === 'keep_existing' ? 'font-semibold text-primary' : ''}>
                              {formatValue(fieldConflict.existingValue)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={decision === 'accept_csv' ? 'font-semibold text-primary' : ''}>
                              {formatValue(fieldConflict.csvValue)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {conflict.existingData.barcode && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      <AlertTriangle className="h-4 w-4" />
                      Штрихкод <Badge variant="outline" className="mx-1">{conflict.existingData.barcode}</Badge> будет сохранен
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <Button
              variant="outline"
              onClick={handleAcceptAll}
              disabled={isResolving}
              data-testid="button-accept-all"
              className="flex-1"
            >
              Принять все из файла
            </Button>
            <Button
              variant="outline"
              onClick={handleKeepAll}
              disabled={isResolving}
              data-testid="button-keep-all"
              className="flex-1"
            >
              Оставить все существующие
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isResolving}
              data-testid="button-cancel"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isResolving}
              data-testid="button-apply"
            >
              {isResolving ? 'Применение...' : 'Применить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
