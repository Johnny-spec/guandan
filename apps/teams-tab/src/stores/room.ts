'use client';
import { create } from 'zustand';
import type { GameStateSnapshot, RoomDetail, Seat } from '@teams-guandan/shared-types';

interface RoomState {
  room: RoomDetail | null;
  snapshot: GameStateSnapshot | null;
  lastPlay: { seat: Seat; cardIds: string[] } | null;
  toast: { kind: 'info' | 'error' | 'success'; text: string } | null;
  setRoom: (r: RoomDetail | null) => void;
  setSnapshot: (s: GameStateSnapshot | null) => void;
  setLastPlay: (p: { seat: Seat; cardIds: string[] } | null) => void;
  showToast: (kind: 'info' | 'error' | 'success', text: string) => void;
  clearToast: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  snapshot: null,
  lastPlay: null,
  toast: null,
  setRoom: (room) => set({ room }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setLastPlay: (lastPlay) => set({ lastPlay }),
  showToast: (kind, text) => set({ toast: { kind, text } }),
  clearToast: () => set({ toast: null }),
}));
