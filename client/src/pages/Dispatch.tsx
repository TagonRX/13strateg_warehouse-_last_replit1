import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Circle, ExternalLink, Image as ImageIcon, Package, Truck, AlertTriangle, Search, Trash2 } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import ImageGalleryModal from "@/components/ImageGalleryModal";
import type { Order, InventoryItem } from "@shared/schema";
import { format } from "date-fns";

type Phase = 'scanning_product' | 'scanning_items' | 'scanning_label' | 'confirming';

interface OrderItem {
  sku: string;
  barcode?: string;
  imageUrls?: string[];
  ebayUrl?: string;
  ebaySellerName?: string;
  itemName?: string;
  quantity: number;
}

interface ParsedOrder extends Omit<Order, 'items'> {
  items: OrderItem[];
}

export default function Dispatch() {
  const { toast } = useToast();
  
  const [currentPhase, setCurrentPhase] = useState<Phase>('scanning_product');
  const [currentOrder, setCurrentOrder] = useState<ParsedOrder | null>(null);
  const [scannedItemBarcodes, setScannedItemBarcodes] = useState<string[]>([]);
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map());
  const [dispatchedOrders, setDispatchedOrders] = useState<ParsedOrder[]>([]);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [shippingLabel, setShippingLabel] = useState<string>("");
  const [orderSelectionDialogOpen, setOrderSelectionDialogOpen] = useState(false);
  const [availableOrders, setAvailableOrders] = useState<ParsedOrder[]>([]);
  const [manualSkuInput, setManualSkuInput] = useState<string>("");
  const [deletePendingDialogOpen, setDeletePendingDialogOpen] = useState(false);

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: pendingOrders = [], isLoading: pendingOrdersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders?status=PENDING"],
    enabled: currentPhase === 'scanning_product' && !currentOrder,
  });

  const scanOrderMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/orders/scan", {
        code,
        status: "PENDING"
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.multiple) {
        // Multiple orders found - show selection dialog
        const parsedOrders = data.orders.map((order: any) => ({
          ...order,
          items: order.items ? JSON.parse(order.items) : []
        }));
        
        parsedOrders.forEach((order: ParsedOrder) => enrichOrderWithInventoryData(order));
        setAvailableOrders(parsedOrders);
        setOrderSelectionDialogOpen(true);
        return;
      }

      const order = data.order;
      const parsedOrder: ParsedOrder = {
        ...order,
        items: order.items ? JSON.parse(order.items) : []
      };

      enrichOrderWithInventoryData(parsedOrder);
      setCurrentOrder(parsedOrder);
      setScannedItemBarcodes([]);
      setScannedCounts(new Map());

      const totalQuantity = parsedOrder.items.reduce((sum, item) => sum + item.quantity, 0);
      if (totalQuantity === 1) {
        setCurrentPhase('scanning_label');
        toast({
          title: "Заказ найден",
          description: `Заказ №${parsedOrder.orderNumber} (1 товар). Отсканируйте лейбл посылки.`,
        });
      } else {
        setCurrentPhase('scanning_items');
        toast({
          title: "Заказ найден",
          description: `Заказ №${parsedOrder.orderNumber} (${totalQuantity} товаров). Отсканируйте все товары.`,
        });
      }
    },
    onError: (error: any) => {
      const message = error?.message || "Заказ не найден";
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: message,
      });
    },
  });

  const updateShippingLabelMutation = useMutation({
    mutationFn: async ({ orderId, label }: { orderId: string; label: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/shipping-label`, {
        label
      });
      return response.json();
    },
    onSuccess: () => {
      setCurrentPhase('confirming');
      setConfirmDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка сохранения лейбла",
        description: error?.message || "Не удалось сохранить лейбл посылки",
      });
    },
  });

  const dispatchOrderMutation = useMutation({
    mutationFn: async ({ orderId, barcodes, userId }: { orderId: string; barcodes: string[]; userId: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/dispatch`, {
        barcodes,
        userId
      });
      return response.json();
    },
    onSuccess: (updatedOrder) => {
      if (currentOrder) {
        const parsedOrder: ParsedOrder = {
          ...updatedOrder,
          items: updatedOrder.items ? JSON.parse(updatedOrder.items) : []
        };
        setDispatchedOrders(prev => [parsedOrder, ...prev]);
      }

      toast({
        title: "Заказ отправлен",
        description: `Заказ №${currentOrder?.orderNumber} успешно обработан`,
      });

      // Invalidate all order queries to refresh all stations
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/orders');
        }
      });

      resetToPhase1();
      setConfirmDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка отправки заказа",
        description: error?.message || "Не удалось отправить заказ",
      });
    },
  });

  const deletePendingOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/orders/bulk?status=PENDING", {});
      return response.json();
    },
    onSuccess: (data) => {
      const deletedCount = data.deleted || 0;
      toast({
        title: "Заказы удалены",
        description: `Удалено ${deletedCount} заказ(ов)`,
      });

      queryClient.invalidateQueries({
        queryKey: ["/api/orders?status=PENDING"]
      });

      setDeletePendingDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка удаления",
        description: error?.message || "Не удалось удалить заказы",
      });
    },
  });

  const enrichOrderWithInventoryData = (order: ParsedOrder) => {
    order.items = order.items.map(item => {
      const inventoryItem = inventory.find(inv => inv.sku === item.sku);
      if (inventoryItem) {
        const imageUrls = inventoryItem.imageUrls ? JSON.parse(inventoryItem.imageUrls) : [];
        return {
          ...item,
          imageUrls: imageUrls.length > 0 ? imageUrls : item.imageUrls,
          ebayUrl: item.ebayUrl || inventoryItem.ebayUrl || undefined,
          ebaySellerName: item.ebaySellerName || inventoryItem.ebaySellerName || undefined,
          itemName: item.itemName || inventoryItem.name || undefined,
        };
      }
      return item;
    });
  };

  const handleScan = (code: string) => {
    if (currentPhase === 'scanning_product') {
      scanOrderMutation.mutate(code);
    } else if (currentPhase === 'scanning_items') {
      handleItemScan(code);
    } else if (currentPhase === 'scanning_label') {
      handleLabelScan(code);
    }
  };

  const handleItemScan = (code: string) => {
    if (!currentOrder) return;

    // CRITICAL: Prevent duplicate barcode scans
    if (scannedItemBarcodes.includes(code)) {
      toast({
        variant: "destructive",
        title: "Уже отсканировано",
        description: "Этот баркод уже был отсканирован для данного заказа",
      });
      return;
    }

    // Find the SKU that this barcode belongs to (check inventory)
    let matchingItem: OrderItem | undefined;
    let matchedBySku = false;
    
    // First, try to match by exact SKU
    matchingItem = currentOrder.items.find(item => item.sku === code);
    if (matchingItem) {
      matchedBySku = true;
    }
    
    // If not matched by SKU, check if barcode belongs to any SKU in inventory
    if (!matchingItem) {
      const inventoryItem = inventory.find(inv => inv.barcode === code);
      if (inventoryItem) {
        // Found inventory item with this barcode - check if its SKU is in the order
        matchingItem = currentOrder.items.find(item => item.sku === inventoryItem.sku);
      }
    }

    if (!matchingItem) {
      toast({
        variant: "destructive",
        title: "Товар не найден",
        description: "Этот товар не входит в данный заказ",
      });
      return;
    }

    // Get current count for this SKU
    const currentCount = scannedCounts.get(matchingItem.sku) || 0;

    // Check if we've already scanned the required quantity for this SKU
    if (currentCount >= matchingItem.quantity) {
      toast({
        variant: "destructive",
        title: "Превышено количество",
        description: `SKU ${matchingItem.sku}: уже отсканировано ${currentCount} из ${matchingItem.quantity}`,
      });
      return;
    }

    // Increment counter and add barcode (any barcode for this SKU counts)
    const newCount = currentCount + 1;
    setScannedCounts(prev => new Map(prev).set(matchingItem.sku, newCount));
    setScannedItemBarcodes(prev => [...prev, code]);

    // Check if all items are fully scanned
    const newScannedCounts = new Map(scannedCounts).set(matchingItem.sku, newCount);
    const allItemsScanned = currentOrder.items.every(item => 
      (newScannedCounts.get(item.sku) || 0) >= item.quantity
    );

    if (allItemsScanned) {
      setCurrentPhase('scanning_label');
      toast({
        title: "Все товары отсканированы",
        description: "Отсканируйте лейбл посылки",
      });
    } else {
      // Calculate total scanned and total required
      const totalScanned = Array.from(newScannedCounts.values()).reduce((sum, count) => sum + count, 0);
      const totalRequired = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
      const remaining = totalRequired - totalScanned;
      
      toast({
        title: "Товар отсканирован",
        description: `${matchingItem.sku}: ${newCount} / ${matchingItem.quantity}. Осталось: ${remaining} товар(ов)`,
      });
    }
  };

  const handleManualConfirm = (sku: string) => {
    if (!currentOrder) return;

    const item = currentOrder.items.find(i => i.sku === sku);
    if (!item) return;

    // Get current count for this SKU
    const currentCount = scannedCounts.get(sku) || 0;

    // Check if we've already scanned the required quantity for this SKU
    if (currentCount >= item.quantity) {
      toast({
        variant: "destructive",
        title: "Превышено количество",
        description: `SKU ${sku}: уже подтверждено ${currentCount} из ${item.quantity}`,
      });
      return;
    }

    // Increment counter (use SKU as placeholder for items without barcode)
    const newCount = currentCount + 1;
    setScannedCounts(prev => new Map(prev).set(sku, newCount));
    // Add SKU itself as the "barcode" for manual confirmation (backend will handle this)
    setScannedItemBarcodes(prev => [...prev, sku]);

    // Check if all items are fully scanned
    const newScannedCounts = new Map(scannedCounts).set(sku, newCount);
    const allItemsScanned = currentOrder.items.every(item => 
      (newScannedCounts.get(item.sku) || 0) >= item.quantity
    );

    if (allItemsScanned) {
      setCurrentPhase('scanning_label');
      toast({
        title: "Все товары подтверждены",
        description: "Отсканируйте лейбл посылки",
      });
    } else {
      const totalScanned = Array.from(newScannedCounts.values()).reduce((sum, count) => sum + count, 0);
      const totalRequired = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
      const remaining = totalRequired - totalScanned;
      
      toast({
        title: "Товар подтвержден",
        description: `${sku}: ${newCount} / ${item.quantity}. Осталось: ${remaining} товар(ов)`,
      });
    }
  };

  const handleLabelScan = (code: string) => {
    if (!currentOrder) return;
    setShippingLabel(code);
    updateShippingLabelMutation.mutate({
      orderId: currentOrder.id,
      label: code
    });
  };

  const handleConfirmDispatch = () => {
    if (!currentOrder || !currentUser) return;
    dispatchOrderMutation.mutate({
      orderId: currentOrder.id,
      barcodes: scannedItemBarcodes,
      userId: currentUser.id
    });
  };

  const handleCancelDispatch = () => {
    setConfirmDialogOpen(false);
    resetToPhase1();
    toast({
      title: "Отменено",
      description: "Заказ не отправлен",
    });
  };

  const resetToPhase1 = () => {
    setCurrentPhase('scanning_product');
    setCurrentOrder(null);
    setScannedItemBarcodes([]);
    setScannedCounts(new Map());
    setShippingLabel("");
  };

  const handleOrderSelection = (selectedOrder: ParsedOrder) => {
    setCurrentOrder(selectedOrder);
    setScannedItemBarcodes([]);
    setScannedCounts(new Map());
    setOrderSelectionDialogOpen(false);

    const totalQuantity = selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity === 1) {
      setCurrentPhase('scanning_label');
      toast({
        title: "Заказ выбран",
        description: `Заказ №${selectedOrder.orderNumber} (1 товар). Отсканируйте лейбл посылки.`,
      });
    } else {
      setCurrentPhase('scanning_items');
      toast({
        title: "Заказ выбран",
        description: `Заказ №${selectedOrder.orderNumber} (${totalQuantity} товаров). Отсканируйте все товары.`,
      });
    }
  };

  const openImageGallery = (imageUrls: string[]) => {
    setSelectedImageUrls(imageUrls);
    setImageModalOpen(true);
  };

  const getScannerLabel = () => {
    if (currentPhase === 'scanning_product') {
      return "Отсканируйте баркод товара";
    } else if (currentPhase === 'scanning_items') {
      return "Отсканируйте следующий товар";
    } else if (currentPhase === 'scanning_label') {
      return "Отсканируйте баркод или QR код с лейбла посылки";
    }
    return "Штрихкод / QR код";
  };

  const getProgress = () => {
    if (!currentOrder || currentOrder.items.length === 0) return 0;
    const totalScanned = Array.from(scannedCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalRequired = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
    return totalRequired > 0 ? (totalScanned / totalRequired) * 100 : 0;
  };

  const handleManualSkuSearch = () => {
    const sku = manualSkuInput.trim();
    if (!sku) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите SKU для поиска",
      });
      return;
    }
    
    scanOrderMutation.mutate(sku);
    setManualSkuInput("");
  };

  const handlePendingOrderSelection = (order: ParsedOrder) => {
    enrichOrderWithInventoryData(order);
    handleOrderSelection(order);
  };

  const parsedPendingOrders: ParsedOrder[] = pendingOrders.map(order => ({
    ...order,
    items: order.items ? JSON.parse(order.items) : []
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Подготовка заказов (Dispatch)</h1>
        <Badge variant={currentPhase === 'scanning_product' ? 'secondary' : 'default'} data-testid="badge-phase">
          {currentPhase === 'scanning_product' && 'Ожидание сканирования'}
          {currentPhase === 'scanning_items' && 'Сканирование товаров'}
          {currentPhase === 'scanning_label' && 'Сканирование лейбла'}
          {currentPhase === 'confirming' && 'Подтверждение'}
        </Badge>
      </div>

      <BarcodeScanner onScan={handleScan} label={getScannerLabel()} />

      {currentPhase === 'scanning_product' && !currentOrder && (
        <Card data-testid="card-manual-search">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Поиск по SKU (для товаров без баркода)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={manualSkuInput}
                onChange={(e) => setManualSkuInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleManualSkuSearch();
                  }
                }}
                placeholder="Введите SKU товара..."
                data-testid="input-manual-sku"
              />
              <Button 
                onClick={handleManualSkuSearch}
                disabled={scanOrderMutation.isPending}
                data-testid="button-search-sku"
              >
                <Search className="w-4 h-4 mr-2" />
                Найти
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      {parsedPendingOrders.length > 0 && currentPhase === 'scanning_product' && !currentOrder && (
        <Card data-testid="card-orders-table">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Все заказы ({parsedPendingOrders.length})
            </CardTitle>
            {currentUser?.role === 'admin' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeletePendingDialogOpen(true)}
                data-testid="button-delete-all-pending"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить все
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Номер заказа</TableHead>
                    <TableHead>Покупатель</TableHead>
                    <TableHead>Адрес/Индекс</TableHead>
                    <TableHead>Товаров</TableHead>
                    <TableHead>Кол-во</TableHead>
                    <TableHead>Дата создания</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedPendingOrders.map((order) => {
                    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
                    const customerDisplay = order.buyerName || order.buyerUsername || order.customerName || 'Не указан';
                    const addressDisplay = order.addressPostalCode || order.shippingAddress || 'Не указан';
                    
                    return (
                      <TableRow 
                        key={order.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => handlePendingOrderSelection(order)}
                        data-testid={`order-row-${order.orderNumber}`}
                      >
                        <TableCell className="font-medium font-mono">{order.orderNumber}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{customerDisplay}</span>
                            {order.sellerEbayId && (
                              <span className="text-xs text-muted-foreground">
                                Продавец: {order.sellerEbayId}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{addressDisplay}</TableCell>
                        <TableCell>{order.items.length}</TableCell>
                        <TableCell>{totalQuantity}</TableCell>
                        <TableCell>
                          {order.createdAt ? format(new Date(order.createdAt), "dd.MM.yyyy HH:mm") : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePendingOrderSelection(order);
                            }}
                            data-testid={`button-select-${order.orderNumber}`}
                          >
                            Выбрать
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {currentOrder && (
        <Card data-testid="card-current-order">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Заказ №{currentOrder.orderNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Покупатель:</span>
                <p className="font-medium" data-testid="text-customer-name">{currentOrder.customerName || 'Не указан'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Адрес доставки:</span>
                <p className="font-medium" data-testid="text-shipping-address">{currentOrder.shippingAddress || 'Не указан'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Дата заказа:</span>
                <p className="font-medium" data-testid="text-order-date">
                  {currentOrder.orderDate ? format(new Date(currentOrder.orderDate), "dd.MM.yyyy") : 'Не указана'}
                </p>
              </div>
            </div>

            {currentOrder.items.reduce((sum, item) => sum + item.quantity, 0) > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Прогресс сканирования</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-progress">
                    {Array.from(scannedCounts.values()).reduce((sum, count) => sum + count, 0)} / {currentOrder.items.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                <Progress value={getProgress()} className="h-2" data-testid="progress-scanning" />
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">Товары в заказе:</h3>
              <div className="space-y-2">
                {currentOrder.items.map((item, index) => {
                  const scannedCount = scannedCounts.get(item.sku) || 0;
                  const isComplete = scannedCount >= item.quantity;
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-md border ${
                        isComplete ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800' : 'bg-card'
                      }`}
                      data-testid={`item-${item.sku}`}
                    >
                      <div className="flex-shrink-0">
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-scanned-${item.sku}`} />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" data-testid={`icon-pending-${item.sku}`} />
                        )}
                      </div>

                      {item.imageUrls && item.imageUrls.length > 0 && (
                        <button
                          onClick={() => openImageGallery(item.imageUrls!)}
                          className="flex-shrink-0 hover-elevate rounded overflow-hidden relative"
                          data-testid={`button-open-gallery-${item.sku}`}
                        >
                          <img
                            src={item.imageUrls[0]}
                            alt={item.itemName || item.sku}
                            className="w-12 h-12 object-cover"
                            data-testid={`image-thumbnail-${item.sku}`}
                          />
                          {item.imageUrls.length > 1 && (
                            <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                              +{item.imageUrls.length - 1}
                            </div>
                          )}
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" data-testid={`text-item-name-${item.sku}`}>
                          {item.itemName || 'Название не указано'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span data-testid={`text-item-sku-${item.sku}`}>SKU: {item.sku}</span>
                          {item.ebaySellerName && (
                            <>
                              <span>•</span>
                              <span data-testid={`text-item-seller-${item.sku}`}>Seller: {item.ebaySellerName}</span>
                            </>
                          )}
                          {item.quantity > 1 && (
                            <>
                              <span>•</span>
                              <Badge variant={isComplete ? "default" : "secondary"} data-testid={`badge-quantity-${item.sku}`}>
                                {scannedCount} / {item.quantity}
                              </Badge>
                            </>
                          )}
                          {item.barcode && (
                            <>
                              <span>•</span>
                              <span data-testid={`text-item-barcode-${item.sku}`}>Баркод: {item.barcode}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Кнопка "Готов" для товаров без баркода */}
                        {!item.barcode && !isComplete && currentPhase === 'scanning_items' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleManualConfirm(item.sku)}
                            data-testid={`button-manual-confirm-${item.sku}`}
                          >
                            Готов
                          </Button>
                        )}
                        
                        {item.ebayUrl && (
                          <a
                            href={item.ebayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0"
                            data-testid={`link-ebay-${item.sku}`}
                          >
                            <Button size="sm" variant="outline">
                              <ExternalLink className="w-4 h-4 mr-1" />
                              eBay
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {currentPhase === 'scanning_label' && (
              <Alert data-testid="alert-scan-label">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  Отсканируйте баркод или QR код с лейбла посылки
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={resetToPhase1}
                className="w-full"
                data-testid="button-back-to-orders"
              >
                Назад к списку заказов
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {dispatchedOrders.length > 0 && (
        <Card data-testid="card-dispatched-orders">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Отправленные заказы ({dispatchedOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dispatchedOrders.map((order, index) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted"
                  data-testid={`dispatched-order-${order.orderNumber}`}
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">Заказ №{order.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.items.length} товар(ов) • {order.customerName}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {order.dispatchedAt ? format(new Date(order.dispatchedAt), "HH:mm") : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ImageGalleryModal
        imageUrls={selectedImageUrls}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />

      <Dialog open={orderSelectionDialogOpen} onOpenChange={setOrderSelectionDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-order-selection">
          <DialogHeader>
            <DialogTitle>Выберите заказ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Найдено {availableOrders.length} заказ(ов) с этим товаром. Выберите нужный:
            </p>
            <div className="space-y-3">
              {availableOrders.map((order) => (
                <Card 
                  key={order.id} 
                  className="cursor-pointer hover-elevate active-elevate-2 transition-all"
                  onClick={() => handleOrderSelection(order)}
                  data-testid={`order-option-${order.orderNumber}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Заказ №{order.orderNumber}</CardTitle>
                      <Badge>{order.items.length} товар(ов)</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Покупатель:</span>
                        <p className="font-medium">{order.customerName || 'Не указан'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Дата:</span>
                        <p className="font-medium">
                          {order.orderDate ? format(new Date(order.orderDate), "dd.MM.yyyy") : 'Не указана'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Товары в заказе:</span>
                      <div className="mt-2 space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <Badge variant="outline">{item.sku}</Badge>
                            <span>{item.itemName || 'Без названия'}</span>
                            <span className="text-muted-foreground">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOrderSelectionDialogOpen(false)}
              data-testid="button-cancel-order-selection"
            >
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent data-testid="dialog-confirm-dispatch">
          <DialogHeader>
            <DialogTitle>Отправить заказ?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Вы уверены, что хотите отправить заказ №{currentOrder?.orderNumber}?
            </p>
            {currentOrder && (
              <div className="p-4 rounded-md bg-muted space-y-2">
                <p className="text-sm"><strong>Товаров:</strong> {currentOrder.items.length}</p>
                <p className="text-sm"><strong>Покупатель:</strong> {currentOrder.customerName}</p>
                <p className="text-sm"><strong>Лейбл:</strong> {shippingLabel}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDispatch}
              data-testid="button-cancel-dispatch"
            >
              Отмена
            </Button>
            <Button
              onClick={handleConfirmDispatch}
              disabled={dispatchOrderMutation.isPending}
              data-testid="button-confirm-dispatch"
            >
              {dispatchOrderMutation.isPending ? 'Отправка...' : 'Отправить заказ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePendingDialogOpen} onOpenChange={setDeletePendingDialogOpen}>
        <DialogContent data-testid="dialog-delete-pending">
          <DialogHeader>
            <DialogTitle>Удалить все pending заказы?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Будет удалено {parsedPendingOrders.length} заказ(ов). Это действие необратимо.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePendingDialogOpen(false)}
              data-testid="button-cancel-delete-pending"
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletePendingOrdersMutation.mutate()}
              disabled={deletePendingOrdersMutation.isPending}
              data-testid="button-confirm-delete-pending"
            >
              {deletePendingOrdersMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
