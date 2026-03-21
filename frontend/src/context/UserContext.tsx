import { createContext, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'activeUserId';

interface UserContextValue {
  activeUserId: number;
  setActiveUserId: (id: number) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [activeUserId, setActiveUserIdState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : 1;
  });

  const setActiveUserId = (id: number) => {
    localStorage.setItem(STORAGE_KEY, String(id));
    setActiveUserIdState(id);
  };

  return (
    <UserContext.Provider value={{ activeUserId, setActiveUserId }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
