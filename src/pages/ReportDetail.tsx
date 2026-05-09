import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Download, Calendar, User } from 'lucide-react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, RadialLinearScale, Filler } from 'chart.js'
import { Radar, Bar, Line } from 'react-chartjs-2'
import { api } from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, RadialLinearScale, Filler)

interface ReportData {
  id: string
  title: string
  type: string
  status: string
  createdAt: string
  author: string
  dimensions: { name: string; score: number; maxScore: number }[]
  trend: { labels: string[]; values: number[] }
  aiInsight: string
  recommendations: string[]
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await api.get<ReportData>(`/reports/${id}`)
        setReport(res)
      } catch {
        setReport(null)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchReport()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="card text-center py-16 max-w-xl mx-auto">
        <p className="text-slate-400 text-lg">无法加载报告</p>
        <button onClick={() => navigate('/reports')} className="btn-primary mt-4">
          返回报告列表
        </button>
      </div>
    )
  }

  const radarData = {
    labels: report.dimensions.map((d) => d.name),
    datasets: [
      {
        label: '得分',
        data: report.dimensions.map((d) => d.score),
        backgroundColor: 'rgba(14, 165, 233, 0.2)',
        borderColor: 'rgb(14, 165, 233)',
        borderWidth: 2,
        pointBackgroundColor: 'rgb(14, 165, 233)',
      },
    ],
  }

  const radarOptions = {
    responsive: true,
    scales: {
      r: { beginAtZero: true },
    },
    plugins: { legend: { display: false } },
  }

  const barData = {
    labels: report.dimensions.map((d) => d.name),
    datasets: [
      {
        label: '得分',
        data: report.dimensions.map((d) => d.score),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderRadius: 8,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    scales: { y: { beginAtZero: true } },
    plugins: { legend: { display: false } },
  }

  const lineData = {
    labels: report.trend.labels,
    datasets: [
      {
        label: '趋势',
        data: report.trend.values,
        borderColor: 'rgb(14, 165, 233)',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    scales: { y: { beginAtZero: true } },
    plugins: { legend: { display: false } },
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/reports')}
        className="flex items-center gap-2 text-slate-500 hover:text-sky-500 transition-colors"
        aria-label="返回报告列表"
      >
        <ArrowLeft size={20} />
        返回报告列表
      </button>

      <div className="card">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{report.title}</h2>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar size={14} />
            {report.createdAt}
          </span>
          <span className="flex items-center gap-1">
            <User size={14} />
            {report.author}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">多维度评估</h3>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <Radar data={radarData} options={radarOptions} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">维度得分</h3>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-4">发展趋势</h3>
        <Line data={lineData} options={lineOptions} />
      </div>

      <div className="card border-l-4 border-l-violet-500">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={20} className="text-violet-500" />
          <h3 className="text-lg font-bold text-violet-600">AI 洞察</h3>
        </div>
        <p className="text-slate-700 leading-relaxed">{report.aiInsight}</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-4">建议与推荐</h3>
        <ul className="space-y-3">
          {report.recommendations.map((rec, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                {index + 1}
              </span>
              <span className="text-slate-700">{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-center gap-4 pb-6">
        <button onClick={() => navigate('/reports')} className="btn-outline">
          返回列表
        </button>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2"
          aria-label="导出PDF"
        >
          <Download size={16} />
          导出PDF
        </button>
      </div>
    </div>
  )
}
