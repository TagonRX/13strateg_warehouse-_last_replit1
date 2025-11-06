import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, RefreshCw, FileText, AlertCircle } from "lucide-react";
import type { ImportRun } from "@shared/schema";

export default function ImportHistory() {
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState<number>(50);

  const queryParams = new URLSearchParams();
  if (sourceTypeFilter && sourceTypeFilter !== "all") {
    queryParams.append("sourceType", sourceTypeFilter);
  }
  queryParams.append("limit", limit.toString());
  
  const { data: importRuns = [], isLoading, refetch, isFetching } = useQuery<ImportRun[]>({
    queryKey: [`/api/import-runs?${queryParams.toString()}`],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "default";
      case "FAILED":
        return "destructive";
      case "PARTIAL":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getSourceTypeBadge = (sourceType: string) => {
    return sourceType === "scheduler" ? "secondary" : "default";
  };

  const formatDuration = (duration: number | null) => {
    if (!duration) return "—";
    if (duration < 1000) return `${duration}мс`;
    return `${(duration / 1000).toFixed(1)}с`;
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              История импортов CSV
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-imports"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Тип импорта</label>
              <Select
                value={sourceTypeFilter}
                onValueChange={setSourceTypeFilter}
                data-testid="select-source-type"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все типы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="manual">Ручной</SelectItem>
                  <SelectItem value="scheduler">Автоматический</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-sm font-medium mb-2 block">Показать</label>
              <Select
                value={limit.toString()}
                onValueChange={(val) => setLimit(parseInt(val))}
                data-testid="select-limit"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата и время</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Всего строк</TableHead>
                  <TableHead className="text-right">С Item ID</TableHead>
                  <TableHead className="text-right">Без Item ID</TableHead>
                  <TableHead className="text-right">Создано</TableHead>
                  <TableHead className="text-right">Обновлено</TableHead>
                  <TableHead className="text-right">Ошибки</TableHead>
                  <TableHead className="text-right">Изм. кол-ва</TableHead>
                  <TableHead className="text-right">Время</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : importRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      <p>История импортов пуста</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  importRuns.map((run) => {
                    const totalUpdated = run.updatedAllFields + run.updatedQuantityOnly + run.updatedPartial;
                    const hasErrors = run.errors > 0;
                    
                    return (
                      <TableRow 
                        key={run.id}
                        data-testid={`row-import-${run.id}`}
                        className={hasErrors ? "bg-destructive/5 hover:bg-destructive/10" : ""}
                      >
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {formatDate(run.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getSourceTypeBadge(run.sourceType)} data-testid={`badge-type-${run.id}`}>
                            {run.sourceType === "scheduler" ? "Авто" : "Ручной"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={run.sourceRef || ""}>
                          {run.sourceRef || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(run.status)} data-testid={`badge-status-${run.id}`}>
                            {run.status === "SUCCESS" ? "Успех" : run.status === "FAILED" ? "Ошибка" : "Частично"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.rowsTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.rowsWithId.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.rowsWithoutId.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                          {run.created > 0 ? `+${run.created.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-600 dark:text-blue-400">
                          {totalUpdated > 0 ? totalUpdated.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {hasErrors ? (
                            <span className="text-destructive flex items-center justify-end gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {run.errors.toLocaleString()}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.totalQuantityChange !== 0 ? (
                            <span className={run.totalQuantityChange > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                              {run.totalQuantityChange > 0 ? "+" : ""}{run.totalQuantityChange.toLocaleString()}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatDuration(run.duration)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {importRuns.length > 0 && (
            <div className="text-sm text-muted-foreground text-center">
              Показано {importRuns.length} записей
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
