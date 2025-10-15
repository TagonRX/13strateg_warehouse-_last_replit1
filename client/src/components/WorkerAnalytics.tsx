import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type SortColumn = 'userName' | 'login' | 'stockIn' | 'stockInCost' | 'stockOut' | 'stockOutCost' | 'csvUpload' | 'pickingListCreated' | 'itemPicked' | 'locationDeleted';
type SortDirection = 'asc' | 'desc' | null;

export default function WorkerAnalytics() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('day');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const { data: analytics = [], isLoading } = useQuery<Array<{
    userId: string;
    userName: string;
    login: number;
    stockIn: number;
    stockInCost: number;
    stockOut: number;
    stockOutCost: number;
    csvUpload: number;
    pickingListCreated: number;
    itemPicked: number;
    locationDeleted: number;
  }>>({
    queryKey: [`/api/analytics?period=${period}`],
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedAnalytics = useMemo(() => {
    if (!sortColumn || !sortDirection) return analytics;

    return [...analytics].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      const aNum = Number(aValue);
      const bNum = Number(bValue);
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [analytics, sortColumn, sortDirection]);

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-4 h-4" />;
    if (sortDirection === 'asc') return <ArrowUp className="w-4 h-4" />;
    return <ArrowDown className="w-4 h-4" />;
  };

  const getPeriodLabel = () => {
    switch(period) {
      case 'day': return 'За день';
      case 'week': return 'За неделю';
      case 'month': return 'За месяц';
      case 'all': return 'За все время';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle>Аналитика работников</CardTitle>
        <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
          <SelectTrigger className="w-[180px]" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">За день</SelectItem>
            <SelectItem value="week">За неделю</SelectItem>
            <SelectItem value="month">За месяц</SelectItem>
            <SelectItem value="all">За все время</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Загрузка...
          </div>
        ) : analytics.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет данных {getPeriodLabel().toLowerCase()}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('userName')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-userName"
                    >
                      Работник {getSortIcon('userName')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('login')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-login"
                    >
                      Входы {getSortIcon('login')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('stockIn')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-stockIn"
                    >
                      Добавлено {getSortIcon('stockIn')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('stockInCost')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-stockInCost"
                    >
                      Стоимость добавл. {getSortIcon('stockInCost')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('stockOut')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-stockOut"
                    >
                      Выдано {getSortIcon('stockOut')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('stockOutCost')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-stockOutCost"
                    >
                      Стоимость выдано {getSortIcon('stockOutCost')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('csvUpload')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-csvUpload"
                    >
                      CSV загрузка {getSortIcon('csvUpload')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('pickingListCreated')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-pickingListCreated"
                    >
                      Листов создано {getSortIcon('pickingListCreated')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('itemPicked')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-itemPicked"
                    >
                      Собрано {getSortIcon('itemPicked')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('locationDeleted')}
                      className="hover-elevate active-elevate-2"
                      data-testid="sort-locationDeleted"
                    >
                      Удалено локаций {getSortIcon('locationDeleted')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAnalytics.map((worker) => (
                  <TableRow key={worker.userId} data-testid={`row-worker-${worker.userId}`}>
                    <TableCell className="font-medium" data-testid={`text-worker-name-${worker.userId}`}>
                      {worker.userName}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-login-${worker.userId}`}>
                      {worker.login}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-stock-in-${worker.userId}`}>
                      {worker.stockIn}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-stock-in-cost-${worker.userId}`}>
                      {worker.stockInCost}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-stock-out-${worker.userId}`}>
                      {worker.stockOut}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-stock-out-cost-${worker.userId}`}>
                      {worker.stockOutCost}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-csv-upload-${worker.userId}`}>
                      {worker.csvUpload}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-picking-list-${worker.userId}`}>
                      {worker.pickingListCreated}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-item-picked-${worker.userId}`}>
                      {worker.itemPicked}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-location-deleted-${worker.userId}`}>
                      {worker.locationDeleted}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && analytics.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground text-center">
            Показано записей: {analytics.length}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
