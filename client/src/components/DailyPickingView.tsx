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
import { FileUp, List, Trash2, CheckCircle2, Circle, Download, Plus, X, ChevronDown, AlertTriangle, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [letterFilter, setLetterFilter] = useState<string[]>([]);
  const [pageLimit, setPageLimit] = useState<string>("50");
  const [lastResult, setLastResult] = useState<any>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [savedListsOpen, setSavedListsOpen] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
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

  // Create SKU -> InventoryItem mapping for quick lookup
  // Prefer items with imageUrls or ebayUrl if multiple items have same SKU
  const skuToInventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    
    allInventory.forEach(item => {
      const existing = map.get(item.sku);
      
      if (!existing) {
        map.set(item.sku, item);
      } else {
        // Prefer item with imageUrls or ebayUrl
        const existingHasMedia = existing.imageUrls || existing.ebayUrl;
        const itemHasMedia = item.imageUrls || item.ebayUrl;
        
        if (itemHasMedia && !existingHasMedia) {
          map.set(item.sku, item);
        }
      }
    });
    
    return map;
  }, [allInventory]);

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
    mutationFn: async (data: { barcode: string; listId: string }) => {
      const response = await apiRequest("POST", "/api/picking/scan-by-list", data);
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/picking/lists", selectedListId] });
      // Invalidate orders cache so Dispatch page shows new orders immediately
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/orders');
        }
      });
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
      // Invalidate orders cache so Dispatch page shows new orders immediately
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/orders');
        }
      });
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
    
    if (lines.length === 0) {
      toast({ title: "Error", description: "CSV is empty", variant: "destructive" });
      return;
    }

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

    // Parse first line as headers
    const headerParts = delimiter === "whitespace" 
      ? firstLine.trim().split(/\s+/).map(p => p.trim())
      : firstLine.split(delimiter).map(p => p.trim());
    
    // Check if first line looks like headers (contains known field names)
    const looksLikeHeaders = headerParts.some(h => 
      h.toLowerCase().includes('sku') || 
      h.toLowerCase().includes('item_id') ||
      h.toLowerCase().includes('buyer') ||
      h.toLowerCase().includes('quantity')
    );

    let headers: string[] = [];
    let dataLines: string[] = [];
    
    if (looksLikeHeaders) {
      headers = headerParts;
      dataLines = lines.slice(1);
    } else {
      // Old format without headers - treat as: SKU, name (optional), quantity, sellerName (optional)
      dataLines = lines;
    }

    const tasks: Array<{
      sku: string;
      itemName?: string;
      requiredQuantity: number;
      itemId?: string;
      buyerUsername?: string;
      buyerName?: string;
      addressPostalCode?: string;
      sellerEbayId?: string;
      orderDate?: Date;
    }> = [];

    if (headers.length > 0) {
      // NEW FORMAT: CSV with headers
      const itemIdCol = headers.find(h => h.toLowerCase().includes('item_id'));
      const skuCol = headers.find(h => h.toLowerCase().includes('item_sku') || h.toLowerCase().includes('sku')) || headers[0];
      const nameCol = headers.find(h => h.toLowerCase().includes('item_title') || h.toLowerCase().includes('title') || h.toLowerCase().includes('name'));
      const qtyCol = headers.find(h => h.toLowerCase().includes('transaction_quantity') || h.toLowerCase().includes('quantity') || h.toLowerCase().includes('qty'));
      const buyerUsernameCol = headers.find(h => h.toLowerCase().includes('buyer_username'));
      const buyerNameCol = headers.find(h => h.toLowerCase().includes('buyer_name'));
      const postalCodeCol = headers.find(h => h.toLowerCase().includes('address_postal_code') || h.toLowerCase().includes('postal_code'));
      const sellerIdCol = headers.find(h => h.toLowerCase().includes('seller_ebay_seller_id') || h.toLowerCase().includes('seller_id'));
      const orderDateCol = headers.find(h => h.toLowerCase().includes('order_date'));

      for (const line of dataLines) {
        const parts = delimiter === "whitespace" 
          ? line.trim().split(/\s+/).map(p => p.trim())
          : line.split(delimiter).map(p => p.trim());
        
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = parts[i] || '';
        });

        const sku = (row[skuCol] || '').trim().toUpperCase();
        if (!sku) continue;

        const task: any = {
          sku,
          requiredQuantity: qtyCol ? (parseInt(row[qtyCol] || '1', 10) || 1) : 1,
        };

        if (nameCol && row[nameCol]) task.itemName = row[nameCol].trim();
        if (itemIdCol && row[itemIdCol]) task.itemId = row[itemIdCol].trim();
        if (buyerUsernameCol && row[buyerUsernameCol]) task.buyerUsername = row[buyerUsernameCol].trim();
        if (buyerNameCol && row[buyerNameCol]) task.buyerName = row[buyerNameCol].trim();
        if (postalCodeCol && row[postalCodeCol]) task.addressPostalCode = row[postalCodeCol].trim();
        if (sellerIdCol && row[sellerIdCol]) task.sellerEbayId = row[sellerIdCol].trim();
        if (orderDateCol && row[orderDateCol]) {
          try {
            task.orderDate = new Date(row[orderDateCol]);
          } catch {
            // Invalid date, skip
          }
        }

        tasks.push(task);
      }
    } else {
      // OLD FORMAT: No headers, simple format (SKU, name?, quantity, sellerName?)
      for (const line of dataLines) {
        const parts = delimiter === "whitespace" 
          ? line.trim().split(/\s+/).map(p => p.trim())
          : line.split(delimiter).map(p => p.trim());
          
        if (parts.length >= 2) {
          const sku = parts[0].toUpperCase();
          let itemName: string | undefined;
          let quantity: number;
          let ebaySellerName: string | undefined;

          if (parts.length === 2) {
            quantity = parseInt(parts[1]) || 1;
          } else if (parts.length === 3) {
            itemName = parts[1] || undefined;
            quantity = parseInt(parts[2]) || 1;
          } else {
            itemName = parts[1] || undefined;
            quantity = parseInt(parts[2]) || 1;
            ebaySellerName = parts[3] || undefined;
          }

          tasks.push({
            sku,
            itemName,
            requiredQuantity: quantity,
            sellerEbayId: ebaySellerName,
          });
        }
      }
    }

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
    
    if (!selectedListId) {
      toast({ title: "Error", description: "Please select a picking list first", variant: "destructive" });
      return;
    }
    
    // Scan any item - system will auto-find matching task by SKU
    scanMutation.mutate({ barcode: barcode.trim(), listId: selectedListId });
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
      
      // Build tasks array - each CSV row becomes a separate task (NO aggregation)
      const tasks: Array<{
        sku: string;
        itemName?: string;
        requiredQuantity: number;
        itemId?: string;
        buyerUsername?: string;
        buyerName?: string;
        addressPostalCode?: string;
        sellerEbayId?: string;
        orderDate?: Date;
      }> = [];
      
      for (const { result } of results) {
        // Find columns by name matching
        const itemIdCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('item_id')
        );
        
        const skuCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('item_sku') || h.toLowerCase().includes('sku')
        ) || result.headers[0];
        
        const nameCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('item_title') || h.toLowerCase().includes('title') || h.toLowerCase().includes('name')
        );
        
        const qtyCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('transaction_quantity') || h.toLowerCase().includes('quantity') || h.toLowerCase().includes('qty')
        );
        
        const buyerUsernameCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('buyer_username')
        );
        
        const buyerNameCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('buyer_name')
        );
        
        const postalCodeCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('address_postal_code') || h.toLowerCase().includes('postal_code')
        );
        
        const sellerIdCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('seller_ebay_seller_id') || h.toLowerCase().includes('seller_id')
        );
        
        const orderDateCol = result.headers.find((h: string) => 
          h.toLowerCase().includes('order_date')
        );
        
        // Process each row - create separate task for each row
        for (const row of result.data) {
          const sku = (row[skuCol] || '').trim().toUpperCase();
          if (!sku) continue;
          
          const task: any = {
            sku,
            requiredQuantity: qtyCol ? (parseInt(row[qtyCol] || '1', 10) || 1) : 1,
          };
          
          if (nameCol && row[nameCol]) task.itemName = row[nameCol].trim();
          if (itemIdCol && row[itemIdCol]) task.itemId = row[itemIdCol].trim();
          if (buyerUsernameCol && row[buyerUsernameCol]) task.buyerUsername = row[buyerUsernameCol].trim();
          if (buyerNameCol && row[buyerNameCol]) task.buyerName = row[buyerNameCol].trim();
          if (postalCodeCol && row[postalCodeCol]) task.addressPostalCode = row[postalCodeCol].trim();
          if (sellerIdCol && row[sellerIdCol]) task.sellerEbayId = row[sellerIdCol].trim();
          if (orderDateCol && row[orderDateCol]) {
            try {
              task.orderDate = new Date(row[orderDateCol]);
            } catch {
              // Invalid date, skip
            }
          }
          
          tasks.push(task);
        }
      }
      
      if (tasks.length === 0) {
        toast({
          title: "Ошибка",
          description: "Не найдено ни одной валидной задачи в CSV",
          variant: "destructive",
        });
        return;
      }
      
      // Create the picking list directly with all tasks
      createListMutation.mutate({ name: listName, tasks });
      
      toast({
        title: "Загружено",
        description: `Создано ${tasks.length} задач из ${enabledSources.length} источников`,
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

  // Get available letters from current list
  const availableLetters = useMemo(() => {
    if (!currentList) return [];
    const letters = new Set(currentList.tasks.map(t => t.sku.charAt(0).toUpperCase()));
    return Array.from(letters).sort();
  }, [currentList]);

  // Filter tasks - hide completed tasks
  const filteredTasks = currentList?.tasks
    .filter(task => {
      // Hide completed tasks
      if (task.status === "COMPLETED") return false;
      
      // Filter by letter
      if (letterFilter.length === 0) return true;
      const firstLetter = task.sku.charAt(0).toUpperCase();
      return letterFilter.includes(firstLetter);
    })
    .slice(0, pageLimit === "all" ? undefined : parseInt(pageLimit)) || [];

  const completedCount = currentList?.tasks.filter(t => t.status === "COMPLETED").length || 0;
  const totalCount = currentList?.tasks.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      {/* Create Picking List - Full Width */}
      <Collapsible open={createListOpen} onOpenChange={setCreateListOpen}>
        <Card className="w-full">
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="group w-full justify-start text-left p-0 h-auto rounded-none" 
              data-testid="header-create-list"
            >
              <CardHeader className="w-full p-3">
                <div className="flex items-center justify-between gap-4 w-full">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileUp className="h-4 w-4" />
                    Create Picking List
                  </CardTitle>
                  <ChevronDown 
                    className="transition-transform flex-shrink-0 group-data-[state=open]:rotate-180" 
                  />
                </div>
              </CardHeader>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {createListOpen && (
              <CardContent className="space-y-4 pt-0">
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
            )}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Saved Lists */}
      <Collapsible open={savedListsOpen} onOpenChange={setSavedListsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="group w-full justify-start text-left p-0 h-auto rounded-none" 
              data-testid="header-saved-lists"
            >
              <CardHeader className="w-full p-3">
                <div className="flex items-center justify-between gap-4 w-full">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <List className="h-4 w-4" />
                    Saved Lists
                  </CardTitle>
                  <ChevronDown 
                    className="transition-transform flex-shrink-0 group-data-[state=open]:rotate-180" 
                  />
                </div>
              </CardHeader>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {savedListsOpen && (
              <CardContent className="space-y-1 pt-0">
                {lists.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">No picking lists created yet</p>
                ) : (
                  lists.map((list) => (
                    <div
                      key={list.id}
                      data-testid={`list-item-${list.id}`}
                      className={`flex items-center justify-between px-2 py-1 rounded border ${
                        selectedListId === list.id ? "bg-accent" : "hover-elevate"
                      }`}
                      onClick={() => handleListSelect(list.id)}
                    >
                      <div className="flex-1 cursor-pointer min-w-0">
                        <div className="text-sm font-medium truncate">{list.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(list.createdAt).toLocaleDateString()} {new Date(list.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                      </div>
                      <Button
                        data-testid={`button-delete-list-${list.id}`}
                        variant="ghost"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Barcode Scanner and Progress - показываем только если список выбран */}
      {selectedListId && currentList && (
        <>
          <BarcodeScanner onScan={handleScan} />

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Progress</span>
                  <span>{completedCount} / {totalCount}</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {lastResult && (
                <Alert className={lastResult.success ? "border-green-500 bg-green-50 dark:bg-green-950" : ""}>
                  <AlertDescription className="text-xs">{lastResult.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Picking Tasks */}
      {selectedListId && currentList ? (
        <div className="space-y-4">

            <Card>
              <CardHeader>
                <div className="space-y-2">
                  <div className="text-[10px] text-muted-foreground">
                    Список: {currentList.list.name}
                  </div>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle>Picking Tasks</CardTitle>
                    <div className="flex gap-2 items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="justify-start font-normal min-w-[120px]"
                          data-testid="button-letter-filter"
                        >
                          {letterFilter.length === 0 ? (
                            "Все буквы"
                          ) : (
                            <div className="flex gap-1 flex-wrap">
                              {letterFilter.map(letter => (
                                <Badge key={letter} variant="secondary" className="text-xs">
                                  {letter}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm">Выберите буквы</h4>
                            {letterFilter.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLetterFilter([])}
                                data-testid="button-clear-letters"
                              >
                                Очистить
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {availableLetters.map(letter => {
                              const isChecked = letterFilter.includes(letter);
                              return (
                                <div key={letter} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`letter-${letter}`}
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setLetterFilter([...letterFilter, letter]);
                                      } else {
                                        setLetterFilter(letterFilter.filter(l => l !== letter));
                                      }
                                    }}
                                    data-testid={`checkbox-letter-${letter}`}
                                  />
                                  <Label 
                                    htmlFor={`letter-${letter}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {letter}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
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
                    
                    // Get inventory item for this task
                    const inventoryItem = skuToInventoryMap.get(task.sku);
                    const imageUrls = inventoryItem?.imageUrls ? JSON.parse(inventoryItem.imageUrls) : [];
                    const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
                    const ebayUrl = inventoryItem?.ebayUrl;
                    
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
                          
                          {/* Product photo thumbnail */}
                          {firstImageUrl ? (
                            <button
                              onClick={() => {
                                setSelectedImage(firstImageUrl);
                                setImageModalOpen(true);
                              }}
                              className="flex-shrink-0 rounded overflow-hidden hover-elevate"
                              data-testid={`button-image-${task.id}`}
                            >
                              <img 
                                src={firstImageUrl} 
                                alt={task.itemName || task.sku} 
                                className="w-12 h-12 object-cover"
                                data-testid={`img-thumbnail-${task.id}`}
                              />
                            </button>
                          ) : (
                            <div 
                              className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0" 
                              data-testid={`placeholder-image-${task.id}`}
                            >
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
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
                          {/* eBay link button */}
                          {ebayUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => window.open(ebayUrl, '_blank', 'noopener,noreferrer')}
                              data-testid={`button-ebay-${task.id}`}
                              title="Открыть на eBay"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                          
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
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Select or create a picking list to begin</p>
          </CardContent>
        </Card>
      )}
      
      {/* Image Modal Dialog */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Просмотр изображения</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="flex items-center justify-center p-4">
              <img 
                src={selectedImage} 
                alt="Product full size" 
                className="max-w-full max-h-[70vh] object-contain"
                data-testid="img-modal-fullsize"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
