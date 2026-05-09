import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar, Filter } from 'lucide-react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js'
import { Line, Pie } from 'react-chartjs-2'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler)

interface BehaviorRecord {
  id: string
  userId: string
  antecedent: string
  behavior: string
  consequence: string
  category: string
  intensity: number
  durationMin: number
  environment: string
  occurredAt: string
}

interface PatternData {
  categoryFrequency: { [cat: string]: number }
  topAntecedents: string[]
  topConsequences: string[]
}

interface TrendData {
  labels: string[]
  values: number[]
}

interface CategoryData {
  labels: string[]
  values: number[]
}

export default function Behavior() {
  const [records, setRecords] = useState<BehaviorRecord[]>([])
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [categories, setCategories] = useState<CategoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    async function fetchData() {
      const uid = userId || localStorage.getItem('mindbridge_userId')
      if (!uid) {
        setLoading(false)
        return
      }
      try {
        const params = new URLSearchParams()
        if (dateRange.start) params.set('startDate', dateRange.start)
        if (dateRange.end) params.set('endDate', dateRange.end)
        const query = params.toString() ? `?${params.toString()}` : ''

        const [recordsRes, patternsRes] = await Promise.all([
          api.get<BehaviorRecord[]>(`/behaviors/records/${uid}${query}`),
          api.get<PatternData>(`/behaviors/patterns/${uid}`),
        ])
        setRecords(recordsRes)

        const catFreq = patternsRes.categoryFrequency || {}
        const catLabels = Object.keys(catFreq)
        const catValues = Object.values(catFreq)
        setCategories({ labels: catLabels, values: catValues })

        const dateCount: { [date: string]: number } = {}
        for (const r of recordsRes) {
          const dateKey = r.occurredAt?.slice(0, 10) || ''
          if (dateKey) {
            dateCount[dateKey] = (dateCount[dateKey] || 0) + 1
          }
        }
        const sortedDates = Object.keys(dateCount).sort()
        if (sortedDates.length > 0) {
          setTrend({ labels: sortedDates, values: sortedDates.map((d) => dateCount[d]) })
        } else {
          setTrend(null)
        }
      } catch {
        setRecords([])
        setTrend(null)
        setCategories(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [dateRange, userId])

  const lineData = trend
    ? {
        labels: trend.labels,
        datasets: [
          {
            label: '行为频次',
            data: trend.values,
            borderColor: 'rgb(14, 165, 233)',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      }
    : null

  const lineOptions = {
    responsive: true,
    scales: { y: { beginAtZero: true } },
    plugins: { legend: { display: false } },
  }

  const pieData = categories
    ? {
        labels: categories.labels,
        datasets: [
          {
            data: categories.values,
            backgroundColor: [
              'rgba(14, 165, 233, 0.7)',
              'rgba(16, 185, 129, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(139, 92, 246, 0.7)',
              'rgba(239, 68, 68, 0.7)',
            ],
          },
        ],
      }
    : null

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
        <h2 className="text-2xl font-bold text-slate-800">行为分析</h2>
        <button
          onClick={() => navigate('/behavior/record')}
          className="btn-primary flex items-center gap-2"
          aria-label="新增行为记录"
        >
          <Plus size={16} />
          新增记录
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-600">日期筛选</span>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label htmlFor="start-date" className="label-text">开始日期</label>
            <input
              id="start-date"
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="label-text">结束日期</label>
            <input
              id="end-date"
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">行为趋势</h3>
          {lineData ? (
            <Line data={lineData} options={lineOptions} />
          ) : (
            <div className="text-center py-8 text-slate-400">暂无趋势数据</div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">行为分类</h3>
          {pieData ? (
            <div className="flex justify-center">
              <div className="w-full max-w-xs">
                <Pie data={pieData} />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">暂无分类数据</div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-4">行为记录列表</h3>
        {records.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Calendar size={32} className="mx-auto mb-2" />
            <p>暂无行为记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">日期</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">类型</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">前因(A)</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">行为(B)</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">后果(C)</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-600">强度</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">持续时间</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-700">{record.occurredAt?.slice(0, 10) || ''}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-600 text-xs font-medium">
                        {record.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[150px] truncate">{record.antecedent}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-[150px] truncate">{record.behavior}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-[150px] truncate">{record.consequence}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-semibold ${record.intensity >= 7 ? 'text-red-500' : record.intensity >= 4 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {record.intensity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{record.durationMin}分钟</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
