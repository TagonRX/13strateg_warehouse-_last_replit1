import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";
import * as api from "@/lib/api";
import type { InventoryItem } from "@shared/schema";

function AppContent() {
  const { toast } = useToast();
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
      productId: string;
      name: string;
      sku: string;
      quantity: number;
      barcode?: string;
    }) =>
      api.createInventoryItem({
        ...data,
        location: data.sku,
      }),
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
      
      const items = lines.slice(1).map(line => {
        const parts = line.split(",").map(p => p.trim());
        return {
          productId: parts[0],
          name: parts[1],
          sku: parts[2],
          location: parts[2],
          quantity: parseInt(parts[3]) || 1,
          barcode: parts[4] || undefined,
        };
      }).filter(item => item.productId && item.name && item.sku);

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
        <Route path="/">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Добро пожаловать, {user.name}!</h1>
              <p className="text-muted-foreground">
                Выберите раздел в меню для начала работы
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card p-6 rounded-md border">
                <h3 className="text-lg font-semibold mb-2">Товаров в наличии</h3>
                <p className="text-3xl font-bold text-primary">{inventory.length}</p>
              </div>
              <div className="bg-card p-6 rounded-md border">
                <h3 className="text-lg font-semibold mb-2">Локаций</h3>
                <p className="text-3xl font-bold text-primary">{warehouseLoading.length}</p>
              </div>
              <div className="bg-card p-6 rounded-md border">
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
            <WarehouseLoadingView locationGroups={warehouseLoading} />
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
          <div className="bg-card p-8 rounded-md border text-center">
            <h2 className="text-2xl font-bold mb-4">SKU Errors</h2>
            <p className="text-muted-foreground">Функция в разработке</p>
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
