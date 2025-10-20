import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Scan, CheckCircle2, AlertCircle, Usb, Smartphone, Wifi, Trash2 } from "lucide-react";
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
  const [mode, setMode] = useState<"first-scan" | "second-scan">("first-scan");
  const [currentTest, setCurrentTest] = useState<PendingTest | null>(null);
  const [scannerMode, setScannerMode] = useState<ScannerMode>("usb");
  const { toast } = useToast();

  // WebSocket for phone mode
  const { isConnected: isPhoneConnected, lastMessage } = useWebSocket();

  // USB scanner routing - ВСЕГДА АКТИВЕН для автоматического ввода штрихкодов
  // Когда включен режим телефона, WebSocket перехватит ввод отдельно
  const { inputRef: barcodeInputRef } = useGlobalBarcodeInput(true);

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
      setCurrentTest(data);
      setMode("second-scan");
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
      setMode("first-scan");
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

    if (mode === "first-scan") {
      // First scan - start test
      startTestMutation.mutate({ barcode: barcode.trim() });
    } else {
      // Second scan - check if it matches current test
      const pending = pendingTests.find(p => p.barcode === barcode.trim());
      if (pending) {
        setCurrentTest(pending);
        setBarcode("");
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      } else {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Товар не найден в списке тестирования",
        });
        setBarcode("");
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }
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
    mutationFn: async (barcode: string) => {
      const res = await apiRequest("DELETE", `/api/product-testing/pending/${barcode}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-testing/pending"] });
      toast({
        title: "Товар удален",
        description: "Товар удален из списка тестирования",
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

  // Cancel second scan
  const handleCancel = () => {
    setCurrentTest(null);
    setMode("first-scan");
    setSelectedCondition("");
    setBarcode("");
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="w-5 h-5" />
            {mode === "first-scan" ? "Начать тестирование" : "Завершить тестирование"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scanner Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Сканер:</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={scannerMode === "usb" ? "default" : "outline"}
                size="sm"
                onClick={() => setScannerMode("usb")}
                data-testid="button-scanner-usb"
                className="gap-1.5"
              >
                <Usb className="w-4 h-4" />
                USB
              </Button>
              <Button
                type="button"
                variant={scannerMode === "phone" ? "default" : "outline"}
                size="sm"
                onClick={() => setScannerMode("phone")}
                data-testid="button-scanner-phone"
                className="gap-1.5"
              >
                <Smartphone className="w-4 h-4" />
                Телефон
              </Button>
            </div>
            {scannerMode === "phone" && (
              <div className="flex items-center gap-1.5 ml-2">
                <Wifi className={`w-4 h-4 ${isPhoneConnected ? "text-green-600" : "text-amber-600"}`} />
                <span className={`text-xs ${isPhoneConnected ? "text-green-600" : "text-amber-600"}`}>
                  {isPhoneConnected ? "Подключен" : "Подключение..."}
                </span>
              </div>
            )}
          </div>

          {mode === "first-scan" ? (
            <>
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Отсканируйте товар для начала тестирования
                </p>
              </div>
              
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
                  Начать тестирование
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deletePendingTestMutation.mutate(test.barcode)}
                            disabled={deletePendingTestMutation.isPending}
                            data-testid={`button-delete-pending-${test.barcode}`}
                            className="text-destructive hover:text-destructive"
                          >
                            {deletePendingTestMutation.isPending ? (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
