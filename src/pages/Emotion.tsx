import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar } from 'lucide-react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js'
import { Line, Pie } from 'react-chartjs-2'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler)

const emotionLabels: Record<string, string> = {
  happy: '开心',
  calm: '平静',
  neutral: '一般',
  tired: '疲惫',
  anxious: '焦虑',
  sad: '难过',
  angry: '生气',
  scared: '害怕',
}

const emotionColors: Record<string, string> = {
  happy: '#10B981',
  calm: '#0EA5E9',
  neutral: '#94A3B8',
  tired: '#A78BFA',
  anxious: '#F59E0B',
  sad: '#6366F1',
  angry: '#EF4444',
  scared: '#8B5CF6',
}

interface EmotionDay {
  date: string
  emotion: string
  intensity: number
}

interface TrendData {
  labels: string[]
  values: number[]
}

interface DistributionData {
  labels: string[]
  values: number[]
}

interface EmotionRecord {
  id: string
  userId: string
  emotionType: string
  intensity: number
  note: string
  triggers: string[]
  recordedAt: string
}

interface TrendsResponse {
  period: string
  overall: { avgIntensity: number; totalCount: number }
  byEmotion: { [type: string]: { count: number; avgIntensity: number } }
  byDate: { [date: string]: { count: number; avgIntensity: number } }
}

export default function Emotion() {
  const [calendarData, setCalendarData] = useState<EmotionDay[]>([])
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [distribution, setDistribution] = useState<DistributionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
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
        const monthStr = `${currentMonth.year}-${(currentMonth.month + 1).toString().padStart(2, '0')}`
        const startDate = `${monthStr}-01`
        const endDate = `${monthStr}-${new Date(currentMonth.year, currentMonth.month + 1, 0).getDate().toString().padStart(2, '0')}`

        const [recordsRes, trendsRes] = await Promise.all([
          api.get<EmotionRecord[]>(`/emotions/records/${uid}?startDate=${startDate}&endDate=${endDate}`),
          api.get<TrendsResponse>(`/emotions/trends/${uid}?period=month`),
        ])

        const calDays: EmotionDay[] = recordsRes.map((r) => ({
          date: r.recordedAt?.slice(0, 10) || '',
          emotion: r.emotionType,
          intensity: r.intensity,
        }))
        setCalendarData(calDays)

        const byDate = trendsRes.byDate || {}
        const sortedDates = Object.keys(byDate).sort()
        if (sortedDates.length > 0) {
          setTrend({
            labels: sortedDates,
            values: sortedDates.map((d) => byDate[d].avgIntensity),
          })
        } else {
          setTrend(null)
        }

        const byEmotion = trendsRes.byEmotion || {}
        const emoKeys = Object.keys(byEmotion)
        if (emoKeys.length > 0) {
          setDistribution({
            labels: emoKeys,
            values: emoKeys.map((k) => byEmotion[k].count),
          })
        } else {
          setDistribution(null)
        }
      } catch {
        setCalendarData([])
        setTrend(null)
        setDistribution(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [currentMonth, userId])

  const lineData = trend
    ? {
        labels: trend.labels,
        datasets: [
          {
            label: '情绪指数',
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
    scales: { y: { beginAtZero: true, max: 10 } },
    plugins: { legend: { display: false } },
  }

  const pieData = distribution
    ? {
        labels: distribution.labels.map((l) => emotionLabels[l] || l),
        datasets: [
          {
            data: distribution.values,
            backgroundColor: distribution.labels.map((l) => emotionColors[l] || '#94A3B8'),
          },
        ],
      }
    : null

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const daysInMonth = getDaysInMonth(currentMonth.year, currentMonth.month)
  const firstDay = getFirstDayOfMonth(currentMonth.year, currentMonth.month)
  const emotionMap = new Map(calendarData.map((d) => [d.date, d]))

  const prevMonth = () => {
    setCurrentMonth((prev) =>
      prev.month === 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: prev.month - 1 }
    )
  }

  const nextMonth = () => {
    setCurrentMonth((prev) =>
      prev.month === 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: prev.month + 1 }
    )
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
        <h2 className="text-2xl font-bold text-slate-800">情绪追踪</h2>
        <button
          onClick={() => navigate('/emotion/record')}
          className="btn-primary flex items-center gap-2"
          aria-label="新增情绪记录"
        >
          <Plus size={16} />
          记录情绪
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100" aria-label="上个月">
            ←
          </button>
          <h3 className="text-lg font-bold text-slate-800">
            {currentMonth.year}年{currentMonth.month + 1}月
          </h3>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100" aria-label="下个月">
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div key={day} className="text-center text-sm font-medium text-slate-400 py-2">
              {day}
            </div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${currentMonth.year}-${(currentMonth.month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
            const emotion = emotionMap.get(dateStr)
            return (
              <div
                key={day}
                className="text-center py-2 rounded-lg relative"
                style={emotion ? { backgroundColor: emotionColors[emotion.emotion] + '20' } : {}}
              >
                <span className="text-sm text-slate-700">{day}</span>
                {emotion && (
                  <div
                    className="w-2 h-2 rounded-full mx-auto mt-1"
                    style={{ backgroundColor: emotionColors[emotion.emotion] }}
                    title={`${emotionLabels[emotion.emotion]} 强度:${emotion.intensity}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">情绪趋势</h3>
          {lineData ? (
            <Line data={lineData} options={lineOptions} />
          ) : (
            <div className="text-center py-8 text-slate-400">暂无趋势数据</div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 mb-4">情绪分布</h3>
          {pieData ? (
            <div className="flex justify-center">
              <div className="w-full max-w-xs">
                <Pie data={pieData} />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Calendar size={32} className="mx-auto mb-2" />
              <p>暂无分布数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
