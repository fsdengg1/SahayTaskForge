import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'sahay-theme';
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

const initial = localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
applyTheme(initial);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
