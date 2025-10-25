import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUp, List, Trash2, CheckCircle2, Circle, Download, Plus, X, ChevronDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { PickingList, PickingTask, InventoryItem } from "@shared/schema";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { format } from "date-fns";

export default function DailyPickingView() {
  const { toast } = useToast();
  const { lastMessage, sendMessage } = useWebSocket();
  
  // Helper function to get today's date
  const getTodayDate = () => format(new Date(), "dd.MM.yyyy");
  
  const [csvText, setCsvText] = useState("");
  const [listName, setListName] = useState(getTodayDate());
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [letterFilter, setLetterFilter] = useState<string>("all");
  const [pageLimit, setPageLimit] = useState<string>("50");
  const [lastResult, setLastResult] = useState<any>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  
  // Load selected list from localStorage on mount
  useEffect(() => {
    const savedListId = localStorage.getItem("selectedPickingListId");
    if (savedListId) {
      setSelectedListId(savedListId);
    }
  }, []);

  // Save selected list to localStorage when it changes
  useEffect(() => {
    if (selectedListId) {
      localStorage.setItem("selectedPickingListId", selectedListId);
    } else {
      localStorage.removeItem("selectedPickingListId");
    }
  }, [selectedListId]);

  // Fetch global credentials from database
  const { data: globalUsernameData } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "csv_global_username"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/settings/csv_global_username");
        if (res.status === 404) {
          // Initialize with default value if not exists
          const initRes = await fetch("/api/settings/csv_global_username", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: "baritero@gmail.com" })
          });
          return await initRes.json();
        }
        return await res.json();
      } catch {
        return { key: "csv_global_username", value: "baritero@gmail.com" };
      }
    },
  });

  const { data: globalPasswordData } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "csv_global_password"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/settings/csv_global_password");
        if (res.status === 404) {
          // Initialize with default value if not exists
          const initRes = await fetch("/api/settings/csv_global_password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: "Baritero1" })
          });
          return await initRes.json();
        }
        return await res.json();
      } catch {
        return { key: "csv_global_password", value: "Baritero1" };
      }
    },
  });

  const globalUsername = globalUsernameData?.value || "baritero@gmail.com";
  const globalPassword = globalPasswordData?.value || "Baritero1";

  // Update global credentials mutation
  const updateGlobalCredentialsMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("PUT", `/api/settings/${key}`, { value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // Fetch CSV sources from database
  const { data: csvSources = [] } = useQuery<Array<{
    id: string;
    url: string;
    name: string;
    enabled: boolean;
    sortOrder: number;
  }>>({
    queryKey: ["/api/csv-sources"],
  });

  // Add CSV source mutation
  const addCsvSourceMutation = useMutation({
    mutationFn: async () => {
      const nextNumber = csvSources.length + 1;
      const response = await apiRequest("POST", "/api/csv-sources", {
        url: "",
        name: `S${nextNumber}`,
        enabled: true,
        sortOrder: csvSources.length
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/csv-sources"] });
    },
  });

  // Update CSV source mutation
  const updateCsvSourceMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/csv-sources/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/csv-sources"] });
    },
  });

  // Remove CSV source mutation
  const removeCsvSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/csv-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/csv-sources"] });
    },
  });

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

  // Fetch inventory to check current quantities
  const { data: allInventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
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
      setListName(getTodayDate()); // Reset to today's date
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

  const manualCollectMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", "/api/picking/manual-collect", { taskId });
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/picking/lists", selectedListId] });
      toast({
        title: data.success ? "Товар собран вручную" : "Ошибка",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка сбора", description: error.message, variant: "destructive" });
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

  // Load all enabled CSV sources and merge data
  const handleLoadFromUrl = async () => {
    const enabledSources = csvSources.filter(s => s.enabled && s.url.trim());
    
    if (enabledSources.length === 0) {
      toast({
        title: "Ошибка",
        description: "Нет активных источников для загрузки",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingUrl(true);
    
    try {
      // Load all enabled sources in parallel
      const loadPromises = enabledSources.map(async (source) => {
        const payload: any = {
          url: source.url,
          full: true
        };
        
        if (globalUsername && globalPassword) {
          payload.username = globalUsername;
          payload.password = globalPassword;
        }

        const response = await apiRequest("POST", "/api/picking/parse-csv-url", payload);
        const result = await response.json();

        if (!result.success) {
          throw new Error(`${source.url}: ${result.error || "Ошибка загрузки"}`);
        }

        return { source, result };
      });

      const results = await Promise.all(loadPromises);
      
      // Merge data from all sources - sum quantities for same SKU
      const mergedData: Record<string, { sku: string; name: string; quantity: number }> = {};
      
      for (const { result } of results) {
        // Extract columns automatically
        const skuCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('sku') || h.toLowerCase().includes('артикул')
        ) || result.headers[0];
        
        const nameCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('name') || h.toLowerCase().includes('title') || 
          h.toLowerCase().includes('название') || h.toLowerCase().includes('товар')
        );
        
        const qtyCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('quantity') || h.toLowerCase().includes('qty') || 
          h.toLowerCase().includes('количество') || h.toLowerCase().includes('кол')
        ) || result.headers[result.headers.length - 1];
        
        // Process each row
        for (const row of result.data) {
          const sku = (row[skuCol] || '').trim();
          const name = nameCol ? (row[nameCol] || '').trim() : '';
          const qty = parseInt(row[qtyCol] || '0', 10);
          
          if (!sku) continue;
          
          if (mergedData[sku]) {
            // Sum quantities for same SKU
            mergedData[sku].quantity += qty;
            // Update name if current is empty and new has value
            if (!mergedData[sku].name && name) {
              mergedData[sku].name = name;
            }
          } else {
            // Add new SKU
            mergedData[sku] = { sku, name, quantity: qty };
          }
        }
      }
      
      // Convert to CSV text
      const csvLines = Object.values(mergedData).map(item => 
        `${item.sku}, ${item.name}, ${item.quantity}`
      ).join('\n');
      
      setCsvText(csvLines);
      
      const totalItems = Object.keys(mergedData).length;
      toast({
        title: "Загружено",
        description: `Загружено из ${enabledSources.length} источников, ${totalItems} уникальных позиций`,
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

  // Calculate inventory quantities by SKU
  const inventoryBySku = useMemo(() => {
    const map = new Map<string, number>();
    allInventory.forEach(item => {
      const currentQty = map.get(item.sku) || 0;
      map.set(item.sku, currentQty + item.quantity);
    });
    return map;
  }, [allInventory]);

  // Helper function to get final quantity and warning level
  const getInventoryWarning = (task: PickingTask) => {
    const remainingQuantity = task.requiredQuantity - (task.pickedQuantity || 0);
    const currentQty = inventoryBySku.get(task.sku) || 0;
    const finalQty = currentQty - remainingQuantity;
    
    // If fully picked, no warning
    if (remainingQuantity <= 0) {
      return { level: 'safe' as const, finalQty: currentQty, currentQty, remainingQuantity: 0 };
    }
    
    if (finalQty < 0) {
      return { level: 'critical' as const, finalQty, currentQty, remainingQuantity };
    } else if (finalQty === 0) {
      return { level: 'warning' as const, finalQty, currentQty, remainingQuantity };
    }
    return { level: 'safe' as const, finalQty, currentQty, remainingQuantity };
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
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      {/* Create Picking List - Full Width */}
      <Card className="w-full">
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

            {/* Global credentials */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Логин и пароль для всех источников</label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Логин"
                  defaultValue={globalUsername}
                  onBlur={(e) => {
                    if (e.target.value !== globalUsername) {
                      updateGlobalCredentialsMutation.mutate({ key: "csv_global_username", value: e.target.value });
                    }
                  }}
                  data-testid="input-global-username"
                  type="text"
                  className="text-sm"
                />
                <Input
                  placeholder="Пароль"
                  defaultValue={globalPassword}
                  onBlur={(e) => {
                    if (e.target.value !== globalPassword) {
                      updateGlobalCredentialsMutation.mutate({ key: "csv_global_password", value: e.target.value });
                    }
                  }}
                  data-testid="input-global-password"
                  type="password"
                  className="text-sm"
                />
              </div>
            </div>
            
            {/* CSV Sources Section - Collapsible */}
            <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen} className="space-y-2">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-0 h-auto font-medium">
                    <span className="text-sm">Источники CSV ({csvSources.filter(s => s.enabled).length} активных)</span>
                    <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addCsvSourceMutation.mutate()}
                    data-testid="button-add-source"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    data-testid="button-load-url"
                    onClick={handleLoadFromUrl}
                    disabled={isLoadingUrl}
                    variant="secondary"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {isLoadingUrl ? "Грузим..." : "Загрузить все"}
                  </Button>
                </div>
              </div>
              
              <CollapsibleContent className="space-y-3">
                {/* Compact source grid - up to 5 per row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-2">
                  {csvSources.map((source, index) => (
                    <div key={source.id} className="flex flex-col gap-1 p-2 border rounded-md bg-muted/20" data-testid={`source-item-${index}`}>
                      <div className="flex items-center justify-between gap-1">
                        <Input
                          placeholder="S1"
                          defaultValue={source.name}
                          onBlur={(e) => {
                            const newName = e.target.value.slice(0, 3);
                            if (newName !== source.name) {
                              updateCsvSourceMutation.mutate({ id: source.id, updates: { name: newName } });
                            }
                          }}
                          data-testid={`input-source-name-${index}`}
                          className="h-6 w-10 text-xs text-center p-0"
                          maxLength={3}
                        />
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={source.enabled}
                            onCheckedChange={(enabled) => updateCsvSourceMutation.mutate({ id: source.id, updates: { enabled } })}
                            data-testid={`switch-source-${index}`}
                            className="scale-75"
                          />
                          {csvSources.length > 1 && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeCsvSourceMutation.mutate(source.id)}
                              data-testid={`button-remove-source-${index}`}
                              className="h-5 w-5"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Input
                        placeholder="URL"
                        defaultValue={source.url}
                        onBlur={(e) => {
                          if (e.target.value !== source.url) {
                            updateCsvSourceMutation.mutate({ id: source.id, updates: { url: e.target.value } });
                          }
                        }}
                        data-testid={`input-source-url-${index}`}
                        className="h-6 text-xs w-full"
                        title={source.url}
                      />
                      <span className="text-[10px] text-muted-foreground truncate leading-tight" title={source.url}>
                        {source.url ? `${source.name}: ${source.url.substring(0, 20)}...` : 'URL не указан'}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <label className="text-sm font-medium">CSV Data (SKU, Quantity)</label>
              <textarea
                data-testid="textarea-csv-data"
                className="w-full h-32 p-3 rounded-md border bg-background text-sm font-mono"
                placeholder="A101-F, 2&#10;E501-N, 3&#10;ZW-F232, 1"
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                }}
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

      {/* Bottom: Two columns for Lists and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Picking Tasks */}
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
                  {filteredTasks.map((task) => {
                    const warning = getInventoryWarning(task);
                    const rowBgClass = warning.level === 'critical' 
                      ? 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-800' 
                      : warning.level === 'warning'
                      ? 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-800'
                      : task.itemNameSource === 'inventory' 
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' 
                      : '';
                    
                    return (
                      <div
                        key={task.id}
                        data-testid={`task-${task.id}`}
                        className={`flex items-center justify-between p-3 rounded-md border hover-elevate ${rowBgClass}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {task.status === "COMPLETED" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-base font-semibold flex-shrink-0 whitespace-nowrap">{task.sku}</span>
                              <span className="text-xs text-muted-foreground" data-testid={`text-task-name-${task.id}`}>
                                {task.itemName || '-'}
                              </span>
                              {(warning.level === 'warning' || warning.level === 'critical') && (
                                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid={`text-task-progress-${task.id}`}>
                                {task.pickedQuantity} / {task.requiredQuantity} собрано
                              </div>
                              {warning.remainingQuantity > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Осталось: <span className="font-semibold">{warning.remainingQuantity}</span>
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Текущий запас: <span className="font-semibold">{warning.currentQty}</span>
                              </div>
                              <div className={`text-xs font-semibold ${
                                warning.level === 'critical' ? 'text-red-600 dark:text-red-400' :
                                warning.level === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-green-600 dark:text-green-400'
                              }`} data-testid={`text-final-qty-${task.id}`}>
                                После сбора: {warning.finalQty}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {task.status !== "COMPLETED" && (
                            <Button
                              data-testid={`button-manual-collect-${task.id}`}
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => manualCollectMutation.mutate(task.id)}
                              disabled={manualCollectMutation.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Собрать
                            </Button>
                          )}
                          <Badge 
                            variant={task.status === "COMPLETED" ? "default" : "secondary"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {task.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
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
    </div>
  );
}
