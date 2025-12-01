import { useState } from 'react';
import UserManagementPanel from '../UserManagementPanel';

export default function UserManagementPanelExample() {
  const [users, setUsers] = useState([
    { id: "1", name: "Иван Петров", login: "ivan.petrov", role: "admin" as const },
    { id: "2", name: "Мария Сидорова", login: "maria.sidorova", role: "worker" as const },
    { id: "3", name: "Алексей Смирнов", login: "alex.smirnov", role: "worker" as const },
  ]);

  const handleCreateUser = (userData: any) => {
    const newUser = {
      id: String(users.length + 1),
      ...userData,
    };
    setUsers([...users, newUser]);
    console.log('User created:', newUser);
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(users.filter(u => u.id !== userId));
    console.log('User deleted:', userId);
  };

  return (
    <div className="p-8">
      <UserManagementPanel
        users={users}
        onCreateUser={handleCreateUser}
        onDeleteUser={handleDeleteUser}
      />
    </div>
  );
}
