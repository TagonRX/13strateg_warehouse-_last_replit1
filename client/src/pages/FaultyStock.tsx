import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { FaultyStock, User } from "@shared/schema";

export default function FaultyStockPage() {
  // Fetch faulty stock
  const { data: faultyStock = [], isLoading } = useQuery<FaultyStock[]>({
    queryKey: ["/api/faulty-stock"],
  });

  // Fetch users for displaying names
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

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

  // Calculate statistics
  const totalItems = faultyStock.length;
  const avgWorkingMinutes = totalItems > 0
    ? Math.round(faultyStock.reduce((sum, item) => sum + item.workingHours, 0) / totalItems)
    : 0;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      <h1 className="text-2xl font-semibold">Бракованные товары (Faulty Stock)</h1>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего брака
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-faulty">{totalItems}</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Последний брак
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="stat-last-faulty">
              {faultyStock.length > 0
                ? format(new Date(faultyStock[faultyStock.length - 1].decisionAt), "dd.MM.yyyy HH:mm", { locale: ru })
                : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Faulty Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Бракованные товары
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Загрузка...</p>
          ) : faultyStock.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Нет бракованных товаров</p>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faultyStock.map((item) => (
                    <TableRow key={item.id} data-testid={`faulty-${item.barcode}`}>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
