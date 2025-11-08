import LoginForm from '../LoginForm';

export default function LoginFormExample() {
  const handleLogin = (login: string, password: string) => {
    console.log('Login attempt:', { login, password });
    alert(`Попытка входа: ${login}`);
  };

  return <LoginForm onLogin={handleLogin} />;
}
