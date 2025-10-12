import { ReactNode } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  const workerMenuItems = [
    { title: "Приход товара", url: "/stock-in", icon: PackagePlus },
    { title: "Массовая загрузка", url: "/bulk-upload", icon: Upload },
    { title: "Сборка/Списание", url: "/stock-out", icon: PackageMinus },
    { title: "Picking List", url: "/picking", icon: ClipboardList },
    { title: "Инвентаризация", url: "/inventory", icon: Package },
    { title: "Загрузка склада", url: "/warehouse", icon: Warehouse },
  ];

  const adminMenuItems = [
    { title: "SKU Errors", url: "/sku-errors", icon: AlertCircle },
    { title: "Аналитика", url: "/analytics", icon: BarChart3 },
    { title: "Логи событий", url: "/logs", icon: FileText },
    { title: "Пользователи", url: "/users", icon: Users },
  ];

  const allMenuItems = userRole === "admin" 
    ? [...workerMenuItems, ...adminMenuItems]
    : workerMenuItems;

  const sidebarStyle = {
    "--sidebar-width": "16rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-base font-bold px-4 py-3">
                Складская Система
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {allMenuItems.map((item) => (
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
