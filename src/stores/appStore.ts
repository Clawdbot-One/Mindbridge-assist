import { create } from 'zustand'

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read: boolean
  createdAt: string
}

interface AccessibilityConfig {
  fontSize: 'normal' | 'large' | 'xlarge'
  highContrast: boolean
  simplifiedMode: boolean
}

interface AppState {
  sidebarCollapsed: boolean
  notifications: Notification[]
  accessibility: AccessibilityConfig
  toggleSidebar: () => void
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void
  updateAccessibility: (config: Partial<AccessibilityConfig>) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  notifications: [],
  accessibility: {
    fontSize: 'normal',
    highContrast: false,
    simplifiedMode: false,
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: Date.now().toString(),
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  clearNotifications: () => set({ notifications: [] }),

  updateAccessibility: (config) =>
    set((state) => ({
      accessibility: { ...state.accessibility, ...config },
    })),
}))
