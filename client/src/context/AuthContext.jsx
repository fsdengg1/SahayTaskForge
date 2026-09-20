import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, clearToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    has: (...codes) => {
      if (!user) return false;
      if (user.roles?.some((r) => r.code === 'ADMIN')) return true;
      return codes.some((c) => user.permissions?.includes(c));
    },
    login: async (username, password, remember = true) => {
      const data = await api.post('/auth/login', { username, password });
      clearToken();
      const store = remember ? localStorage : sessionStorage;
      store.setItem('sahay_token', data.token);
      setUser(data.user);
      return data.user;
    },
    refreshUser: async () => {
      const data = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    },
    logout: () => {
      clearToken();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function homeFor(user) {
  const codes = user?.roles?.map((r) => r.code) || [];
  if (codes.some((c) => ['CEO', 'SAHAY_MD', 'ENG_DIRECTOR', 'CFT', 'ADMIN'].includes(c))) return '/dashboard';
  if (codes.some((c) => c.startsWith('SALES'))) return '/?view=sales';
  if (codes.some((c) => c.startsWith('DESIGN'))) return '/design';
  if (codes.some((c) => ['PROC_MANAGER', 'PURCHASE_EXEC'].includes(c))) return '/procurement';
  if (codes.some((c) => ['PPC_MANAGER', 'PROD_SUPER'].includes(c))) return '/production';
  if (codes.some((c) => c.startsWith('QC'))) return '/quality';
  if (codes.some((c) => ['INSTALL_MANAGER', 'SITE_ENG'].includes(c))) return '/installation';
  if (codes.includes('FINANCE')) return '/finance';
  return '/dashboard';
}
