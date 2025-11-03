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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Circle, ExternalLink, Image as ImageIcon, Package, Truck, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import ImageGalleryModal from "@/components/ImageGalleryModal";
import type { Order, InventoryItem } from "@shared/schema";
import { format } from "date-fns";

type Phase = 'viewing' | 'label_scanned' | 'packing' | 'confirming';

interface OrderItem {
  sku: string;
  barcode?: string;
  imageUrls?: string[];
  ebayUrl?: string;
  ebaySellerName?: string;
  itemName?: string;
  quantity: number;
}

interface ParsedOrder extends Omit<Order, 'items' | 'dispatchedBarcodes'> {
  items: OrderItem[];
  dispatchedBarcodes: string[];
}

export default function Packing() {
  const { toast } = useToast();
  
  const [currentPhase, setCurrentPhase] = useState<Phase>('viewing');
  const [currentOrder, setCurrentOrder] = useState<ParsedOrder | null>(null);
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch dispatched orders (ready to pack) with real-time updates
  const { data: dispatchedOrders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders?status=DISPATCHED"],
    refetchInterval: 5000, // Real-time updates every 5 seconds
    enabled: currentPhase === 'viewing',
  });

  // Fetch packed orders (completed today) with real-time updates  
  const { data: packedOrders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders?status=PACKED"],
    queryFn: async () => {
      const response = await fetch("/api/orders?status=PACKED");
      if (!response.ok) throw new Error("Failed to fetch packed orders");
      const allPacked = await response.json();
      // Filter only today's packed orders
      const today = new Date().toDateString();
      return allPacked.filter((order: Order) => 
        order.packedAt && new Date(order.packedAt).toDateString() === today
      );
    },
    refetchInterval: 5000, // Real-time updates every 5 seconds
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  // Scan shipping label to find order
  const scanLabelMutation = useMutation({
    mutationFn: async (label: string) => {
      const response = await apiRequest("POST", "/api/orders/scan", {
        code: label,
        status: "DISPATCHED"
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.multiple) {
        toast({
          variant: "destructive",
          title: "Найдено несколько заказов",
          description: `Найдено ${data.orders.length} заказов с этим лейблом. Обратитесь к администратору.`,
        });
        return;
      }

      const order = data.order;
      const parsedOrder: ParsedOrder = {
        ...order,
        items: order.items ? JSON.parse(order.items) : [],
        dispatchedBarcodes: order.dispatchedBarcodes ? JSON.parse(order.dispatchedBarcodes) : []
      };

      enrichOrderWithInventoryData(parsedOrder);
      setCurrentOrder(parsedOrder);
      setScannedCounts(new Map());
      setErrorMessage(null);
      setCurrentPhase('label_scanned');

      const totalQuantity = parsedOrder.items.reduce((sum, item) => sum + item.quantity, 0);
      toast({
        title: "Заказ найден",
        description: `Заказ №${parsedOrder.orderNumber}. Отсканируйте ${totalQuantity} товар(ов) для проверки.`,
      });

      // Invalidate all order queries (using predicate to match all /api/orders* queries)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/orders');
        }
      });
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

  // Complete packing
  const packOrderMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: string; userId: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/packing`, {
        userId
      });
      return response.json();
    },
    onSuccess: (updatedOrder) => {
      toast({
        title: "Упаковка завершена",
        description: `Заказ №${currentOrder?.orderNumber} успешно упакован`,
      });

      // Invalidate all order queries (using predicate to match all /api/orders* queries)
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
        title: "Ошибка упаковки",
        description: error?.message || "Не удалось завершить упаковку",
      });
    },
  });

  // Manual pack order (without scanning items)
  const manualPackOrderMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: string; userId: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/packing`, {
        userId
      });
      return response.json();
    },
    onSuccess: (updatedOrder, variables) => {
      const orderNumber = dispatchedOrders.find(o => o.id === variables.orderId)?.orderNumber;
      toast({
        title: "Заказ упакован",
        description: `Заказ №${orderNumber} отмечен как упакованный`,
      });

      // Invalidate all order queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/orders');
        }
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error?.message || "Не удалось упаковать заказ",
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
    if (currentPhase === 'viewing') {
      // Phase 1: Scan shipping label
      scanLabelMutation.mutate(code);
    } else if (currentPhase === 'label_scanned' || currentPhase === 'packing') {
      // Phase 2-3: Scan items for verification
      handleItemScan(code);
    }
  };

  const handleItemScan = (code: string) => {
    if (!currentOrder) return;

    setCurrentPhase('packing');
    setErrorMessage(null);

    // Check if barcode is in dispatchedBarcodes
    // Allow scans if: 
    // 1. Barcode is in dispatched list, OR
    // 2. Code is a SKU from the order items (for items without barcodes)
    const isDispatchedBarcode = currentOrder.dispatchedBarcodes.includes(code);
    const isSKUFromOrder = currentOrder.items.some(item => item.sku === code);
    
    if (!isDispatchedBarcode && !isSKUFromOrder) {
      setErrorMessage(`Ошибка: товар не соответствует списку (${code})`);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Ошибка: товар не соответствует списку",
      });
      return;
    }

    // Find the SKU that this barcode belongs to
    let matchingItem: OrderItem | undefined;
    
    // First, try to match by exact SKU
    matchingItem = currentOrder.items.find(item => item.sku === code);
    
    // If not matched by SKU, check if barcode belongs to any SKU in inventory
    if (!matchingItem) {
      const inventoryItem = inventory.find(inv => inv.barcode === code);
      if (inventoryItem) {
        matchingItem = currentOrder.items.find(item => item.sku === inventoryItem.sku);
      }
    }

    if (!matchingItem) {
      setErrorMessage(`Товар с кодом ${code} не найден в заказе`);
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
      setErrorMessage(`Превышено количество для SKU ${matchingItem.sku}`);
      toast({
        variant: "destructive",
        title: "Превышено количество",
        description: `SKU ${matchingItem.sku}: уже проверено ${currentCount} из ${matchingItem.quantity}`,
      });
      return;
    }

    // Increment counter
    const newCount = currentCount + 1;
    setScannedCounts(prev => new Map(prev).set(matchingItem.sku, newCount));

    // Check if all items are fully scanned
    const newScannedCounts = new Map(scannedCounts).set(matchingItem.sku, newCount);
    const allItemsScanned = currentOrder.items.every(item => 
      (newScannedCounts.get(item.sku) || 0) >= item.quantity
    );

    if (allItemsScanned) {
      setCurrentPhase('confirming');
      setConfirmDialogOpen(true);
      toast({
        title: "Все товары проверены",
        description: "Подтвердите завершение упаковки",
      });
    } else {
      // Calculate total scanned and total required
      const totalScanned = Array.from(newScannedCounts.values()).reduce((sum, count) => sum + count, 0);
      const totalRequired = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
      const remaining = totalRequired - totalScanned;
      
      toast({
        title: "Товар проверен",
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

    // Check if we've already confirmed the required quantity for this SKU
    if (currentCount >= item.quantity) {
      toast({
        variant: "destructive",
        title: "Превышено количество",
        description: `SKU ${sku}: уже подтверждено ${currentCount} из ${item.quantity}`,
      });
      return;
    }

    // Increment counter (no barcode needed)
    const newCount = currentCount + 1;
    setScannedCounts(prev => new Map(prev).set(sku, newCount));
    setCurrentPhase('packing');

    // Check if all items are fully scanned
    const newScannedCounts = new Map(scannedCounts).set(sku, newCount);
    const allItemsScanned = currentOrder.items.every(item => 
      (newScannedCounts.get(item.sku) || 0) >= item.quantity
    );

    if (allItemsScanned) {
      setCurrentPhase('confirming');
      setConfirmDialogOpen(true);
      toast({
        title: "Все товары подтверждены",
        description: "Подтвердите завершение упаковки",
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

  const handleConfirmPacking = () => {
    if (!currentOrder || !currentUser) return;
    packOrderMutation.mutate({
      orderId: currentOrder.id,
      userId: currentUser.id
    });
  };

  const handleCancelPacking = () => {
    setConfirmDialogOpen(false);
    resetToPhase1();
    toast({
      title: "Отменено",
      description: "Упаковка не завершена",
    });
  };

  const handleManualPackOrder = (orderId: string) => {
    if (!currentUser) return;
    manualPackOrderMutation.mutate({
      orderId,
      userId: currentUser.id
    });
  };

  const resetToPhase1 = () => {
    setCurrentPhase('viewing');
    setCurrentOrder(null);
    setScannedCounts(new Map());
    setErrorMessage(null);
  };

  const openImageGallery = (imageUrls: string[]) => {
    setSelectedImageUrls(imageUrls);
    setImageModalOpen(true);
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const getScannerLabel = () => {
    if (currentPhase === 'viewing') {
      return "Отсканируйте лейбл посылки";
    } else if (currentPhase === 'label_scanned' || currentPhase === 'packing') {
      return "Отсканируйте товар для проверки";
    }
    return "Штрихкод / QR код";
  };

  const getProgress = () => {
    if (!currentOrder || currentOrder.items.length === 0) return 0;
    const totalScanned = Array.from(scannedCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalRequired = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
    return totalRequired > 0 ? (totalScanned / totalRequired) * 100 : 0;
  };

  const parseOrderForDisplay = (order: Order): ParsedOrder => {
    return {
      ...order,
      items: order.items ? JSON.parse(order.items) : [],
      dispatchedBarcodes: order.dispatchedBarcodes ? JSON.parse(order.dispatchedBarcodes) : []
    };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Упаковка заказов (Packing)</h1>
        <Badge variant={currentPhase === 'viewing' ? 'secondary' : 'default'} data-testid="badge-phase">
          {currentPhase === 'viewing' && 'Ожидание лейбла'}
          {currentPhase === 'label_scanned' && 'Заказ найден'}
          {currentPhase === 'packing' && 'Проверка товаров'}
          {currentPhase === 'confirming' && 'Подтверждение'}
        </Badge>
      </div>

      {/* Top Section: Scanner */}
      <BarcodeScanner onScan={handleScan} label={getScannerLabel()} />

      {currentOrder && (
        <Card data-testid="card-current-packing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Текущая упаковка: Заказ №{currentOrder.orderNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Покупатель:</span>
                <p className="font-medium" data-testid="text-current-customer">
                  {currentOrder.customerName || 'Не указан'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Адрес доставки:</span>
                <p className="font-medium" data-testid="text-current-address">
                  {currentOrder.shippingAddress || 'Не указан'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Лейбл:</span>
                <p className="font-medium font-mono text-xs" data-testid="text-current-label">
                  {currentOrder.shippingLabel || 'Не указан'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Прогресс проверки</span>
                <span className="text-sm text-muted-foreground" data-testid="text-packing-progress">
                  {Array.from(scannedCounts.values()).reduce((sum, count) => sum + count, 0)} / {currentOrder.items.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              </div>
              <Progress value={getProgress()} className="h-2" data-testid="progress-packing" />
            </div>

            {errorMessage && (
              <Alert variant="destructive" data-testid="alert-error">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">Товары для проверки:</h3>
              <div className="space-y-2">
                {currentOrder.items.map((item, index) => {
                  const scannedCount = scannedCounts.get(item.sku) || 0;
                  const isComplete = scannedCount >= item.quantity;
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-md border ${
                        isComplete 
                          ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800' 
                          : 'bg-card'
                      }`}
                      data-testid={`packing-item-${item.sku}`}
                    >
                      <div className="flex-shrink-0">
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-checked-${item.sku}`} />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" data-testid={`icon-unchecked-${item.sku}`} />
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
                        <p className="font-medium truncate" data-testid={`text-packing-item-name-${item.sku}`}>
                          {item.itemName || 'Название не указано'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span data-testid={`text-packing-item-sku-${item.sku}`}>SKU: {item.sku}</span>
                          {item.ebaySellerName && (
                            <>
                              <span>•</span>
                              <span data-testid={`text-packing-item-seller-${item.sku}`}>Seller: {item.ebaySellerName}</span>
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
                              <span>Баркод: {item.barcode}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Кнопка "Готов" для товаров без баркода */}
                        {!item.barcode && !isComplete && (currentPhase === 'label_scanned' || currentPhase === 'packing') && (
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
                            data-testid={`link-packing-ebay-${item.sku}`}
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={resetToPhase1}
                className="flex-1"
                data-testid="button-cancel-packing"
              >
                Отменить
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dispatched Orders Table (Ready to Pack) */}
      {dispatchedOrders.length > 0 && (
        <Card data-testid="card-dispatched-orders">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Готовы к упаковке ({dispatchedOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dispatchedOrders.map((order) => {
                const parsedOrder = parseOrderForDisplay(order);
                const isExpanded = expandedOrders.has(order.id);
                
                return (
                  <Collapsible
                    key={order.id}
                    open={isExpanded}
                    onOpenChange={() => toggleOrderExpanded(order.id)}
                  >
                    <div className="border rounded-md" data-testid={`order-dispatched-${order.orderNumber}`}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 hover-elevate rounded-md">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                            <div className="text-left">
                              <p className="font-medium" data-testid={`text-order-number-${order.orderNumber}`}>
                                Заказ №{order.orderNumber}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span data-testid={`text-customer-${order.orderNumber}`}>
                                  {order.customerName || 'Покупатель не указан'}
                                </span>
                                <span>•</span>
                                <span data-testid={`text-items-count-${order.orderNumber}`}>
                                  {parsedOrder.items.length} товар(ов)
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleManualPackOrder(order.id);
                              }}
                              disabled={manualPackOrderMutation.isPending}
                              data-testid={`button-mark-packed-${order.orderNumber}`}
                            >
                              Упакован
                            </Button>
                            <div className="text-sm text-muted-foreground">
                              {order.dispatchedAt ? format(new Date(order.dispatchedAt), "dd.MM.yyyy HH:mm") : ''}
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t p-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Адрес доставки:</span>
                              <p className="font-medium" data-testid={`text-address-${order.orderNumber}`}>
                                {order.shippingAddress || 'Не указан'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Дата заказа:</span>
                              <p className="font-medium" data-testid={`text-order-date-${order.orderNumber}`}>
                                {order.orderDate ? format(new Date(order.orderDate), "dd.MM.yyyy") : 'Не указана'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Товары:</h4>
                            <div className="space-y-2">
                              {parsedOrder.items.map((item, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-3 p-2 rounded-md bg-muted"
                                  data-testid={`item-${order.orderNumber}-${item.sku}`}
                                >
                                  {item.imageUrls && item.imageUrls.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openImageGallery(item.imageUrls!);
                                      }}
                                      className="flex-shrink-0 hover-elevate rounded overflow-hidden relative"
                                      data-testid={`button-open-gallery-${order.orderNumber}-${item.sku}`}
                                    >
                                      <img
                                        src={item.imageUrls[0]}
                                        alt={item.itemName || item.sku}
                                        className="w-12 h-12 object-cover"
                                        data-testid={`image-thumbnail-${order.orderNumber}-${item.sku}`}
                                      />
                                      {item.imageUrls.length > 1 && (
                                        <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                                          +{item.imageUrls.length - 1}
                                        </div>
                                      )}
                                    </button>
                                  )}

                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate text-sm" data-testid={`text-item-name-${order.orderNumber}-${item.sku}`}>
                                      {item.itemName || 'Название не указано'}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span data-testid={`text-item-sku-${order.orderNumber}-${item.sku}`}>
                                        SKU: {item.sku}
                                      </span>
                                      {item.ebaySellerName && (
                                        <>
                                          <span>•</span>
                                          <span data-testid={`text-item-seller-${order.orderNumber}-${item.sku}`}>Seller: {item.ebaySellerName}</span>
                                        </>
                                      )}
                                      {item.barcode && (
                                        <>
                                          <span>•</span>
                                          <span>Баркод: {item.barcode}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {item.ebayUrl && (
                                    <a
                                      href={item.ebayUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`link-ebay-${order.orderNumber}-${item.sku}`}
                                    >
                                      <Button size="sm" variant="outline">
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        eBay
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom Section: Packed Orders History (Today) */}
      {packedOrders.length > 0 && (
        <Card data-testid="card-packed-orders">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Упакованные сегодня ({packedOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {packedOrders.map((order) => {
                const parsedOrder = parseOrderForDisplay(order);
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted"
                    data-testid={`packed-order-${order.orderNumber}`}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium" data-testid={`text-packed-order-number-${order.orderNumber}`}>
                          Заказ №{order.orderNumber}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-packed-order-details-${order.orderNumber}`}>
                          {parsedOrder.items.length} товар(ов) • {order.customerName || 'Покупатель не указан'}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`text-packed-time-${order.orderNumber}`}>
                      {order.packedAt ? format(new Date(order.packedAt), "HH:mm") : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Gallery Modal */}
      <ImageGalleryModal
        imageUrls={selectedImageUrls}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent data-testid="dialog-confirm-packing">
          <DialogHeader>
            <DialogTitle>Завершить упаковку?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Все товары проверены. Завершить упаковку заказа №{currentOrder?.orderNumber}?
            </p>
            {currentOrder && (
              <div className="p-4 rounded-md bg-muted space-y-2">
                <p className="text-sm"><strong>Товаров:</strong> {currentOrder.items.length}</p>
                <p className="text-sm"><strong>Покупатель:</strong> {currentOrder.customerName || 'Не указан'}</p>
                <p className="text-sm"><strong>Лейбл:</strong> {currentOrder.shippingLabel}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelPacking}
              data-testid="button-cancel-confirm"
            >
              Нет
            </Button>
            <Button
              onClick={handleConfirmPacking}
              disabled={packOrderMutation.isPending}
              data-testid="button-confirm-packing"
            >
              {packOrderMutation.isPending ? 'Завершение...' : 'Да, завершить упаковку'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
