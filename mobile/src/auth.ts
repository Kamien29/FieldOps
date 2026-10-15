import { createContext, useContext } from 'react';

export interface AuthApi {
  logout: (force?: boolean) => Promise<void>;
  onLoggedIn: () => void;
}
export const AuthContext = createContext<AuthApi>({ logout: async () => {}, onLoggedIn: () => {} });
export const useAuth = () => useContext(AuthContext);
