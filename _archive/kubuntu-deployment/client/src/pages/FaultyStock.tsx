import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { FaultyStock, User } from "@shared/schema";
import { getCurrentUser } from "@/lib/api";

export default function FaultyStockPage() {
  const { toast } = useToast();

  // Fetch faulty stock
  const { data: faultyStock = [], isLoading } = useQuery<FaultyStock[]>({
    queryKey: ["/api/faulty-stock"],
  });

  // Fetch users for displaying names
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Get current user to check admin rights
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getCurrentUser,
  });

  const isAdmin = currentUser?.role === "admin";

  // Split data by condition
  const faultyItems = faultyStock.filter(item => item.condition === "Faulty");
  const partsItems = faultyStock.filter(item => item.condition === "Parts");

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown";
  };

  const formatWorkingHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
      return `${mins}м`;
    }
    
    if (mins === 0) {
      return `${hours}ч`;
    }
    
    return `${hours}ч ${mins}м`;
  };

  // Delete single item mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/faulty-stock/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faulty-stock"] });
      toast({
        title: "Успешно",
        description: "Товар удален",
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

  // Delete all items by condition mutation
  const deleteAllMutation = useMutation({
    mutationFn: async (condition: string) => {
      const res = await apiRequest("DELETE", `/api/faulty-stock/all/${condition}`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/faulty-stock"] });
      toast({
        title: "Успешно",
        description: `Удалено товаров: ${data.count}`,
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

  // Calculate statistics
  const totalFaulty = faultyItems.length;
  const totalParts = partsItems.length;
  const totalItems = faultyStock.length;
  const avgWorkingMinutes = totalItems > 0
    ? Math.round(faultyStock.reduce((sum, item) => sum + item.workingHours, 0) / totalItems)
    : 0;

  const renderTable = (items: FaultyStock[], title: string, icon: React.ReactNode, condition: string) => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {isAdmin && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  data-testid={`button-delete-all-${condition.toLowerCase()}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить все
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие удалит все товары из таблицы "{title}" ({items.length} шт.). 
                    Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => deleteAllMutation.mutate(condition)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Удалить все
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Загрузка...</p>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Нет товаров</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Штрихкод</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Начало тестирования</TableHead>
                  <TableHead>Начал</TableHead>
                  <TableHead>Решение принято</TableHead>
                  <TableHead>Принял решение</TableHead>
                  <TableHead className="text-right">Рабочие часы</TableHead>
                  {isAdmin && <TableHead className="text-center">Действия</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`${condition.toLowerCase()}-${item.barcode}`}>
                    <TableCell className="font-mono">{item.barcode}</TableCell>
                    <TableCell>{item.sku || "-"}</TableCell>
                    <TableCell>{item.name || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(item.firstScanAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getUserName(item.firstScanBy)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(item.decisionAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getUserName(item.decisionBy)}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`working-hours-${item.barcode}`}>
                      {formatWorkingHours(item.workingHours)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(item.id)}
                          data-testid={`button-delete-${item.barcode}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      <h1 className="text-2xl font-semibold">Браковка товары</h1>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего брака
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-all">{totalItems}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faulty товары
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-faulty">{totalFaulty}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Parts товары
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-parts">{totalParts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Среднее время тестирования
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-avg-time">
              {formatWorkingHours(avgWorkingMinutes)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Faulty Table */}
      {renderTable(faultyItems, "Faulty товары", <AlertTriangle className="w-5 h-5 text-destructive" />, "Faulty")}

      {/* Parts Table */}
      {renderTable(partsItems, "Parts товары", <Package className="w-5 h-5 text-primary" />, "Parts")}
    </div>
  );
}
