import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUp, List, Trash2, CheckCircle2, Circle, Download, Plus, X, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { PickingList, PickingTask } from "@shared/schema";
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
  
  // Global credentials for all CSV sources
  const [globalUsername, setGlobalUsername] = useState(() => {
    return localStorage.getItem("globalUsername") || "baritero@gmail.com";
  });
  const [globalPassword, setGlobalPassword] = useState(() => {
    return localStorage.getItem("globalPassword") || "Baritero1";
  });

  // Save global credentials to localStorage
  useEffect(() => {
    localStorage.setItem("globalUsername", globalUsername);
    localStorage.setItem("globalPassword", globalPassword);
  }, [globalUsername, globalPassword]);

  // CSV sources array - each source has URL, name, and enabled flag
  const [csvSources, setCsvSources] = useState<Array<{
    id: string;
    url: string;
    name: string;
    enabled: boolean;
  }>>(() => {
    // Load saved sources from localStorage or use defaults
    const saved = localStorage.getItem("csvSources");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old format to new format if needed
        return parsed.map((s: any) => ({
          id: s.id,
          url: s.url,
          name: s.name || "S1",
          enabled: s.enabled ?? true
        }));
      } catch {
        return [{
          id: '1',
          url: "https://files.3dsellers.com/uploads/0874ff67c0e8b7abc580de328633eda6/export-csv/automation-172416.csv",
          name: "S1",
          enabled: true
        }];
      }
    }
    return [{
      id: '1',
      url: "https://files.3dsellers.com/uploads/0874ff67c0e8b7abc580de328633eda6/export-csv/automation-172416.csv",
      name: "S1",
      enabled: true
    }];
  });

  // Save sources to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("csvSources", JSON.stringify(csvSources));
  }, [csvSources]);

  // Add new CSV source
  const addCsvSource = () => {
    const nextNumber = csvSources.length + 1;
    const newSource = {
      id: Date.now().toString(),
      url: "",
      name: `S${nextNumber}`,
      enabled: true
    };
    setCsvSources([...csvSources, newSource]);
  };

  // Update CSV source
  const updateCsvSource = (id: string, updates: Partial<typeof csvSources[0]>) => {
    setCsvSources(sources => 
      sources.map(s => s.id === id ? { ...s, ...updates } : s)
    );
  };

  // Remove CSV source
  const removeCsvSource = (id: string) => {
    setCsvSources(sources => sources.filter(s => s.id !== id));
  };

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
        <Card className="max-w-xl">
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
                  value={globalUsername}
                  onChange={(e) => setGlobalUsername(e.target.value)}
                  data-testid="input-global-username"
                  type="text"
                  className="text-sm"
                />
                <Input
                  placeholder="Пароль"
                  value={globalPassword}
                  onChange={(e) => setGlobalPassword(e.target.value)}
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
                    onClick={addCsvSource}
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
                <div className="flex flex-wrap gap-3 pt-2">
                  {csvSources.map((source, index) => (
                    <div key={source.id} className="flex flex-col gap-1 min-w-[140px]" data-testid={`source-item-${index}`}>
                      <div className="flex items-center gap-1">
                        <Input
                          placeholder="S1"
                          value={source.name}
                          onChange={(e) => updateCsvSource(source.id, { name: e.target.value.slice(0, 3) })}
                          data-testid={`input-source-name-${index}`}
                          className="h-7 w-12 text-xs text-center p-1"
                          maxLength={3}
                        />
                        <Switch
                          checked={source.enabled}
                          onCheckedChange={(enabled) => updateCsvSource(source.id, { enabled })}
                          data-testid={`switch-source-${index}`}
                        />
                        <span className="text-xs whitespace-nowrap">
                          {source.enabled ? "Грузить" : "Нет"}
                        </span>
                        {csvSources.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeCsvSource(source.id)}
                            data-testid={`button-remove-source-${index}`}
                            className="h-6 w-6 ml-1"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Input
                        placeholder="URL"
                        value={source.url}
                        onChange={(e) => updateCsvSource(source.id, { url: e.target.value })}
                        data-testid={`input-source-url-${index}`}
                        className="h-7 text-xs"
                        title={source.url}
                      />
                      <span className="text-xs text-muted-foreground truncate" title={source.url}>
                        {source.name}: {source.url || 'URL не указан'}
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
                            <span className="font-mono text-base font-semibold">{task.sku}</span>
                            <span className="text-xs text-muted-foreground" data-testid={`text-task-name-${task.id}`}>
                              {task.itemName || '-'}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid={`text-task-progress-${task.id}`}>
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
