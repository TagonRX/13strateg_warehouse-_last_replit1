import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Calendar, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EventLog, User } from "@shared/schema";

interface EventLogsViewProps {
  users: User[];
}

export default function EventLogsView({ users }: EventLogsViewProps) {
  const [pageLimit, setPageLimit] = useState<string>("100");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const queryParams = new URLSearchParams();
  queryParams.set("limit", pageLimit === "all" ? "10000" : pageLimit);
  if (search) queryParams.set("search", search);
  if (selectedUser !== "all") queryParams.set("userId", selectedUser);
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data: logs = [], isLoading } = useQuery<EventLog[]>({
    queryKey: [`/api/logs?${queryParams.toString()}`],
  });

  const getUserName = (userId: string | null) => {
    if (!userId) return "Система";
    const user = users.find(u => u.id === userId);
    return user?.name || "Неизвестно";
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      LOGIN: "outline",
      STOCK_IN: "default",
      STOCK_OUT: "secondary",
      CSV_UPLOAD: "default",
      PICKING_LIST_CREATED: "default",
      ITEM_PICKED: "secondary",
      LOCATION_DELETED: "destructive",
    };
    return variants[action] || "outline";
  };

  const formatDateForCSV = (dateString: string | Date) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  };

  const escapeCSVValue = (value: string | null | undefined): string => {
    if (!value) return "-";
    const stringValue = String(value);
    if (stringValue.includes(';') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const exportToCSV = () => {
    if (logs.length === 0) return;

    setIsExporting(true);

    try {
      const headers = ["Дата", "Работник", "Действие", "ID товара", "Название", "SKU", "Локация", "Детали"];
      const csvRows = [headers.join(";")];

      logs.forEach(log => {
        const row = [
          formatDateForCSV(log.createdAt),
          escapeCSVValue(getUserName(log.userId)),
          escapeCSVValue(log.action),
          escapeCSVValue(log.productId),
          escapeCSVValue(log.itemName),
          escapeCSVValue(log.sku),
          escapeCSVValue(log.location),
          escapeCSVValue(log.details)
        ];
        csvRows.push(row.join(";"));
      });

      const csvContent = csvRows.join("\n");
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const filename = `logs_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Экспорт завершен",
        description: `Экспортировано записей: ${logs.length}`,
      });
    } catch (error) {
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось экспортировать логи",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Логи событий</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по SKU, ID, названию..."
              className="pl-10"
              data-testid="input-search-logs"
            />
          </div>

          {/* Worker Filter */}
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger data-testid="select-user-filter">
              <SelectValue placeholder="Все работники" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все работники</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Filters */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="pl-10"
              data-testid="input-start-date"
            />
          </div>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="pl-10"
              data-testid="input-end-date"
            />
          </div>
        </div>

        {/* Page Limit and Export */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={logs.length === 0 || isExporting}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Экспортируется..." : "Экспорт в CSV"}
          </Button>
          <Select value={pageLimit} onValueChange={setPageLimit}>
            <SelectTrigger data-testid="select-logs-page-limit" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата и время</TableHead>
                <TableHead>Работник</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>ID товара</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Локация</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Логи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  // Определяем цветовое выделение: красное для isWarning, желтое для withoutTest
                  const rowClassName = log.isWarning 
                    ? "bg-destructive/10 hover:bg-destructive/15" 
                    : log.withoutTest 
                      ? "bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/30" 
                      : "";
                  
                  return (
                    <TableRow 
                      key={log.id} 
                      data-testid={`row-log-${log.id}`}
                      className={rowClassName}
                    >
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell data-testid={`text-user-${log.id}`}>
                        {getUserName(log.userId)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={log.isWarning ? "destructive" : getActionBadge(log.action)} 
                          data-testid={`badge-action-${log.id}`}
                        >
                          {log.action}
                        </Badge>
                        {log.withoutTest && (
                          <Badge 
                            variant="outline" 
                            className="ml-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700"
                            data-testid={`badge-without-test-${log.id}`}
                          >
                            БЕЗ ТЕСТА
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-product-id-${log.id}`}>
                        {log.productId || "-"}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-item-name-${log.id}`}>
                        {log.itemName || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-sku-${log.id}`}>
                        {log.sku || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-location-${log.id}`}>
                        {log.location || "-"}
                      </TableCell>
                      <TableCell className={`text-sm ${log.isWarning ? "font-semibold text-destructive" : ""}`} data-testid={`text-details-${log.id}`}>
                        {log.details}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {logs.length > 0 && (
          <div className="text-sm text-muted-foreground text-center">
            Показано: {logs.length} {logs.length === 1 ? "запись" : logs.length < 5 ? "записи" : "записей"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
