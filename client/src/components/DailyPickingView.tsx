import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUp, List, Trash2, CheckCircle2, Circle, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { PickingList, PickingTask } from "@shared/schema";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function DailyPickingView() {
  const { toast } = useToast();
  const { lastMessage, sendMessage } = useWebSocket();
  const [csvText, setCsvText] = useState("");
  const [listName, setListName] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [letterFilter, setLetterFilter] = useState<string>("all");
  const [pageLimit, setPageLimit] = useState<string>("50");
  const [lastResult, setLastResult] = useState<any>(null);
  const [csvUrl, setCsvUrl] = useState("");
  const [csvUsername, setCsvUsername] = useState("baritero@gmail.com");
  const [csvPassword, setCsvPassword] = useState("Baritero1");
  const [showAuth, setShowAuth] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  const { data: lists = [] } = useQuery<PickingList[]>({
    queryKey: ["/api/picking/lists"],
  });

  // Sync selected list across devices via WebSocket
  useEffect(() => {
    const syncList = async () => {
      if (lastMessage?.type === "sync_picking_list") {
        const listId = lastMessage.listId;
        console.log("[Picking] Syncing list from WebSocket:", listId);
        
        // First ensure lists are loaded
        await queryClient.ensureQueryData({
          queryKey: ["/api/picking/lists"],
        });
        
        // Then set the selected list and fetch its details
        setSelectedListId(listId);
        await queryClient.fetchQuery({
          queryKey: ["/api/picking/lists", listId],
        });
        
        console.log("[Picking] List synced successfully:", listId);
      }
    };
    
    syncList().catch(err => {
      console.error("Failed to sync picking list:", err);
    });
  }, [lastMessage]);

  const { data: currentList } = useQuery<{ list: PickingList; tasks: PickingTask[] }>({
    queryKey: ["/api/picking/lists", selectedListId],
    enabled: !!selectedListId,
  });

  const createListMutation = useMutation({
    mutationFn: async (data: { name: string; tasks: { sku: string; itemName?: string; requiredQuantity: number }[] }) => {
      const response = await apiRequest("POST", "/api/picking/lists", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/picking/lists"] });
      setSelectedListId(data.list.id);
      setCsvText("");
      setListName("");
      toast({ title: "List Created", description: `Created picking list with ${data.tasks.length} tasks` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (data: { barcode: string; taskId: string }) => {
      const response = await apiRequest("POST", "/api/picking/scan", data);
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/picking/lists", selectedListId] });
      toast({
        title: data.success ? "Item Picked" : "Error",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Scan Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/picking/lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/picking/lists"] });
      setSelectedListId(null);
      toast({ title: "List Deleted", description: "Picking list has been removed" });
    },
  });

  const handleUploadCSV = () => {
    if (!csvText.trim() || !listName.trim()) {
      toast({ title: "Error", description: "Please provide list name and CSV data", variant: "destructive" });
      return;
    }

    const lines = csvText.split("\n").filter(line => line.trim());
    const tasksMap = new Map<string, { sku: string; itemName?: string; requiredQuantity: number }>();

    // Auto-detect delimiter: tab, comma, semicolon, or whitespace
    let delimiter = ",";
    const firstLine = lines[0] || "";
    if (firstLine.includes("\t")) {
      delimiter = "\t";
    } else if (firstLine.includes(";")) {
      delimiter = ";";
    } else if (firstLine.includes(",")) {
      delimiter = ",";
    } else if (/\s+/.test(firstLine)) {
      // If no delimiter found, try splitting by whitespace
      delimiter = "whitespace";
    }

    for (const line of lines) {
      const parts = delimiter === "whitespace" 
        ? line.trim().split(/\s+/).map(p => p.trim())
        : line.split(delimiter).map(p => p.trim());
        
      if (parts.length >= 2) {
        const sku = parts[0].toUpperCase();
        let itemName: string | undefined;
        let quantity: number;

        // Format: SKU, название (опционально), количество
        if (parts.length === 2) {
          // SKU, количество
          quantity = parseInt(parts[1]) || 1;
        } else {
          // SKU, название, количество
          itemName = parts[1] || undefined;
          quantity = parseInt(parts[2]) || 1;
        }

        // Объединяем одинаковые SKU
        if (tasksMap.has(sku)) {
          const existing = tasksMap.get(sku)!;
          existing.requiredQuantity += quantity;
          // Если новое название указано, а старого нет - обновляем
          if (itemName && !existing.itemName) {
            existing.itemName = itemName;
          }
        } else {
          tasksMap.set(sku, {
            sku,
            itemName,
            requiredQuantity: quantity,
          });
        }
      }
    }

    const tasks = Array.from(tasksMap.values());

    if (tasks.length === 0) {
      toast({ title: "Error", description: "No valid tasks found in CSV", variant: "destructive" });
      return;
    }

    createListMutation.mutate({ name: listName, tasks });
  };

  const handleScan = (barcode: string) => {
    if (!barcode.trim()) {
      toast({ title: "Error", description: "Please enter a barcode", variant: "destructive" });
      return;
    }
    
    // Find first pending task
    const nextPending = filteredTasks.find(t => t.status === "PENDING");
    if (!nextPending) {
      toast({ title: "No Pending Tasks", description: "All tasks are completed", variant: "destructive" });
      return;
    }
    
    scanMutation.mutate({ barcode: barcode.trim(), taskId: nextPending.id });
  };

  const handleDeleteList = (id: string) => {
    if (confirm("Are you sure you want to delete this picking list?")) {
      deleteListMutation.mutate(id);
    }
  };

  const handleListSelect = (listId: string) => {
    setSelectedListId(listId);
    // Sync selection to other devices
    sendMessage({
      type: "sync_picking_list",
      listId: listId
    });
  };

  const handleLoadFromUrl = async () => {
    if (!csvUrl.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите URL CSV файла",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingUrl(true);
    
    try {
      // Send credentials in request body (secure)
      const payload: any = {
        url: csvUrl,
        full: true
      };
      
      if (csvUsername && csvPassword) {
        payload.username = csvUsername;
        payload.password = csvPassword;
      }

      const response = await apiRequest("POST", "/api/picking/parse-csv-url", payload);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Не удалось загрузить CSV");
      }

      // Convert parsed data to CSV text for preview
      const csvLines = result.data.map((row: any) => {
        const values = result.headers.map((h: string) => row[h] || "");
        return values.join(",");
      });
      
      setCsvText(csvLines.join("\n"));
      
      // Clear credentials after successful load
      setCsvUsername("");
      setCsvPassword("");
      
      toast({
        title: "Загружено",
        description: `Загружено ${result.data.length} строк`,
      });
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message || "Не удалось загрузить CSV",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUrl(false);
    }
  };

  // Filter tasks
  const filteredTasks = currentList?.tasks
    .filter(task => {
      if (letterFilter === "all") return true;
      return task.sku.toUpperCase().startsWith(letterFilter);
    })
    .slice(0, pageLimit === "all" ? undefined : parseInt(pageLimit)) || [];

  const completedCount = currentList?.tasks.filter(t => t.status === "COMPLETED").length || 0;
  const totalCount = currentList?.tasks.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 h-full overflow-auto">
      {/* Left Panel: CSV Upload */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Create Picking List
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">List Name</label>
              <Input
                data-testid="input-list-name"
                placeholder="e.g., Daily Picking 2025-10-12"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>
            
            {/* URL Load Section */}
            <div className="space-y-2 pb-2 border-b">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Загрузить из интернета</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAuth(!showAuth)}
                  data-testid="button-toggle-auth"
                >
                  {showAuth ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="ml-1 text-xs">{showAuth ? "Скрыть авторизацию" : "Нужен логин?"}</span>
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  data-testid="input-csv-url"
                  placeholder="https://example.com/file.csv"
                  value={csvUrl}
                  onChange={(e) => setCsvUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  data-testid="button-load-url"
                  onClick={handleLoadFromUrl}
                  disabled={isLoadingUrl}
                  variant="secondary"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isLoadingUrl ? "Загрузка..." : "Загрузить"}
                </Button>
              </div>
              
              {showAuth && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Input
                    data-testid="input-csv-username"
                    placeholder="Логин (опционально)"
                    value={csvUsername}
                    onChange={(e) => setCsvUsername(e.target.value)}
                    type="text"
                  />
                  <Input
                    data-testid="input-csv-password"
                    placeholder="Пароль (опционально)"
                    value={csvPassword}
                    onChange={(e) => setCsvPassword(e.target.value)}
                    type="password"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">CSV Data (SKU, Quantity)</label>
              <textarea
                data-testid="textarea-csv-data"
                className="w-full h-32 p-3 rounded-md border bg-background text-sm font-mono"
                placeholder="A101-F, 2&#10;E501-N, 3&#10;ZW-F232, 1"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>
            <Button
              data-testid="button-create-list"
              onClick={handleUploadCSV}
              disabled={createListMutation.isPending}
              className="w-full"
            >
              <FileUp className="h-4 w-4 mr-2" />
              {createListMutation.isPending ? "Creating..." : "Create Picking List"}
            </Button>
          </CardContent>
        </Card>

        {/* List Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Saved Lists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No picking lists created yet</p>
            ) : (
              lists.map((list) => (
                <div
                  key={list.id}
                  data-testid={`list-item-${list.id}`}
                  className={`flex items-center justify-between p-3 rounded-md border ${
                    selectedListId === list.id ? "bg-accent" : "hover-elevate"
                  }`}
                  onClick={() => handleListSelect(list.id)}
                >
                  <div className="flex-1 cursor-pointer">
                    <div className="font-medium">{list.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(list.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    data-testid={`button-delete-list-${list.id}`}
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteList(list.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Picking Tasks */}
      <div className="space-y-4">
        {selectedListId && currentList ? (
          <>
            <BarcodeScanner onScan={handleScan} />

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span>{completedCount} / {totalCount}</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>

                {lastResult && (
                  <Alert className={lastResult.success ? "border-green-500 bg-green-50 dark:bg-green-950" : ""}>
                    <AlertDescription>{lastResult.message}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Picking Tasks</CardTitle>
                  <div className="flex gap-2">
                    <Select value={letterFilter} onValueChange={setLetterFilter}>
                      <SelectTrigger data-testid="select-letter-filter" className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {Array.from(new Set(currentList.tasks.map(t => t.sku.charAt(0).toUpperCase()))).sort().map(letter => (
                          <SelectItem key={letter} value={letter}>{letter}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={pageLimit} onValueChange={setPageLimit}>
                      <SelectTrigger data-testid="select-page-limit" className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      data-testid={`task-${task.id}`}
                      className={`flex items-center justify-between p-3 rounded-md border hover-elevate ${
                        task.itemNameSource === 'inventory' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {task.status === "COMPLETED" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{task.sku}</span>
                            <span className="font-medium" data-testid={`text-task-name-${task.id}`}>
                              {task.itemName || '-'}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-task-progress-${task.id}`}>
                            {task.pickedQuantity} / {task.requiredQuantity} собрано
                          </div>
                        </div>
                      </div>
                      <Badge variant={task.status === "COMPLETED" ? "default" : "secondary"}>
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Select or create a picking list to begin</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
