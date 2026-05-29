'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  userId: string | null;
  displayName: string | null;
  setUser: (userId: string, displayName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      displayName: null,
      setUser: (userId, displayName) => set({ userId, displayName }),
      logout: () => set({ userId: null, displayName: null }),
    }),
    { name: 'guandan-auth' },
  ),
);
