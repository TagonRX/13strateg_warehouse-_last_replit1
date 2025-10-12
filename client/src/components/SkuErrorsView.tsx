import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, X, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SkuError } from "@shared/schema";

export default function SkuErrorsView() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correctedSku, setCorrectedSku] = useState("");

  const { data: errors = [], isLoading } = useQuery<SkuError[]>({
    queryKey: ["/api/sku-errors"],
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, correctedSku }: { id: string; correctedSku: string }) => {
      await apiRequest("POST", `/api/sku-errors/${id}/resolve`, { correctedSku });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sku-errors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setEditingId(null);
      setCorrectedSku("");
      toast({
        title: "SKU исправлен",
        description: "Товар добавлен в инвентарь с правильным SKU",
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sku-errors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sku-errors"] });
      toast({
        title: "Ошибка удалена",
        description: "Запись об ошибке SKU удалена",
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

  const handleEdit = (error: SkuError) => {
    setEditingId(error.id);
    setCorrectedSku(error.csvSku);
  };

  const handleSave = (id: string) => {
    if (!correctedSku.trim()) {
      toast({
        title: "Ошибка",
        description: "SKU не может быть пустым",
        variant: "destructive",
      });
      return;
    }
    resolveMutation.mutate({ id, correctedSku: correctedSku.trim() });
  };

  const handleCancel = () => {
    setEditingId(null);
    setCorrectedSku("");
  };

  const handleDelete = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить эту запись?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-destructive" />
          Ошибки SKU
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Загрузка...
          </div>
        ) : errors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет ошибок SKU
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID товара</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>SKU в системе</TableHead>
                  <TableHead>SKU из CSV</TableHead>
                  <TableHead className="text-center">Количество</TableHead>
                  <TableHead>Штрихкод</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((error) => (
                  <TableRow key={error.id} data-testid={`row-sku-error-${error.id}`}>
                    <TableCell className="font-mono text-sm" data-testid={`text-product-id-${error.id}`}>
                      {error.productId}
                    </TableCell>
                    <TableCell data-testid={`text-name-${error.id}`}>
                      {error.name}
                    </TableCell>
                    <TableCell data-testid={`text-existing-sku-${error.id}`}>
                      <Badge variant="outline">{error.existingSku}</Badge>
                    </TableCell>
                    <TableCell data-testid={`text-csv-sku-${error.id}`}>
                      {editingId === error.id ? (
                        <Input
                          value={correctedSku}
                          onChange={(e) => setCorrectedSku(e.target.value)}
                          className="w-32"
                          data-testid={`input-corrected-sku-${error.id}`}
                        />
                      ) : (
                        <Badge variant="destructive">{error.csvSku}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-quantity-${error.id}`}>
                      {error.quantity}
                    </TableCell>
                    <TableCell className="font-mono text-sm" data-testid={`text-barcode-${error.id}`}>
                      {error.barcode || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === error.id ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSave(error.id)}
                            disabled={resolveMutation.isPending}
                            data-testid={`button-save-${error.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Сохранить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                            data-testid={`button-cancel-${error.id}`}
                          >
                            Отмена
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleEdit(error)}
                            data-testid={`button-edit-${error.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Исправить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(error.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${error.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && errors.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p>Всего ошибок: {errors.length}</p>
            <p className="mt-1">
              При исправлении SKU товар будет добавлен в инвентарь с правильными данными
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
