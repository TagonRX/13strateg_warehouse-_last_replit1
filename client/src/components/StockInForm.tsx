import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Package, Trash2, Edit, Usb, Smartphone, Wifi, AlertTriangle } from "lucide-react";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import type { PendingPlacement } from "@shared/schema";

interface StockInFormProps {
  onSubmit: (data: {
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode: string;
  }) => void;
  onSkuChange?: (sku: string) => void;
  externalSku?: string;
  externalLocation?: string;
}

type ScannerMode = "usb" | "phone";

export default function StockInForm({ onSubmit, onSkuChange, externalSku, externalLocation }: StockInFormProps) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");
  const [condition, setCondition] = useState<string>("");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("usb");
  
  // Bulk mode states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  
  // Condition check states
  const [showFaultyWarning, setShowFaultyWarning] = useState(false);
  const [showConditionChangeDialog, setShowConditionChangeDialog] = useState(false);
  const [detectedCondition, setDetectedCondition] = useState<string>("");
  
  // SKU format validation dialog
  const [showSkuFormatError, setShowSkuFormatError] = useState(false);
  
  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [placementToDelete, setPlacementToDelete] = useState<PendingPlacement | null>(null);
  
  // Edit barcode states
  const [editBarcodeDialogOpen, setEditBarcodeDialogOpen] = useState(false);
  const [placementToEdit, setPlacementToEdit] = useState<PendingPlacement | null>(null);
  const [newBarcode, setNewBarcode] = useState("");
  
  const { toast } = useToast();

  // WebSocket for phone mode
  const { isConnected: isPhoneConnected, lastMessage } = useWebSocket();

  // Update SKU and Location when external props change (from location click)
  useEffect(() => {
    if (externalSku) {
      setSku(externalSku);
    }
  }, [externalSku]);

  useEffect(() => {
    if (externalLocation) {
      setLocation(externalLocation);
    }
  }, [externalLocation]);

  // Fetch current user
  const { data: user } = useQuery<{ id: string; name: string; login: string; role: string }>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch pending placements
  const { data: pendingPlacements = [], isLoading: loadingPlacements } = useQuery<PendingPlacement[]>({
    queryKey: ["/api/pending-placements"],
  });

  // Query archived items based on current SKU
  const { data: archivedItems = [], isLoading: loadingArchived } = useQuery<any[]>({
    queryKey: ["/api/archived-items", { sku }],
    enabled: sku.length >= 3,
  });

  // Restore archived item mutation
  const restoreArchivedMutation = useMutation({
    mutationFn: async (archivedItemId: string) => {
      const response = await apiRequest("POST", `/api/archived-items/${archivedItemId}/restore`, {
        userId: user?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/archived-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Восстановлено",
        description: "Товар успешно восстановлен из архива",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось восстановить товар",
        variant: "destructive",
      });
    },
  });

  // Delete pending placement mutation
  const deletePlacementMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/pending-placements/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-placements"] });
      toast({
        title: "Удалено",
        description: "Pending placement успешно удалён",
      });
      setDeleteConfirmOpen(false);
      setPlacementToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить pending placement",
        variant: "destructive",
      });
    },
  });

  // Update barcode mutation
  const updateBarcodeMutation = useMutation({
    mutationFn: async ({ id, barcode }: { id: string; barcode: string }) => {
      const response = await apiRequest("PATCH", `/api/pending-placements/${id}/barcode`, { barcode });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-placements"] });
      toast({
        title: "Обновлено",
        description: "Баркод успешно изменён",
      });
      setEditBarcodeDialogOpen(false);
      setPlacementToEdit(null);
      setNewBarcode("");
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось изменить баркод",
        variant: "destructive",
      });
    },
  });

  // Строгая маршрутизация: данные со сканера ТОЛЬКО в barcode поле
  // В USB режиме работает глобальная маршрутизация
  const { inputRef: barcodeInputRef } = useGlobalBarcodeInput(!isBulkMode && scannerMode === "usb");
  const { inputRef: bulkBarcodeInputRef } = useGlobalBarcodeInput(isBulkMode && scannerMode === "usb");

  // Обработка сообщений от телефона
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned" && scannerMode === "phone") {
      const code = lastMessage.barcode;
      const qty = lastMessage.quantity || 1;
      
      if (isBulkMode) {
        // Добавляем все штрихкоды в список
        const codes = Array(qty).fill(code);
        setScannedBarcodes(prev => [...prev, ...codes]);
      } else {
        // Обычный режим - заполняем поля
        setBarcode(code);
        setQuantity(qty);
      }
    }
  }, [lastMessage, scannerMode, isBulkMode]);

  // Автоматическое извлечение локации из SKU (первые 4 символа до "-")
  useEffect(() => {
    if (sku) {
      // Унифицированная логика извлечения: до 4 символов до "-" или до конца строки
      const dashIndex = sku.indexOf("-");
      const end = dashIndex >= 0 ? Math.min(4, dashIndex) : Math.min(4, sku.length);
      const extracted = sku.substring(0, end);
      setLocation(extracted);
    } else {
      setLocation("");
    }
  }, [sku]);

  // Автоподтягивание состояния при сканировании баркода (обычный режим)
  useEffect(() => {
    if (!barcode || isBulkMode) return;
    
    // Запомнить текущий баркод для предотвращения race condition
    const currentBarcode = barcode;
    
    const fetchCondition = async () => {
      try {
        const response = await fetch(`/api/inventory/barcode/${encodeURIComponent(currentBarcode)}/condition`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          // Проверить что ответ соответствует текущему баркоду (предотвращает race condition)
          if (currentBarcode === barcode && data.condition) {
            setDetectedCondition(data.condition);
            
            // Проверка на Faulty - блокировать добавление
            if (data.condition === "Faulty") {
              setShowFaultyWarning(true);
              setCondition("");
              return;
            }
            
            // Если товар с хорошим состоянием - предложить изменить
            if (data.condition === "New" || data.condition === "Used" || 
                data.condition === "Exdisplay" || data.condition === "Parts") {
              setShowConditionChangeDialog(true);
              setCondition(data.condition);
            } else {
              setCondition(data.condition);
            }
          } else if (currentBarcode === barcode) {
            setCondition("");
            setDetectedCondition("");
          }
        }
      } catch (error) {
        console.error("Error fetching condition:", error);
      }
    };
    
    fetchCondition();
  }, [barcode, isBulkMode]);

  // Автоподтягивание состояния для первого баркода в bulk режиме
  useEffect(() => {
    if (!isBulkMode || scannedBarcodes.length === 0) return;
    
    const firstBarcode = scannedBarcodes[0];
    
    const fetchCondition = async () => {
      try {
        const response = await fetch(`/api/inventory/barcode/${encodeURIComponent(firstBarcode)}/condition`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          // Проверить что первый баркод не изменился
          if (scannedBarcodes.length > 0 && scannedBarcodes[0] === firstBarcode && data.condition) {
            setDetectedCondition(data.condition);
            
            // Проверка на Faulty - очистить и предупредить
            if (data.condition === "Faulty") {
              setShowFaultyWarning(true);
              setScannedBarcodes([]);
              setCondition("");
              return;
            }
            
            // Если товар с хорошим состоянием - предложить изменить
            if (data.condition === "New" || data.condition === "Used" || 
                data.condition === "Exdisplay" || data.condition === "Parts") {
              setShowConditionChangeDialog(true);
              setCondition(data.condition);
            } else {
              setCondition(data.condition);
            }
          } else if (scannedBarcodes.length > 0 && scannedBarcodes[0] === firstBarcode) {
            setCondition("");
            setDetectedCondition("");
          }
        }
      } catch (error) {
        console.error("Error fetching condition:", error);
      }
    };
    
    // Подтянуть condition только для первого отсканированного баркода
    if (scannedBarcodes.length === 1) {
      fetchCondition();
    }
  }, [scannedBarcodes, isBulkMode]);

  const handleRemoveBarcode = (index: number) => {
    setScannedBarcodes(scannedBarcodes.filter((_, i) => i !== index));
  };

  const handleToggleBulkMode = () => {
    if (isBulkMode) {
      // Выходим из режима массового добавления
      setScannedBarcodes([]);
    }
    setIsBulkMode(!isBulkMode);
  };

  const handleBulkBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const scannedCode = e.currentTarget.value.trim();
      setScannedBarcodes(prev => [...prev, scannedCode]);
      e.currentTarget.value = ''; // Очистка после добавления
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBulkMode) {
      // Массовый режим требует баркоды
      if (!sku || !location || scannedBarcodes.length === 0) {
        toast({
          title: "Ошибка",
          description: "Заполните все обязательные поля",
          variant: "destructive",
        });
        return;
      }
      
      // Валидация формата SKU: должен заканчиваться на "-БУКВА" (например A11-RS-N)
      const skuFormatRegex = /^.+-[A-ZА-Я]$/;
      if (!skuFormatRegex.test(sku)) {
        setShowSkuFormatError(true);
        return;
      }
      
      // Вызываем onSubmit для каждого баркода отдельно
      // Это создаст отдельный pending placement для каждого уникального баркода
      scannedBarcodes.forEach(barcode => {
        onSubmit({
          productId: productId || undefined,
          name: name || undefined,
          sku,
          location,
          quantity: 1, // Каждый товар создается отдельно
          barcode: barcode,
        });
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setScannedBarcodes([]);
      setCondition("");
    } else {
      // Обычный режим требует баркод
      if (!sku || !barcode) {
        toast({
          title: "Ошибка",
          description: "Требуется SKU и штрихкод товара",
          variant: "destructive",
        });
        return;
      }
      
      // Валидация формата SKU: должен заканчиваться на "-БУКВА" (например A11-RS-N)
      const skuFormatRegex = /^.+-[A-ZА-Я]$/;
      if (!skuFormatRegex.test(sku)) {
        setShowSkuFormatError(true);
        return;
      }
      
      onSubmit({
        productId: productId || undefined,
        name: name || undefined,
        sku,
        location,
        quantity,
        barcode,
      });
      
      // Очистка формы
      setProductId("");
      setName("");
      setSku("");
      setLocation("");
      setQuantity(1);
      setBarcode("");
      setCondition("");
    }
  };

  // Обработчики диалогов
  const handleFaultyClose = () => {
    setShowFaultyWarning(false);
    setBarcode("");
    setDetectedCondition("");
  };

  const handleConditionKeep = () => {
    // Оставить текущее состояние и продолжить
    setShowConditionChangeDialog(false);
  };

  const handleConditionChange = async (newCondition: string) => {
    // Изменить состояние и записать в лог
    setCondition(newCondition);
    setShowConditionChangeDialog(false);
    
    // Логировать изменение состояния (критическое событие)
    try {
      const token = localStorage.getItem('auth_token');
      await fetch("/api/event-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "CONDITION_OVERRIDE",
          details: `Работник изменил состояние товара с "${detectedCondition}" на "${newCondition}" (баркод: ${barcode})`,
          productId: productId || undefined,
          isWarning: true, // Критическое событие - подсветка красным
        }),
      });
    } catch (error) {
      console.error("Failed to log condition change:", error);
    }
    
    toast({
      title: "Состояние изменено",
      description: `Состояние изменено с "${detectedCondition}" на "${newCondition}"`,
      variant: "default",
    });
  };

  const handleDeleteClick = (placement: PendingPlacement) => {
    setPlacementToDelete(placement);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (placementToDelete) {
      deletePlacementMutation.mutate(placementToDelete.id);
    }
  };

  const handleEditBarcodeClick = (placement: PendingPlacement) => {
    setPlacementToEdit(placement);
    setNewBarcode(placement.barcode);
    setEditBarcodeDialogOpen(true);
  };

  const handleEditBarcodeConfirm = () => {
    if (placementToEdit && newBarcode.trim()) {
      updateBarcodeMutation.mutate({ id: placementToEdit.id, barcode: newBarcode.trim() });
    }
  };

  return (
    <>
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Информация о товаре</CardTitle>
          <Button 
            variant={isBulkMode ? "default" : "outline"} 
            onClick={handleToggleBulkMode}
            data-testid="button-toggle-bulk-mode"
          >
            <Package className="w-4 h-4 mr-2" />
            {isBulkMode ? "Обычный режим" : "Массовое добавление"}
          </Button>
        </div>
        
        {/* Scanner Mode Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Сканер:</span>
          <Button
            size="sm"
            variant={scannerMode === "usb" ? "default" : "outline"}
            onClick={() => setScannerMode("usb")}
            data-testid="button-scanner-usb"
            className="h-8"
          >
            <Usb className="w-3.5 h-3.5 mr-1.5" />
            USB
          </Button>
          <Button
            size="sm"
            variant={scannerMode === "phone" ? "default" : "outline"}
            onClick={() => setScannerMode("phone")}
            data-testid="button-scanner-phone"
            className="h-8"
          >
            <Smartphone className="w-3.5 h-3.5 mr-1.5" />
            Телефон
          </Button>
          
          {/* Phone Connection Indicator */}
          {scannerMode === "phone" && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md bg-muted/50">
              <Wifi className={`w-3.5 h-3.5 ${isPhoneConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
              <span className={`text-xs font-medium ${isPhoneConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isPhoneConnected ? "Подключен" : "Ожидание..."}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Первая строка: ID товара, Название (компактно) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="productId" className="text-xs">ID товара</Label>
              <Input
                id="productId"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="ID"
                data-testid="input-product-id"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">Название товара</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                data-testid="input-name"
                className="h-8 text-sm"
              />
            </div>
          </div>
          
          {/* Вторая строка: SKU, Локация, Кол-во */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="sku" className="text-xs">SKU * (локация-буква)</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => {
                  const newSku = e.target.value.toUpperCase();
                  setSku(newSku);
                  onSkuChange?.(newSku);
                }}
                placeholder="A101-J"
                required
                data-testid="input-sku"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location" className="text-xs">Локация</Label>
              <Input
                id="location"
                value={location}
                placeholder="A101"
                disabled
                className="bg-muted text-muted-foreground h-8 text-sm"
                data-testid="input-location"
              />
            </div>
            {!isBulkMode && (
              <div className="space-y-1">
                <Label htmlFor="quantity" className="text-xs">Кол-во *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value))}
                  required
                  data-testid="input-quantity"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
          
          {/* Третья строка: Штрихкод + Состояние + Кнопка */}
          <div className="grid grid-cols-4 gap-3 items-end">
            {isBulkMode ? (
              <>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Штрихкод (сканируйте)</Label>
                  <Input
                    ref={scannerMode === "usb" ? bulkBarcodeInputRef : undefined}
                    placeholder={scannerMode === "usb" ? "Скан + Enter" : "Скан с телефона"}
                    className="font-mono h-8 text-sm"
                    onKeyDown={scannerMode === "usb" ? handleBulkBarcodeInput : undefined}
                    readOnly={scannerMode === "phone"}
                    data-testid="input-bulk-barcode"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Кол-во</Label>
                  <Input
                    value={scannedBarcodes.length}
                    readOnly
                    className="font-bold h-8 text-sm"
                    data-testid="input-bulk-quantity"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1 col-span-2">
                <Label htmlFor="barcode" className="text-xs">Штрихкод</Label>
                <Input
                  id="barcode"
                  ref={scannerMode === "usb" ? barcodeInputRef : undefined}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={scannerMode === "usb" ? "Введите или отсканируйте" : "Скан с телефона"}
                  className="font-mono h-8 text-sm"
                  readOnly={scannerMode === "phone"}
                  data-testid="input-barcode"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="condition" className="text-xs">Состояние</Label>
              <Select value={condition || "-"} onValueChange={(val) => setCondition(val === "-" ? "" : val)}>
                <SelectTrigger id="condition" data-testid="select-condition" className="h-8 text-sm">
                  <SelectValue placeholder="Не указано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">Не указано</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Used">Used</SelectItem>
                  <SelectItem value="Exdisplay">Exdisplay</SelectItem>
                  <SelectItem value="Parts">Parts</SelectItem>
                  <SelectItem value="Faulty">Faulty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              type="submit" 
              data-testid="button-submit"
              disabled={isBulkMode && scannedBarcodes.length === 0}
              className="h-8"
            >
              {isBulkMode ? `Добавить (${scannedBarcodes.length})` : "Добавить"}
            </Button>
          </div>
        </form>

        {isBulkMode && scannedBarcodes.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Отсканированные штрихкоды ({scannedBarcodes.length})</h3>
            <div className="max-h-48 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Штрихкод</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scannedBarcodes.map((code, index) => (
                    <TableRow key={index} data-testid={`barcode-row-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono">{code}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveBarcode(index)}
                          data-testid={`button-remove-barcode-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Archived Items Card */}
    {archivedItems.length > 0 && (
      <Card className="mt-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            Найдены архивные товары
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Для SKU "{sku}" найдены товары в архиве. Вы можете восстановить их вместо создания новых записей.
          </p>
          <div className="space-y-2">
            {archivedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 border rounded-md bg-background"
                data-testid={`archived-item-${item.id}`}
              >
                <div className="flex-1">
                  <div className="font-medium">{item.name || "Без названия"}</div>
                  <div className="text-sm text-muted-foreground">
                    Локация: {item.location} | Количество: {item.quantity} | 
                    Архивировано: {new Date(item.archivedAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreArchivedMutation.mutate(item.id)}
                  disabled={restoreArchivedMutation.isPending}
                  data-testid={`button-restore-${item.id}`}
                  className="ml-4"
                >
                  <Package className="w-4 h-4 mr-1" />
                  {restoreArchivedMutation.isPending ? "Восстановление..." : "Восстановить"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Диалог предупреждения о Faulty товаре */}
    <AlertDialog open={showFaultyWarning} onOpenChange={setShowFaultyWarning}>
      <AlertDialogContent data-testid="dialog-faulty-warning" className="bg-destructive/10 border-destructive">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Неисправный товар
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Отсканированный баркод принадлежит товару с состоянием <strong className="text-destructive">Faulty</strong>.
            <br /><br />
            Этот товар не может быть добавлен в инвентарь. Пожалуйста, отложите его в зону для неисправных товаров.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleFaultyClose} data-testid="button-close-faulty">
            Понятно
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Диалог ошибки формата SKU */}
    <AlertDialog open={showSkuFormatError} onOpenChange={setShowSkuFormatError}>
      <AlertDialogContent data-testid="dialog-sku-format-error" className="bg-destructive/10 border-destructive">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Неправильный формат SKU
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            SKU должен быть в формате: <strong>локация-буква</strong>
            <br /><br />
            Примеры правильного формата:
            <ul className="list-disc list-inside mt-2">
              <li><strong>A11-RS-N</strong> (латиница)</li>
              <li><strong>К11-РС-А</strong> (кириллица)</li>
              <li><strong>B200-J</strong></li>
            </ul>
            <br />
            Текущий SKU: <strong className="text-destructive">{sku}</strong>
            <br /><br />
            Пожалуйста, добавьте букву после последнего дефиса "-" и повторите попытку.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setShowSkuFormatError(false)} data-testid="button-close-sku-error">
            Исправить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Диалог изменения состояния */}
    <AlertDialog open={showConditionChangeDialog} onOpenChange={setShowConditionChangeDialog}>
      <AlertDialogContent data-testid="dialog-condition-change">
        <AlertDialogHeader>
          <AlertDialogTitle>Баркод уже зарегистрирован</AlertDialogTitle>
          <AlertDialogDescription>
            Этот баркод уже связан с товаром в состоянии <strong className="text-primary">{detectedCondition}</strong>.
            <br /><br />
            Вы можете:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 py-4">
          <Button 
            variant="outline" 
            onClick={handleConditionKeep}
            data-testid="button-keep-condition"
          >
            Оставить {detectedCondition}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {["New", "Used", "Exdisplay", "Parts"].filter(c => c !== detectedCondition).map(cond => (
              <Button
                key={cond}
                variant="secondary"
                onClick={() => handleConditionChange(cond)}
                data-testid={`button-change-to-${cond}`}
              >
                Изменить на {cond}
              </Button>
            ))}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-condition">
            Отмена
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Список товаров ожидающих размещения */}
    {pendingPlacements.length > 0 && (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">
            Товары ожидают размещения ({pendingPlacements.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Штрихкод</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Состояние</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Локация</TableHead>
                  <TableHead>Принято</TableHead>
                  {user?.role === "admin" && <TableHead className="w-20">Действия</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPlacements ? (
                  <TableRow>
                    <TableCell colSpan={user?.role === "admin" ? 8 : 7} className="text-center py-8 text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingPlacements.map((placement) => (
                    <TableRow key={placement.id} data-testid={`row-pending-${placement.id}`}>
                      <TableCell className="font-mono text-sm">{placement.barcode}</TableCell>
                      <TableCell className="font-mono text-sm">{placement.sku}</TableCell>
                      <TableCell className="text-sm">{placement.name || "-"}</TableCell>
                      <TableCell className="text-sm">{placement.condition}</TableCell>
                      <TableCell className="text-sm">{placement.quantity}</TableCell>
                      <TableCell className="font-mono text-sm">{placement.location}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(placement.stockInAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </TableCell>
                      {user?.role === "admin" && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditBarcodeClick(placement)}
                              disabled={updateBarcodeMutation.isPending}
                              data-testid={`button-edit-barcode-pending-${placement.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(placement)}
                              disabled={deletePlacementMutation.isPending}
                              data-testid={`button-delete-pending-${placement.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    )}

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
          <AlertDialogDescription>
            Вы действительно хотите удалить pending placement?
            {placementToDelete && (
              <div className="mt-2 p-2 bg-muted rounded-md">
                <div className="text-sm space-y-1">
                  <div><strong>Штрихкод:</strong> {placementToDelete.barcode}</div>
                  <div><strong>SKU:</strong> {placementToDelete.sku}</div>
                  {placementToDelete.name && <div><strong>Название:</strong> {placementToDelete.name}</div>}
                  <div><strong>Локация:</strong> {placementToDelete.location}</div>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete-pending">Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete-pending"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Edit Barcode Dialog */}
    <Dialog open={editBarcodeDialogOpen} onOpenChange={setEditBarcodeDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Исправить баркод</DialogTitle>
          <DialogDescription>
            Введите новый баркод для этого товара
            {placementToEdit && (
              <div className="mt-2 p-2 bg-muted rounded-md">
                <div className="text-sm space-y-1">
                  <div><strong>Текущий баркод:</strong> {placementToEdit.barcode}</div>
                  <div><strong>SKU:</strong> {placementToEdit.sku}</div>
                  {placementToEdit.name && <div><strong>Название:</strong> {placementToEdit.name}</div>}
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="new-barcode-stock">Новый баркод</Label>
          <Input
            id="new-barcode-stock"
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newBarcode.trim()) {
                handleEditBarcodeConfirm();
              }
            }}
            placeholder="Введите новый баркод"
            className="mt-2 font-mono"
            data-testid="input-new-barcode-stock"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setEditBarcodeDialogOpen(false)}
            data-testid="button-cancel-edit-stock"
          >
            Отмена
          </Button>
          <Button
            onClick={handleEditBarcodeConfirm}
            disabled={!newBarcode.trim() || updateBarcodeMutation.isPending}
            data-testid="button-confirm-edit-stock"
          >
            {updateBarcodeMutation.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
