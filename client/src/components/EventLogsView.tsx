import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar } from "lucide-react";
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

        {/* Page Limit */}
        <div className="flex justify-end">
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
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата и время</TableHead>
                <TableHead>Работник</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Логи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="font-mono text-sm">
                      {new Date(log.createdAt).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell data-testid={`text-user-${log.id}`}>
                      {getUserName(log.userId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadge(log.action)} data-testid={`badge-action-${log.id}`}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-details-${log.id}`}>
                      {log.details}
                    </TableCell>
                  </TableRow>
                ))
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
