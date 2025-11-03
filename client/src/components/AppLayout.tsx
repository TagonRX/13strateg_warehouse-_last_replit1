import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Package,
  PackagePlus,
  Upload,
  PackageMinus,
  ClipboardList,
  BarChart3,
  FileText,
  Users,
  Warehouse,
  AlertCircle,
  LogOut,
  TestTube2,
  AlertTriangle,
  Smartphone,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { SkuError } from "@shared/schema";

interface AppLayoutProps {
  children: ReactNode;
  userRole?: "admin" | "worker";
  userName?: string;
  onLogout?: () => void;
}

export default function AppLayout({ 
  children, 
  userRole = "worker",
  userName = "Пользователь",
  onLogout 
}: AppLayoutProps) {
  const [location] = useLocation();
  const [skuErrorsViewed, setSkuErrorsViewed] = useState(false);

  // Fetch unresolved SKU errors count
  const { data: skuErrors = [], isFetched } = useQuery<SkuError[]>({
    queryKey: ["/api/sku-errors"],
    enabled: userRole === "admin",
  });

  const unresolvedCount = skuErrors.filter((error) => error.status === "PENDING").length;
  
  // Restore viewed state from localStorage when data is fetched
  useEffect(() => {
    // Only run after data is fetched
    if (!isFetched) return;
    
    if (unresolvedCount === 0) {
      setSkuErrorsViewed(true);
      return;
    }
    
    const lastViewed = localStorage.getItem("sku-errors-last-viewed");
    if (!lastViewed) {
      // No last viewed timestamp - treat as unseen
      setSkuErrorsViewed(false);
      return;
    }
    
    const lastViewedTime = parseInt(lastViewed);
    if (isNaN(lastViewedTime)) {
      // Invalid timestamp - treat as unseen and clear bad data
      localStorage.removeItem("sku-errors-last-viewed");
      setSkuErrorsViewed(false);
      return;
    }
    
    const hasNewerErrors = skuErrors.some((error) => {
      if (error.status !== "PENDING") return false;
      const errorTime = new Date(error.createdAt).getTime();
      // Treat errors with invalid timestamp as new (always show badge)
      if (isNaN(errorTime)) return true;
      return errorTime > lastViewedTime;
    });
    
    // If all errors are older than last visit, mark as viewed
    setSkuErrorsViewed(!hasNewerErrors);
  }, [skuErrors, unresolvedCount, isFetched]);
  
  const hasUnresolvedErrors = unresolvedCount > 0 && !skuErrorsViewed;

  // Mark SKU errors as viewed when user visits the page
  useEffect(() => {
    if (location === "/sku-errors" && unresolvedCount > 0) {
      setSkuErrorsViewed(true);
      localStorage.setItem("sku-errors-last-viewed", Date.now().toString());
    }
  }, [location, unresolvedCount]);

  const workerMenuItems = [
    { title: "Тестирование товара", url: "/product-testing", icon: TestTube2 },
    { title: "Приёмка товара", url: "/stock-in", icon: PackagePlus },
    { title: "Размещение товара", url: "/placement", icon: Warehouse },
    { title: "Сборка/Списание", url: "/stock-out", icon: PackageMinus },
    { title: "Picking List", url: "/picking", icon: ClipboardList },
    { title: "Подготовка заказов", url: "/dispatch", icon: Package },
    { title: "Упаковка заказов", url: "/packing", icon: PackageCheck },
    { title: "Инвентаризация", url: "/inventory", icon: Package },
    { title: "Загрузка склада", url: "/warehouse", icon: Warehouse },
    { title: "Режим сканера", url: "/scanner-mode", icon: Smartphone },
  ];

  const adminMenuItems = [
    { title: "Пользователи", url: "/users", icon: Users },
    { title: "Массовая загрузка", url: "/bulk-upload", icon: Upload },
    { title: "Бракованные товары", url: "/faulty-stock", icon: AlertTriangle },
    { title: "Логи событий", url: "/logs", icon: FileText },
    { title: "SKU Errors", url: "/sku-errors", icon: AlertCircle, showBadge: hasUnresolvedErrors },
    { title: "Аналитика", url: "/analytics", icon: BarChart3 },
  ];

  const sidebarStyle = {
    "--sidebar-width": "16rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider defaultOpen={true} style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <div className="px-4 py-3">
                <Link 
                  href="/" 
                  data-testid="link-home"
                  className="text-base font-bold block hover-elevate rounded-md px-2 py-1"
                >
                  Складская Система
                </Link>
              </div>
              <SidebarGroupContent>
                <SidebarMenu>
                  {workerMenuItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={location === item.url}>
                        <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {userRole === "admin" && (
              <>
                <SidebarSeparator className="my-2" />
                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs text-muted-foreground px-4 py-2">
                    Администрирование
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {adminMenuItems.map((item) => (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                              {item.showBadge && (
                                <AlertCircle className="w-4 h-4 text-destructive ml-auto" data-testid="badge-sku-errors-alert" />
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </SidebarContent>
        </Sidebar>
        
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <span className="font-medium">{userName}</span>
                <Badge variant={userRole === "admin" ? "default" : "secondary"} data-testid="badge-role">
                  {userRole === "admin" ? "Администратор" : "Работник"}
                </Badge>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </header>
          
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
