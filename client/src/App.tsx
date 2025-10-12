import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginForm from "@/components/LoginForm";
import AppLayout from "@/components/AppLayout";
import StockInForm from "@/components/StockInForm";
import CSVUploader from "@/components/CSVUploader";
import InventoryTable from "@/components/InventoryTable";
import WarehouseLoadingView from "@/components/WarehouseLoadingView";
import UserManagementPanel from "@/components/UserManagementPanel";
import NotFound from "@/pages/not-found";

//todo: remove mock functionality - replace with real auth and data
function App() {
  const [user, setUser] = useState<{ name: string; role: "admin" | "worker" } | null>(null);
  const [inventoryItems, setInventoryItems] = useState([
    {
      id: "1",
      productId: "PROD001",
      name: "LED Bulb GU10 5W",
      sku: "A101",
      location: "A101-J",
      quantity: 25,
      barcode: "1234567890123",
      status: "IN_STOCK" as const,
    },
    {
      id: "2",
      productId: "PROD002",
      name: "Smart Switch Hub",
      sku: "A101",
      location: "A101-K",
      quantity: 10,
      barcode: "9876543210987",
      status: "IN_STOCK" as const,
    },
  ]);
  const [users, setUsers] = useState([
    { id: "1", name: "Админ", login: "admin", role: "admin" as const },
    { id: "2", name: "Работник", login: "worker", role: "worker" as const },
  ]);

  const handleLogin = (login: string, password: string) => {
    //todo: remove mock functionality - replace with real auth
    if (login === "admin") {
      setUser({ name: "Администратор", role: "admin" });
    } else {
      setUser({ name: "Работник", role: "worker" });
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleStockIn = (data: any) => {
    //todo: remove mock functionality - replace with API call
    const newItem = {
      id: String(inventoryItems.length + 1),
      productId: data.productId,
      name: data.name,
      sku: data.sku,
      location: data.sku,
      quantity: data.quantity,
      barcode: data.barcode,
      status: "IN_STOCK" as const,
    };
    setInventoryItems([...inventoryItems, newItem]);
    alert(`Товар добавлен: ${data.name}`);
  };

  const handleCSVUpload = async (file: File) => {
    //todo: remove mock functionality - replace with API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: 150, updated: 23, errors: 5 };
  };

  const handleCreateUser = (userData: any) => {
    //todo: remove mock functionality - replace with API call
    const newUser = {
      id: String(users.length + 1),
      ...userData,
    };
    setUsers([...users, newUser]);
  };

  const handleDeleteUser = (userId: string) => {
    //todo: remove mock functionality - replace with API call
    setUsers(users.filter(u => u.id !== userId));
  };

  //todo: remove mock functionality - calculate from real data
  const locationGroups = [
    {
      location: "A101",
      skuCount: 5,
      items: [
        { sku: "SKU-001", name: "LED Bulb", quantity: 10 },
        { sku: "SKU-002", name: "Smart Switch", quantity: 5 },
        { sku: "SKU-003", name: "USB Cable", quantity: 20 },
        { sku: "SKU-004", name: "Phone Case", quantity: 15 },
        { sku: "SKU-005", name: "Screen Protector", quantity: 8 },
      ],
    },
    {
      location: "B205",
      skuCount: 3,
      items: [
        { sku: "SKU-101", name: "Laptop Stand", quantity: 12 },
        { sku: "SKU-102", name: "Keyboard", quantity: 7 },
        { sku: "SKU-103", name: "Mouse Pad", quantity: 25 },
      ],
    },
  ];

  if (!user) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LoginForm onLogin={handleLogin} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
                    <p className="text-3xl font-bold text-primary">{inventoryItems.length}</p>
                  </div>
                  <div className="bg-card p-6 rounded-md border">
                    <h3 className="text-lg font-semibold mb-2">Локаций</h3>
                    <p className="text-3xl font-bold text-primary">{locationGroups.length}</p>
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
                <InventoryTable items={inventoryItems} />
              </div>
            </Route>
            <Route path="/warehouse">
              <div className="space-y-4">
                <h1 className="text-3xl font-bold">Загрузка склада</h1>
                <WarehouseLoadingView locationGroups={locationGroups} />
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
                  />
                </div>
              </Route>
            )}
            <Route path="/stock-out">
              <div className="bg-card p-8 rounded-md border text-center">
                <h2 className="text-2xl font-bold mb-4">Сборка/Списание</h2>
                <p className="text-muted-foreground">Функция в разработке</p>
              </div>
            </Route>
            <Route path="/picking">
              <div className="bg-card p-8 rounded-md border text-center">
                <h2 className="text-2xl font-bold mb-4">Daily Picking List</h2>
                <p className="text-muted-foreground">Функция в разработке</p>
              </div>
            </Route>
            <Route path="/sku-errors">
              <div className="bg-card p-8 rounded-md border text-center">
                <h2 className="text-2xl font-bold mb-4">SKU Errors</h2>
                <p className="text-muted-foreground">Функция в разработке</p>
              </div>
            </Route>
            <Route path="/analytics">
              <div className="bg-card p-8 rounded-md border text-center">
                <h2 className="text-2xl font-bold mb-4">Аналитика работников</h2>
                <p className="text-muted-foreground">Функция в разработке</p>
              </div>
            </Route>
            <Route path="/logs">
              <div className="bg-card p-8 rounded-md border text-center">
                <h2 className="text-2xl font-bold mb-4">Логи событий</h2>
                <p className="text-muted-foreground">Функция в разработке</p>
              </div>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
