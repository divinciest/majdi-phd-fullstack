import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type User = {
  id: string;
  email: string;
  createdAt: string;
  isActive: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = "http://localhost:5007";
const TOKEN_KEY = "cretextract_token";
const USER_KEY = "cretextract_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored auth on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
      // Verify token is still valid
      fetch(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
        .then(res => {
          if (!res.ok) {
            // Token expired or invalid
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setToken(null);
            setUser(null);
          }
        })
        .catch(() => {
          // Network error, keep local state
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }
    
    const data = await res.json();
    const { token: newToken, ...userData } = data;
    
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const signup = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Signup failed");
    }
    
    const data = await res.json();
    const { token: newToken, ...userData } = data;
    
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    
    // Optional: call signout endpoint
    fetch(`${API_BASE_URL}/signout`, { method: "POST" }).catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
