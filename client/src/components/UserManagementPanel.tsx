import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Key, Eye, EyeOff, Edit } from "lucide-react";

interface User {
  id: string;
  name: string;
  login: string;
  role: "admin" | "worker";
}

interface UserManagementPanelProps {
  users: User[];
  onCreateUser: (user: { name: string; login: string; password: string; role: "admin" | "worker" }) => void;
  onDeleteUser: (userId: string) => void;
  onUpdatePassword: (userId: string, password: string) => void;
  onUpdateName: (userId: string, name: string) => void;
  onUpdateLogin: (userId: string, login: string) => void;
  isUpdatingPassword?: boolean;
  isUpdatingName?: boolean;
  isUpdatingLogin?: boolean;
}

export default function UserManagementPanel({ users, onCreateUser, onDeleteUser, onUpdatePassword, onUpdateName, onUpdateLogin, isUpdatingPassword = false, isUpdatingName = false, isUpdatingLogin = false }: UserManagementPanelProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "worker">("worker");
  const [showPassword, setShowPassword] = useState(false);
  
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [editingLogin, setEditingLogin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateUser({ name, login, password, role });
    setName("");
    setLogin("");
    setPassword("");
    setRole("worker");
    setOpen(false);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserId) {
      onUpdatePassword(selectedUserId, newPassword);
      setNewPassword("");
      setSelectedUserId(null);
      setPasswordDialogOpen(false);
    }
  };

  const openPasswordDialog = (userId: string) => {
    setSelectedUserId(userId);
    setPasswordDialogOpen(true);
  };

  const handleNameChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserId && editingName.trim()) {
      onUpdateName(selectedUserId, editingName.trim());
      setEditingName("");
      setSelectedUserId(null);
      setNameDialogOpen(false);
    }
  };

  const openNameDialog = (userId: string, currentName: string) => {
    setSelectedUserId(userId);
    setEditingName(currentName);
    setNameDialogOpen(true);
  };

  const handleLoginChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserId && editingLogin.trim()) {
      onUpdateLogin(selectedUserId, editingLogin.trim());
      setEditingLogin("");
      setSelectedUserId(null);
      setLoginDialogOpen(false);
    }
  };

  const openLoginDialog = (userId: string, currentLogin: string) => {
    setSelectedUserId(userId);
    setEditingLogin(currentLogin);
    setLoginDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Управление пользователями</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                Добавить пользователя
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Новый пользователь</DialogTitle>
                  <DialogDescription>
                    Создайте нового работника или администратора
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Имя</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Иван Петров"
                      required
                      data-testid="input-user-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login">Логин</Label>
                    <Input
                      id="login"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="ivan.petrov"
                      required
                      data-testid="input-user-login"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Пароль</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="********"
                        required
                        data-testid="input-user-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-create-password"
                        aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                        title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Роль</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "admin" | "worker")}>
                      <SelectTrigger id="role" data-testid="select-user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="worker">Работник</SelectItem>
                        <SelectItem value="admin">Администратор</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="button-create-user">
                    Создать
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Логин</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead className="w-[200px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="font-mono text-sm">{user.login}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? "Администратор" : "Работник"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openNameDialog(user.id, user.name)}
                        data-testid={`button-edit-name-${user.id}`}
                        title="Редактировать имя"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLoginDialog(user.id, user.login)}
                        data-testid={`button-edit-login-${user.id}`}
                        title="Редактировать логин"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPasswordDialog(user.id)}
                        data-testid={`button-change-password-${user.id}`}
                        title="Изменить пароль"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteUser(user.id)}
                        data-testid={`button-delete-${user.id}`}
                        title="Удалить пользователя"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <form onSubmit={handlePasswordChange}>
            <DialogHeader>
              <DialogTitle>Изменить пароль</DialogTitle>
              <DialogDescription>
                Введите новый пароль для пользователя
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Новый пароль</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="********"
                    minLength={6}
                    required
                    data-testid="input-new-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    data-testid="button-toggle-reset-password"
                    aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                    title={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="button-save-password" disabled={isUpdatingPassword}>
                {isUpdatingPassword ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent>
          <form onSubmit={handleNameChange}>
            <DialogHeader>
              <DialogTitle>Редактировать имя</DialogTitle>
              <DialogDescription>
                Введите новое имя для пользователя
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Имя</Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="Иван Петров"
                  required
                  data-testid="input-edit-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="button-save-name" disabled={isUpdatingName}>
                {isUpdatingName ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <form onSubmit={handleLoginChange}>
            <DialogHeader>
              <DialogTitle>Редактировать логин</DialogTitle>
              <DialogDescription>
                Введите новый логин для пользователя
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-login">Логин</Label>
                <Input
                  id="edit-login"
                  type="text"
                  value={editingLogin}
                  onChange={(e) => setEditingLogin(e.target.value)}
                  placeholder="ivan.petrov"
                  required
                  data-testid="input-edit-login"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="button-save-login" disabled={isUpdatingLogin}>
                {isUpdatingLogin ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
