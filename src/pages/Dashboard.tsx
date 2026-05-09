import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  BarChart3,
  Heart,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
} from 'lucide-react'

interface DashboardData {
  todayAssessments: number
  completionRate: number
  behaviorAlerts: number
  aacUsage: number
  recentTodos: { id: string; title: string; done: boolean }[]
  recentResults: { id: string; name: string; score: number; date: string }[]
}

const defaultData: DashboardData = {
  todayAssessments: 0,
  completionRate: 0,
  behaviorAlerts: 0,
  aacUsage: 0,
  recentTodos: [],
  recentResults: [],
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(defaultData)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setData(defaultData)
    setLoading(false)
  }, [])

  const stats = [
    {
      label: '今日评估数',
      value: data.todayAssessments,
      icon: ClipboardCheck,
      color: 'bg-sky-50 text-sky-500',
    },
    {
      label: '评估完成率',
      value: `${data.completionRate}%`,
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-500',
    },
    {
      label: '行为预警数',
      value: data.behaviorAlerts,
      icon: AlertTriangle,
      color: 'bg-amber-50 text-amber-500',
    },
    {
      label: 'AAC使用频次',
      value: data.aacUsage,
      icon: MessageCircle,
      color: 'bg-violet-50 text-violet-500',
    },
  ]

  const shortcuts = [
    { label: '开始评估', icon: ClipboardCheck, path: '/assessment', color: 'bg-sky-500 hover:bg-sky-600' },
    { label: '记录行为', icon: BarChart3, path: '/behavior/record', color: 'bg-emerald-500 hover:bg-emerald-600' },
    { label: '记录情绪', icon: Heart, path: '/emotion/record', color: 'bg-amber-500 hover:bg-amber-600' },
    { label: '使用AAC', icon: MessageCircle, path: '/aac', color: 'bg-violet-500 hover:bg-violet-600' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
              <div className="text-sm text-slate-500">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {shortcuts.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`${item.color} text-white rounded-xl p-6 flex flex-col items-center gap-3 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500`}
            aria-label={item.label}
          >
            <item.icon size={32} />
            <span className="font-semibold text-lg">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-sky-500" />
            <h2 className="text-lg font-bold text-slate-800">待办事项</h2>
          </div>
          {data.recentTodos.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Activity size={32} className="mx-auto mb-2" />
              <p>暂无待办事项</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.recentTodos.map((todo) => (
                <li key={todo.id} className="flex items-center gap-3 py-2">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      todo.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                    }`}
                  >
                    {todo.done && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <span className={`text-sm ${todo.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {todo.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck size={20} className="text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-800">近期评估结果</h2>
          </div>
          {data.recentResults.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ClipboardCheck size={32} className="mx-auto mb-2" />
              <p>暂无评估记录</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.recentResults.map((result) => (
                <li
                  key={result.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700">{result.name}</div>
                    <div className="text-xs text-slate-400">{result.date}</div>
                  </div>
                  <div className="text-lg font-bold text-sky-500">{result.score}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
