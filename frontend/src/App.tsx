// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login';
import RegisterPage from './pages/Register';
import Chat from './pages/Chat';

export default function App() {
  const handleAuthSuccess = (user: { id: string; email: string }, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('me', JSON.stringify(user));
    location.assign('/chat'); // keep same redirect style as your login
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route
          path="/login"
          element={<LoginPage onSuccess={handleAuthSuccess} />}
        />

        <Route
          path="/register"
          element={<RegisterPage onSuccess={handleAuthSuccess} />}
        />

        <Route path="/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
