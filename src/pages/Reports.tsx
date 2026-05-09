import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Filter, Calendar } from 'lucide-react'
import { api } from '@/lib/api'

interface Report {
  id: string
  title: string
  type: string
  status: 'completed' | 'processing' | 'pending'
  createdAt: string
  summary: string
}

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'assessment', label: '评估报告' },
  { value: 'behavior', label: '行为报告' },
  { value: 'emotion', label: '情绪报告' },
  { value: 'comprehensive', label: '综合报告' },
]

const statusLabels: Record<string, string> = {
  completed: '已完成',
  processing: '生成中',
  pending: '待生成',
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-600',
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchReports() {
      try {
        const params = new URLSearchParams()
        if (typeFilter) params.set('type', typeFilter)
        if (statusFilter) params.set('status', statusFilter)
        const query = params.toString() ? `?${params.toString()}` : ''
        const res = await api.get<Report[]>(`/reports${query}`)
        setReports(res)
      } catch {
        setReports([])
      } finally {
        setLoading(false)
      }
    }
    fetchReports()
  }, [typeFilter, statusFilter])

  const handleGenerate = async () => {
    try {
      await api.post('/reports/generate', { type: 'comprehensive' })
      const res = await api.get<Report[]>('/reports')
      setReports(res)
    } catch {
      // handle error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">智能报告</h2>
        <button
          onClick={handleGenerate}
          className="btn-primary flex items-center gap-2"
          aria-label="生成新报告"
        >
          <Plus size={16} />
          生成报告
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-600">筛选</span>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label htmlFor="type-filter" className="label-text">类型</label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-filter" className="label-text">状态</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="">全部状态</option>
              <option value="completed">已完成</option>
              <option value="processing">生成中</option>
              <option value="pending">待生成</option>
            </select>
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="card text-center py-16">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 text-lg">暂无报告</p>
          <p className="text-slate-400 text-sm mt-1">点击"生成报告"创建新报告</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/reports/${report.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/reports/${report.id}`)
              }}
              aria-label={`查看报告 ${report.title}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-sky-500" />
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[report.status]}`}>
                  {statusLabels[report.status]}
                </span>
              </div>
              <h3 className="font-bold text-slate-800 mb-1">{report.title}</h3>
              <p className="text-sm text-slate-500 mb-3 line-clamp-2">{report.summary}</p>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar size={12} />
                <span>{report.createdAt}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
