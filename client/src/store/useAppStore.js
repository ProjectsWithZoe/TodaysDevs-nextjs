'use client'

import { create } from 'zustand'

export const useAppStore = create((set) => ({
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  toggleSidebar: ()    => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: open => set({ sidebarOpen: open }),

  activeRoom: null,
  setActiveRoom:   room => set({ activeRoom: room }),
  clearActiveRoom: ()   => set({ activeRoom: null }),

  notifications: [],
  addNotification: notif =>
    set(s => ({
      notifications: [notif, ...s.notifications].slice(0, 5)
    })),
  removeNotification: id =>
    set(s => ({
      notifications: s.notifications.filter(n => n.id !== id)
    }))
}))
