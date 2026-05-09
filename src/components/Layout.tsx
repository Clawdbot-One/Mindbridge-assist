import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  Heart,
  MessageCircle,
  FileText,
  Users,
  UserCircle,
  Menu,
  Bell,
  ChevronLeft,
  LogOut,
  Settings,
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'

const navItems = [
  { path: '/dashboard', label: '首页仪表盘', icon: LayoutDashboard },
  { path: '/assessment', label: '心理评估', icon: ClipboardCheck },
  { path: '/behavior', label: '行为分析', icon: BarChart3 },
  { path: '/emotion', label: '情绪追踪', icon: Heart },
  { path: '/aac', label: '沟通辅助', icon: MessageCircle },
  { path: '/reports', label: '智能报告', icon: FileText },
  { path: '/collaboration', label: '协作中心', icon: Users },
  { path: '/profile', label: '个人中心', icon: UserCircle },
]

const pageTitles: Record<string, string> = {
  '/dashboard': '首页仪表盘',
  '/assessment': '心理评估',
  '/behavior': '行为分析',
  '/emotion': '情绪追踪',
  '/aac': '沟通辅助',
  '/reports': '智能报告',
  '/collaboration': '协作中心',
  '/profile': '个人中心',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, notifications, markAllNotificationsRead } = useAppStore()
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const currentPath = '/' + location.pathname.split('/')[1]
  const pageTitle = pageTitles[currentPath] || 'MindBridge Assist'
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-60'
        } bg-white border-r border-slate-200 flex flex-col transition-all duration-300 flex-shrink-0`}
        role="navigation"
        aria-label="主导航"
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-sky-500 truncate">MindBridge</span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {sidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-3 rounded-xl text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isActive
                    ? 'bg-sky-50 text-sky-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${sidebarCollapsed ? 'justify-center' : ''}`
              }
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <item.icon size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-xl font-bold text-slate-800">{pageTitle}</h1>

          <div className="flex items-center gap-4">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                aria-label={`通知${unreadCount > 0 ? `，${unreadCount}条未读` : ''}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <span className="font-semibold text-slate-800">通知</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-xs text-sky-500 hover:text-sky-600"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-sm">暂无通知</div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-slate-50 ${
                            n.read ? 'bg-white' : 'bg-sky-50'
                          }`}
                        >
                          <div className="text-sm font-medium text-slate-800">{n.title}</div>
                          <div className="text-xs text-slate-500 mt-1">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                aria-label="用户菜单"
              >
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-sky-600">
                    {user?.displayName?.[0] || 'U'}
                  </span>
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium text-slate-700 hidden lg:block">
                    {user?.displayName || '用户'}
                  </span>
                )}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-lg border border-slate-200 z-50">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/profile')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 rounded-t-xl"
                  >
                    <Settings size={16} />
                    个人设置
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-b-xl"
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
