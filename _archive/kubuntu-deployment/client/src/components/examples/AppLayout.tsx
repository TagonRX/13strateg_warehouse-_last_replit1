import AppLayout from '../AppLayout';

export default function AppLayoutExample() {
  return (
    <AppLayout
      userRole="admin"
      userName="Иван Петров"
      onLogout={() => console.log('Logout clicked')}
    >
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Добро пожаловать в систему</h1>
        <p className="text-muted-foreground">
          Выберите раздел в меню слева для начала работы
        </p>
      </div>
    </AppLayout>
  );
}
