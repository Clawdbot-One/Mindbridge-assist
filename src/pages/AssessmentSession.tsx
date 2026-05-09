import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

interface Question {
  id: string
  orderNum: number
  content: string
  options: { label: string; value: number | string }[]
  dimension: string
}

interface ScaleData {
  id: string
  name: string
  items: Question[]
  sessionId: string
}

export default function AssessmentSession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [scale, setScale] = useState<ScaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [startTime] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [startTime])

  useEffect(() => {
    async function fetchScale() {
      if (!isAuthenticated) {
        setError('请先登录后再进行评估')
        setLoading(false)
        return
      }
      try {
        setError(null)
        const scales = await api.get<{ id: string; name: string }[]>('/assessments/scales')
        const matched = scales.find((s) => s.id === id)
        const scaleName = matched?.name || '评估量表'

        const items = await api.get<Question[]>(`/assessments/scales/${id}/items`)
        const sorted = [...items].sort((a, b) => a.orderNum - b.orderNum)

        const effectiveUserId = userId || localStorage.getItem('mindbridge_userId')
        if (!effectiveUserId) {
          setError('无法获取用户信息，请重新登录')
          setLoading(false)
          return
        }

        const session = await api.post<{ id: string }>('/assessments/sessions', {
          scaleId: id,
          userId: effectiveUserId,
        })

        setScale({
          id: id!,
          name: scaleName,
          items: sorted,
          sessionId: session.id,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : '加载评估题目失败'
        setError(msg)
        setScale(null)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchScale()
  }, [id, userId, isAuthenticated])

  const handleAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmit = async () => {
    if (!scale) return
    setSubmitting(true)
    try {
      const itemIds = Object.keys(answers)
      for (let i = 0; i < itemIds.length; i++) {
        const itemId = itemIds[i]
        await api.put(`/assessments/sessions/${scale.sessionId}/responses`, {
          itemId,
          response: answers[itemId],
          duration: elapsed,
        })
      }
      navigate(`/assessment/${scale.sessionId}/result`)
    } catch {
      // handle error
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  if (!scale || scale.items.length === 0) {
    return (
      <div className="card text-center py-16 max-w-xl mx-auto">
        <p className="text-slate-400 text-lg">{error || '无法加载评估题目'}</p>
        <div className="flex gap-3 justify-center mt-4">
          <button
            onClick={() => { setLoading(true); setError(null); setScale(null); }}
            className="btn-primary"
          >
            重新加载
          </button>
          <button onClick={() => navigate('/assessment')} className="btn-outline">
            返回评估列表
          </button>
        </div>
      </div>
    )
  }

  const question = scale.items[currentIndex]
  const total = scale.items.length
  const progress = ((currentIndex + 1) / total) * 100
  const isLast = currentIndex === total - 1
  const answeredCount = Object.keys(answers).length

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">{scale.name}</h2>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Clock size={16} />
            <span>{formatTime(elapsed)}</span>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
          <span>第 {currentIndex + 1} 题 / 共 {total} 题</span>
          <span>已答 {answeredCount} 题</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className="bg-sky-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="text-xl font-semibold text-slate-800 mb-6 text-center">
          {question.content}
        </h3>

        <div className="space-y-3 mb-8">
          {question.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleAnswer(question.id, String(option.value))}
              className={`w-full text-left py-4 px-6 rounded-xl border-2 text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                answers[question.id] === String(option.value)
                  ? 'border-sky-500 bg-sky-50 text-sky-700 font-semibold'
                  : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-700'
              }`}
              aria-label={option.label}
              aria-pressed={answers[question.id] === String(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="btn-outline flex items-center gap-2 disabled:opacity-30"
            aria-label="上一题"
          >
            <ChevronLeft size={16} />
            上一题
          </button>

          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount < total}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              aria-label="完成评估"
            >
              <CheckCircle size={16} />
              {submitting ? '提交中...' : '完成评估'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(total - 1, prev + 1))}
              className="btn-primary flex items-center gap-2"
              aria-label="下一题"
            >
              下一题
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
