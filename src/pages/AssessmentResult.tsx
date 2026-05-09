import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Download } from 'lucide-react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, RadialLinearScale, Filler } from 'chart.js'
import { Radar, Bar } from 'react-chartjs-2'
import { api } from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, RadialLinearScale, Filler)

interface DimensionScore {
  name: string
  score: number
  maxScore: number
}

interface AssessmentResultData {
  id: string
  scaleName: string
  totalScore: number
  maxScore: number
  level: string
  dimensions: DimensionScore[]
  aiInsight: string
  suggestions: string[]
  completedAt: string
}

interface BackendResult {
  sessionId: string
  scaleId: string
  status: string
  totalScore: number
  maxScore: number
  percentile: number
  dimensionScores: { [dimension: string]: number }
  responses: { itemId: string; response: string; dimension: string }[]
  completedAt: string
}

function getLevel(percentile: number): string {
  if (percentile >= 90) return '优秀'
  if (percentile >= 75) return '良好'
  if (percentile >= 50) return '中等'
  if (percentile >= 25) return '偏低'
  return '需关注'
}

function generateInsight(result: BackendResult): string {
  const level = getLevel(result.percentile)
  const dimEntries = Object.entries(result.dimensionScores)
  const lowDims = dimEntries.filter(([, v]) => v < result.maxScore / dimEntries.length * 0.5)
  const highDims = dimEntries.filter(([, v]) => v >= result.maxScore / dimEntries.length * 0.8)

  let insight = `综合评估结果为"${level}"，总分 ${result.totalScore}/${result.maxScore}，百分位 ${result.percentile}%。`
  if (highDims.length > 0) {
    insight += `在${highDims.map(([k]) => k).join('、')}方面表现较好。`
  }
  if (lowDims.length > 0) {
    insight += `在${lowDims.map(([k]) => k).join('、')}方面可能需要进一步关注和支持。`
  }
  return insight
}

function generateSuggestions(result: BackendResult): string[] {
  const dimEntries = Object.entries(result.dimensionScores)
  const suggestions: string[] = []
  const lowDims = dimEntries.filter(([, v]) => v < result.maxScore / dimEntries.length * 0.5)

  if (result.percentile < 25) {
    suggestions.push('建议尽快联系专业人员进行进一步评估和干预')
  }
  for (const [dim] of lowDims) {
    suggestions.push(`针对"${dim}"维度，建议制定专项训练计划`)
  }
  suggestions.push('建议定期进行复评，跟踪变化趋势')
  if (result.percentile >= 50) {
    suggestions.push('当前整体表现尚可，继续保持并关注薄弱环节')
  }
  return suggestions
}

export default function AssessmentResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [result, setResult] = useState<AssessmentResultData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchResult() {
      try {
        const res = await api.get<BackendResult>(`/assessments/sessions/${id}/result`)
        const scales = await api.get<{ id: string; name: string }[]>('/assessments/scales')
        const matched = scales.find((s) => s.id === res.scaleId)
        const scaleName = matched?.name || '评估量表'

        const dimCount = Object.keys(res.dimensionScores).length || 1
        const dimMaxScore = Math.round(res.maxScore / dimCount)
        const dimensions: DimensionScore[] = Object.entries(res.dimensionScores).map(
          ([name, score]) => ({ name, score, maxScore: dimMaxScore })
        )

        setResult({
          id: res.sessionId,
          scaleName,
          totalScore: res.totalScore,
          maxScore: res.maxScore,
          level: getLevel(res.percentile),
          dimensions,
          aiInsight: generateInsight(res),
          suggestions: generateSuggestions(res),
          completedAt: res.completedAt,
        })
      } catch {
        setResult(null)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchResult()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  if (!result) {
    return (
      <div className="card text-center py-16 max-w-xl mx-auto">
        <p className="text-slate-400 text-lg">无法加载评估结果</p>
        <button onClick={() => navigate('/assessment')} className="btn-primary mt-4">
          返回评估列表
        </button>
      </div>
    )
  }

  const scorePercent = Math.round((result.totalScore / result.maxScore) * 100)

  const radarData = {
    labels: result.dimensions.map((d) => d.name),
    datasets: [
      {
        label: '得分',
        data: result.dimensions.map((d) => d.score),
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
      r: {
        beginAtZero: true,
        max: Math.max(...result.dimensions.map((d) => d.maxScore)),
      },
    },
    plugins: {
      legend: { display: false },
    },
  }

  const barData = {
    labels: result.dimensions.map((d) => d.name),
    datasets: [
      {
        label: '得分',
        data: result.dimensions.map((d) => d.score),
        backgroundColor: 'rgba(14, 165, 233, 0.7)',
        borderRadius: 8,
      },
      {
        label: '满分',
        data: result.dimensions.map((d) => d.maxScore),
        backgroundColor: 'rgba(203, 213, 225, 0.4)',
        borderRadius: 8,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    scales: {
      y: { beginAtZero: true },
    },
    plugins: {
      legend: { position: 'top' as const },
    },
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/assessment')}
        className="flex items-center gap-2 text-slate-500 hover:text-sky-500 transition-colors"
        aria-label="返回评估列表"
      >
        <ArrowLeft size={20} />
        返回评估列表
      </button>

      <div className="card text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">{result.scaleName}</h2>
        <p className="text-sm text-slate-400 mb-6">完成时间：{result.completedAt}</p>
        <div className="inline-flex flex-col items-center">
          <div className="text-6xl font-bold text-sky-500 mb-2">{result.totalScore}</div>
          <div className="text-sm text-slate-400 mb-2">满分 {result.maxScore}</div>
          <div className="w-48 bg-slate-100 rounded-full h-3 mb-3">
            <div
              className="bg-sky-500 h-3 rounded-full transition-all"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <span className="inline-block px-4 py-1 rounded-full bg-sky-50 text-sky-600 font-semibold">
            {result.level}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">多维度得分雷达图</h3>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <Radar data={radarData} options={radarOptions} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">各维度详细得分</h3>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      <div className="card border-l-4 border-l-violet-500">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={20} className="text-violet-500" />
          <h3 className="text-lg font-bold text-violet-600">AI 解读</h3>
        </div>
        <p className="text-slate-700 leading-relaxed">{result.aiInsight}</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-4">建议与下一步</h3>
        <ul className="space-y-3">
          {result.suggestions.map((suggestion, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                {index + 1}
              </span>
              <span className="text-slate-700">{suggestion}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-center gap-4 pb-6">
        <button onClick={() => navigate('/assessment')} className="btn-outline">
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
