import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle } from "lucide-react";

interface LocationGroup {
  location: string;
  skuCount: number;
  items: {
    sku: string;
    name: string;
    quantity: number;
  }[];
}

interface WarehouseLoadingViewProps {
  locationGroups: LocationGroup[];
}

export default function WarehouseLoadingView({ locationGroups }: WarehouseLoadingViewProps) {
  const getLoadingStatus = (skuCount: number) => {
    if (skuCount >= 4) return { color: "destructive", icon: AlertCircle, label: "Перегрузка" };
    if (skuCount === 3) return { color: "warning", icon: AlertTriangle, label: "Предупреждение" };
    return { color: "success", icon: null, label: "Норма" };
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locationGroups.map((group) => {
          const status = getLoadingStatus(group.skuCount);
          const StatusIcon = status.icon;

          return (
            <Card
              key={group.location}
              className={
                status.color === "destructive"
                  ? "border-destructive"
                  : status.color === "warning"
                  ? "border-warning"
                  : ""
              }
              data-testid={`card-location-${group.location}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-mono">{group.location}</CardTitle>
                  <div className="flex items-center gap-2">
                    {StatusIcon && <StatusIcon className="w-4 h-4" />}
                    <Badge
                      variant={
                        status.color === "destructive"
                          ? "destructive"
                          : status.color === "warning"
                          ? "outline"
                          : "outline"
                      }
                      className={
                        status.color === "warning" ? "bg-warning/10 text-warning-foreground" : ""
                      }
                    >
                      {group.skuCount} SKU
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate">{item.name}</span>
                      <span className="font-medium ml-2">{item.quantity} шт</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Легенда загрузки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-success/10">
              1-2 SKU
            </Badge>
            <span className="text-sm text-muted-foreground">Нормальная загрузка</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-warning/10">
              3 SKU
            </Badge>
            <span className="text-sm text-muted-foreground">Предупреждение</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">4+ SKU</Badge>
            <span className="text-sm text-muted-foreground">Перегрузка локации</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
