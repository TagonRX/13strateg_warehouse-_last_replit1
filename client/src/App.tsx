import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import LoginForm from "@/components/LoginForm";
import AppLayout from "@/components/AppLayout";
import StockInForm from "@/components/StockInForm";
import CSVUploader from "@/components/CSVUploader";
import InventoryTable from "@/components/InventoryTable";
import WarehouseLoadingView from "@/components/WarehouseLoadingView";
import UserManagementPanel from "@/components/UserManagementPanel";
import StockOutView from "@/components/StockOutView";
import DailyPickingView from "@/components/DailyPickingView";
import EventLogsView from "@/components/EventLogsView";
import WorkerAnalytics from "@/components/WorkerAnalytics";
import SkuErrorsView from "@/components/SkuErrorsView";
import NotFound from "@/pages/not-found";
import * as api from "@/lib/api";
import type { InventoryItem } from "@shared/schema";

function AppContent() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<{ id: string; name: string; role: "admin" | "worker" } | null>(null);

  const { data: inventory = [], refetch: refetchInventory } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    queryFn: api.getAllInventory,
    enabled: !!user,
  });

  const { data: warehouseLoading = [] } = useQuery({
    queryKey: ["/api/warehouse/loading"],
    queryFn: api.getWarehouseLoading,
    enabled: !!user,
  });

  const { data: users = [], refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: api.getAllUsers,
    enabled: !!user && user.role === "admin",
  });

  const loginMutation = useMutation({
    mutationFn: ({ login, password }: { login: string; password: string }) =>
      api.login(login, password),
    onSuccess: (data) => {
      setUser({
        id: data.user.id,
        name: data.user.name,
        role: data.user.role as "admin" | "worker",
      });
      setLocation("/"); // Navigate to home page after successful login
      toast({
        title: "Вход выполнен",
        description: `Добро пожаловать, ${data.user.name}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка входа",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: (data: {
      productId?: string;
      name?: string;
      sku: string;
      location: string;
      quantity: number;
      barcode?: string;
    }) =>
      api.createInventoryItem(data),
    onSuccess: () => {
      refetchInventory();
      toast({
        title: "Товар добавлен",
        description: "Товар успешно добавлен в инвентарь",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error("CSV file is empty");
      }

      // Detect delimiter: semicolon or comma
      const delimiter = lines[0].includes(";") ? ";" : ",";

      // Parse header to determine columns
      const header = lines[0].toLowerCase().split(delimiter).map(h => h.trim());
      
      // Try to find column indexes by name, or use position as fallback
      let productIdIndex = header.findIndex(h => h.includes("id") || h.includes("productid"));
      let nameIndex = header.findIndex(h => h.includes("name") || h.includes("название"));
      let skuIndex = header.findIndex(h => h.includes("sku"));
      let locationIndex = header.findIndex(h => (h.includes("location") || h.includes("локация")) && !h.includes("sku"));
      let quantityIndex = header.findIndex(h => h.includes("quantity") || h.includes("количество"));
      let barcodeIndex = header.findIndex(h => h.includes("barcode") || h.includes("штрихкод"));

      // Fallback: if columns not found by name (encoding issues), use standard positions
      // Standard format: ID товара; название; SKU; количество; штрихкод
      if (productIdIndex === -1 && header.length >= 5) productIdIndex = 0;
      if (nameIndex === -1 && header.length >= 5) nameIndex = 1;
      if (skuIndex === -1 && header.length >= 5) skuIndex = 2;
      if (quantityIndex === -1 && header.length >= 5) quantityIndex = 3;
      if (barcodeIndex === -1 && header.length >= 5) barcodeIndex = 4;

      // Helper function to extract location from SKU
      const extractLocation = (sku: string): string => {
        if (!sku) return "";
        
        // Pattern: Letter + 1-3 digits (e.g., A101, B23, C1)
        // Everything before the first dash is the location
        const match = sku.match(/^([A-Z]\d{1,3})/);
        
        if (match) {
          // Found standard format: return letter + digits part
          return match[1];
        }
        
        // No standard format found: return the whole SKU as location
        return sku;
      };

      const items = lines.slice(1).map(line => {
        const parts = line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, '')); // Remove quotes
        
        const productId = productIdIndex >= 0 && parts[productIdIndex] ? parts[productIdIndex] : undefined;
        const name = nameIndex >= 0 && parts[nameIndex] ? parts[nameIndex] : undefined;
        const sku = skuIndex >= 0 && parts[skuIndex] ? parts[skuIndex].toUpperCase() : "";
        
        // Extract location from SKU using the pattern
        let location = "";
        if (locationIndex >= 0 && parts[locationIndex]) {
          // If CSV has location column, use it
          location = parts[locationIndex].toUpperCase();
        } else if (sku) {
          // Extract location from SKU
          location = extractLocation(sku);
        }
        
        const quantity = quantityIndex >= 0 && parts[quantityIndex] ? parseInt(parts[quantityIndex]) || 1 : 1;
        const barcode = barcodeIndex >= 0 && parts[barcodeIndex] ? parts[barcodeIndex] : undefined;

        return {
          productId,
          name,
          sku,
          location,
          quantity,
          barcode,
        };
      }).filter(item => item.sku); // Only require SKU

      console.log("[CSV PARSE] Delimiter:", delimiter);
      console.log("[CSV PARSE] Header:", header);
      console.log("[CSV PARSE] Indexes:", { productIdIndex, nameIndex, skuIndex, locationIndex, quantityIndex, barcodeIndex });
      console.log("[CSV PARSE] Total items:", items.length);
      console.log("[CSV PARSE] First 3 items:", items.slice(0, 3));

      return api.bulkUploadInventory(items);
    },
    onSuccess: (result) => {
      refetchInventory();
      toast({
        title: "Загрузка завершена",
        description: `Новых: ${result.success}, Обновлено: ${result.updated}, Ошибок: ${result.errors}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (userData: { name: string; login: string; password: string; role: "admin" | "worker" }) =>
      api.createUser(userData),
    onSuccess: () => {
      refetchUsers();
      toast({
        title: "Пользователь создан",
        description: "Новый пользователь успешно добавлен",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.deleteUser(userId),
    onSuccess: () => {
      refetchUsers();
      toast({
        title: "Пользователь удален",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      api.updateUserPassword(userId, password),
    onSuccess: () => {
      toast({
        title: "Пароль изменен",
        description: "Пароль пользователя успешно обновлен",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = (login: string, password: string) => {
    loginMutation.mutate({ login, password });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };

  const handleStockIn = (data: any) => {
    createItemMutation.mutate(data);
  };

  const handleCSVUpload = async (file: File) => {
    return bulkUploadMutation.mutateAsync(file);
  };

  const handleCreateUser = (userData: any) => {
    createUserMutation.mutate(userData);
  };

  const handleDeleteUser = (userId: string) => {
    deleteUserMutation.mutate(userId);
  };

  const handleUpdatePassword = (userId: string, password: string) => {
    updatePasswordMutation.mutate({ userId, password });
  };

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <AppLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <Switch>
        <Route path="/" data-testid="route-home">
          <div className="space-y-6" data-testid="dashboard-content">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-welcome">Добро пожаловать, {user.name}!</h1>
              <p className="text-muted-foreground">
                Выберите раздел в меню для начала работы
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card p-6 rounded-md border" data-testid="card-inventory-count">
                <h3 className="text-lg font-semibold mb-2">Товаров в наличии</h3>
                <p className="text-3xl font-bold text-primary">{inventory.length}</p>
              </div>
              <div className="bg-card p-6 rounded-md border" data-testid="card-locations-count">
                <h3 className="text-lg font-semibold mb-2">Локаций</h3>
                <p className="text-3xl font-bold text-primary">{warehouseLoading.length}</p>
              </div>
              <div className="bg-card p-6 rounded-md border" data-testid="card-users-count">
                <h3 className="text-lg font-semibold mb-2">Пользователей</h3>
                <p className="text-3xl font-bold text-primary">{users.length}</p>
              </div>
            </div>
          </div>
        </Route>
        <Route path="/stock-in">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Приход товара</h1>
            <StockInForm onSubmit={handleStockIn} />
          </div>
        </Route>
        <Route path="/bulk-upload">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Массовая загрузка</h1>
            <CSVUploader onUpload={handleCSVUpload} />
          </div>
        </Route>
        <Route path="/inventory">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Инвентаризация</h1>
            <InventoryTable items={inventory} />
          </div>
        </Route>
        <Route path="/warehouse">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Загрузка склада</h1>
            <WarehouseLoadingView locationGroups={warehouseLoading} userRole={user.role} />
          </div>
        </Route>
        {user.role === "admin" && (
          <Route path="/users">
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Управление пользователями</h1>
              <UserManagementPanel
                users={users}
                onCreateUser={handleCreateUser}
                onDeleteUser={handleDeleteUser}
                onUpdatePassword={handleUpdatePassword}
                isUpdatingPassword={updatePasswordMutation.isPending}
              />
            </div>
          </Route>
        )}
        <Route path="/stock-out">
          <StockOutView user={user} />
        </Route>
        <Route path="/picking">
          <DailyPickingView />
        </Route>
        <Route path="/sku-errors">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Ошибки SKU</h1>
            <SkuErrorsView />
          </div>
        </Route>
        <Route path="/analytics">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">Аналитика работников</h1>
            <WorkerAnalytics />
          </div>
        </Route>
        <Route path="/logs">
          <EventLogsView users={users} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
