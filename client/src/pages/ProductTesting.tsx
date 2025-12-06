import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Scan, CheckCircle2, AlertCircle, Usb, Smartphone, Wifi, Trash2, Edit } from "lucide-react";
import ScannerModule from "@/components/ScannerModule";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { PendingTest, TestedItem } from "@shared/schema";
import { useGlobalBarcodeInput } from "@/hooks/useGlobalBarcodeInput";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getCurrentUser } from "@/lib/api";

type ScannerMode = "usb" | "phone";

export default function ProductTesting() {
  const [barcode, setBarcode] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<string>("");
  const [currentTest, setCurrentTest] = useState<PendingTest | null>(null);
  const [scannerMode, setScannerMode] = useState<ScannerMode>("usb");
  const [editBarcodeDialogOpen, setEditBarcodeDialogOpen] = useState(false);
  const [testToEdit, setTestToEdit] = useState<PendingTest | null>(null);
  const [newBarcode, setNewBarcode] = useState("");
  const { toast } = useToast();

  // WebSocket for phone mode
  const { isConnected: isPhoneConnected, lastMessage } = useWebSocket();

  // USB scanner routing - ВСЕГДА создается, но активен только в USB режиме
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  // Простой keydown listener для захвата сканера
  useEffect(() => {
    if (scannerMode !== "usb") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем модификаторы
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      // Если фокус не на input, направляем туда
      const activeElement = document.activeElement;
      if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
        if (e.key.length === 1 || e.key === 'Enter') {
          barcodeInputRef.current?.focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [scannerMode]);

  // Обработка сообщений от телефона через WebSocket
  useEffect(() => {
    if (lastMessage?.type === "barcode_scanned" && scannerMode === "phone") {
      const code = lastMessage.barcode;
      setBarcode(code);
    }
  }, [lastMessage, scannerMode]);

  // Fetch pending tests
  const { data: pendingTests = [] } = useQuery<PendingTest[]>({
    queryKey: ["/api/product-testing/pending"],
  });

  // Fetch tested items
  const { data: testedItems = [] } = useQuery<TestedItem[]>({
    queryKey: ["/api/product-testing/tested"],
  });

  // Get current user to check admin rights
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getCurrentUser,
  });

  // Debug: log current user
  useEffect(() => {
    console.log('[ProductTesting] Current user:', currentUser);
    console.log('[ProductTesting] Is admin?', currentUser?.role === "admin");
  }, [currentUser]);

  // Start test mutation (first scan)
  const startTestMutation = useMutation({
    mutationFn: async (data: { barcode: string }) => {
      const res = await apiRequest("POST", "/api/product-testing/start", data);
      return await res.json();
    },
    onSuccess: (data: PendingTest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/pending"] });
      toast({
        title: "Тестирование начато",
        description: `Товар ${data.barcode} добавлен в тестирование`,
      });
      setBarcode("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
      setBarcode("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    },
  });

  // Complete test mutation (second scan)
  const completeTestMutation = useMutation({
    mutationFn: async (data: { barcode: string; condition: string }) => {
      const res = await apiRequest("POST", "/api/product-testing/complete", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/tested"] });
      queryClient.invalidateQueries({ queryKey: ["/api/faulty-stock"] });
      toast({
        title: "Тестирование завершено",
        description: "Товар обработан успешно",
      });
      setCurrentTest(null);
      setSelectedCondition("");
      setBarcode("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
      setBarcode("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    },
  });

  // Handle barcode scan/input
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!barcode.trim()) {
      return;
    }

    // Проверяем есть ли уже этот товар в тестировании
    const pending = pendingTests.find(p => p.barcode === barcode.trim());
    
    if (pending) {
      // Повторное сканирование - показываем форму выбора состояния
      setCurrentTest(pending);
      setBarcode("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } else {
      // Первое сканирование - добавляем в список тестирования
      startTestMutation.mutate({ barcode: barcode.trim() });
    }
  };

  // Handle condition confirmation
  const handleConfirm = () => {
    if (!currentTest || !selectedCondition) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Выберите кондицию товара",
      });
      return;
    }

    completeTestMutation.mutate({
      barcode: currentTest.barcode,
      condition: selectedCondition,
    });
  };

  // Delete pending test mutation (admin only)
  const deletePendingTestMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/product-testing/pending/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/pending"] });
      toast({
        title: "Товар удален",
        description: "Тестируемый товар удален из списка",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Update barcode mutation
  const updateBarcodeMutation = useMutation({
    mutationFn: async ({ id, barcode }: { id: string; barcode: string }) => {
      const res = await apiRequest("PATCH", `/api/product-testing/pending/${id}/barcode`, { barcode });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/pending"] });
      toast({
        title: "Обновлено",
        description: "Баркод успешно изменён",
      });
      setEditBarcodeDialogOpen(false);
      setTestToEdit(null);
      setNewBarcode("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Delete tested item mutation (admin only)
  const deleteTestedItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/product-testing/tested/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/tested"] });
      toast({
        title: "Товар удален",
        description: "Протестированный товар удален",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Cancel/reset
  const handleCancel = () => {
    setCurrentTest(null);
    setSelectedCondition("");
    setBarcode("");
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  // Edit barcode handlers
  const handleEditBarcodeClick = (test: PendingTest) => {
    setTestToEdit(test);
    setNewBarcode(test.barcode);
    setEditBarcodeDialogOpen(true);
  };

  const handleEditBarcodeConfirm = () => {
    if (testToEdit && newBarcode.trim()) {
      updateBarcodeMutation.mutate({ id: testToEdit.id, barcode: newBarcode.trim() });
    }
  };

  // Auto-focus on mount (простой подход как в StockInForm)
  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [scannerMode]);

  const isPending = startTestMutation.isPending || completeTestMutation.isPending;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      <h1 className="text-2xl font-semibold">Тестирование товаров</h1>

      {/* Main Scanner Card */}
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Scan className="w-5 h-5" />
            {!currentTest ? "Тестирование товаров" : "Выбор состояния"}
          </CardTitle>
          
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
        <CardContent className="space-y-4">

          {!currentTest ? (
            <>
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Первое сканирование - добавление в тестирование<br/>
                  Повторное сканирование - выбор состояния
                </p>
              </div>
              <ScannerModule
                onScan={(code) => setBarcode(code)}
                onManualChange={(code) => setBarcode(code)}
                onDelete={() => setBarcode("")}
              />
              
              <form onSubmit={handleBarcodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="barcode">Штрихкод</Label>
                  <Input
                    ref={barcodeInputRef}
                    id="barcode"
                    data-testid="input-barcode"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder={scannerMode === "usb" ? "Отсканируйте штрихкод" : "Введите или отсканируйте"}
                    disabled={isPending}
                  />
                </div>

                <Button 
                  type="submit" 
                  data-testid="button-scan"
                  disabled={!barcode.trim() || isPending}
                  className="w-full"
                >
                  {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Сканировать
                </Button>
              </form>
            </>
          ) : (
            <>
              {currentTest ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-md space-y-2">
                    <p className="font-medium">Товар: {currentTest.barcode}</p>
                    {currentTest.name && <p className="text-sm text-muted-foreground">{currentTest.name}</p>}
                    {currentTest.sku && <p className="text-sm text-muted-foreground">SKU: {currentTest.sku}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Выберите кондицию</Label>
                    <RadioGroup value={selectedCondition} onValueChange={setSelectedCondition}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="New" id="new" data-testid="radio-new" />
                        <Label htmlFor="new" className="cursor-pointer">New (Новый)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Used" id="used" data-testid="radio-used" />
                        <Label htmlFor="used" className="cursor-pointer">Used (Б/У)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Exdisplay" id="exdisplay" data-testid="radio-exdisplay" />
                        <Label htmlFor="exdisplay" className="cursor-pointer">Exdisplay (Витринный)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Parts" id="parts" data-testid="radio-parts" />
                        <Label htmlFor="parts" className="cursor-pointer">Parts (Запчасти)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Faulty" id="faulty" data-testid="radio-faulty" />
                        <Label htmlFor="faulty" className="cursor-pointer text-destructive font-medium">
                          Faulty (Брак)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleConfirm}
                      data-testid="button-confirm-condition"
                      disabled={!selectedCondition || isPending}
                      className="flex-1"
                    >
                      {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Подтвердить
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      data-testid="button-cancel"
                      disabled={isPending}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      Отсканируйте товар из списка тестирования
                    </p>
                  </div>
                  
                  <form onSubmit={handleBarcodeSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="barcode-second">Штрихкод</Label>
                      <Input
                        ref={barcodeInputRef}
                        id="barcode-second"
                        data-testid="input-barcode-second"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder={scannerMode === "usb" ? "Отсканируйте штрихкод" : "Введите или отсканируйте"}
                        disabled={isPending}
                      />
                    </div>
                  </form>

                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="button-back-to-first"
                    className="w-full"
                  >
                    Вернуться к началу
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Pending Tests Table */}
      {pendingTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              На тестировании ({pendingTests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Штрихкод</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Начато</TableHead>
                    {currentUser?.role === "admin" && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTests.map((test) => (
                    <TableRow key={test.id} data-testid={`pending-test-${test.barcode}`}>
                      <TableCell className="font-mono">{test.barcode}</TableCell>
                      <TableCell>{test.sku || "-"}</TableCell>
                      <TableCell>{test.name || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(test.firstScanAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                      {currentUser?.role === "admin" && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditBarcodeClick(test)}
                              disabled={updateBarcodeMutation.isPending}
                              data-testid={`button-edit-barcode-${test.barcode}`}
                              className="h-8 w-8"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePendingTestMutation.mutate(test.id)}
                              data-testid={`button-delete-pending-${test.barcode}`}
                              className="h-8 w-8"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tested Items Table */}
      {testedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Протестировано ({testedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Штрихкод</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Кондиция</TableHead>
                    <TableHead>Дата решения</TableHead>
                    {currentUser?.role === "admin" && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testedItems.map((item) => (
                    <TableRow key={item.id} data-testid={`tested-item-${item.barcode}`}>
                      <TableCell className="font-mono">{item.barcode}</TableCell>
                      <TableCell>{item.sku || "-"}</TableCell>
                      <TableCell>{item.name || "-"}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          item.condition === "New" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" :
                          item.condition === "Used" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" :
                          item.condition === "Exdisplay" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100" :
                          "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                        }`}>
                          {item.condition}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.decisionAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                      {currentUser?.role === "admin" && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTestedItemMutation.mutate(item.id)}
                            disabled={deleteTestedItemMutation.isPending}
                            data-testid={`button-delete-tested-${item.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            {deleteTestedItemMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Barcode Dialog */}
      <Dialog open={editBarcodeDialogOpen} onOpenChange={setEditBarcodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Исправить баркод</DialogTitle>
            <DialogDescription>
              Введите новый баркод для этого товара
              {testToEdit && (
                <div className="mt-2 p-2 bg-muted rounded-md">
                  <div className="text-sm space-y-1">
                    <div><strong>Текущий баркод:</strong> {testToEdit.barcode}</div>
                    <div><strong>SKU:</strong> {testToEdit.sku || "-"}</div>
                    {testToEdit.name && <div><strong>Название:</strong> {testToEdit.name}</div>}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-barcode-test">Новый баркод</Label>
            <Input
              id="new-barcode-test"
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newBarcode.trim()) {
                  handleEditBarcodeConfirm();
                }
              }}
              placeholder="Введите новый баркод"
              className="mt-2 font-mono"
              data-testid="input-new-barcode-test"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditBarcodeDialogOpen(false)}
              data-testid="button-cancel-edit-test"
            >
              Отмена
            </Button>
            <Button
              onClick={handleEditBarcodeConfirm}
              disabled={!newBarcode.trim() || updateBarcodeMutation.isPending}
              data-testid="button-confirm-edit-test"
            >
              {updateBarcodeMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
