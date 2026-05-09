import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

const emotions = [
  { id: 'happy', label: '开心', color: 'bg-emerald-100 border-emerald-400 text-emerald-700', icon: '😊' },
  { id: 'calm', label: '平静', color: 'bg-sky-100 border-sky-400 text-sky-700', icon: '😌' },
  { id: 'neutral', label: '一般', color: 'bg-slate-100 border-slate-400 text-slate-700', icon: '😐' },
  { id: 'tired', label: '疲惫', color: 'bg-purple-100 border-purple-400 text-purple-700', icon: '😴' },
  { id: 'anxious', label: '焦虑', color: 'bg-amber-100 border-amber-400 text-amber-700', icon: '😰' },
  { id: 'sad', label: '难过', color: 'bg-indigo-100 border-indigo-400 text-indigo-700', icon: '😢' },
  { id: 'angry', label: '生气', color: 'bg-red-100 border-red-400 text-red-700', icon: '😠' },
  { id: 'scared', label: '害怕', color: 'bg-violet-100 border-violet-400 text-violet-700', icon: '😨' },
]

const triggerOptions = [
  '社交互动', '学业压力', '环境变化', '身体不适', '被拒绝',
  '被批评', '任务困难', '注意力缺失', '感官过载', '疲劳',
  '家庭因素', '同伴冲突', '未知', '其他',
]

export default function EmotionRecord() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    emotion: '',
    intensity: 5,
    triggers: [] as string[],
    note: '',
  })

  const toggleTrigger = (trigger: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter((t) => t !== trigger)
        : [...prev.triggers, trigger],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.emotion) return
    setSubmitting(true)
    try {
      await api.post('/emotions/records', {
        userId: userId || localStorage.getItem('mindbridge_userId'),
        emotionType: form.emotion,
        intensity: form.intensity,
        triggers: form.triggers,
        note: form.note,
      })
      navigate('/emotion')
    } catch {
      // handle error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/emotion')}
        className="flex items-center gap-2 text-slate-500 hover:text-sky-500 transition-colors mb-6"
        aria-label="返回情绪追踪"
      >
        <ArrowLeft size={20} />
        返回情绪追踪
      </button>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-800 mb-6">记录情绪</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label-text mb-3">你现在感觉如何？</label>
            <div className="grid grid-cols-4 gap-3">
              {emotions.map((emo) => (
                <button
                  key={emo.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, emotion: emo.id }))}
                  className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    form.emotion === emo.id
                      ? emo.color + ' scale-105 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  aria-label={emo.label}
                  aria-pressed={form.emotion === emo.id}
                >
                  <span className="text-2xl">{emo.icon}</span>
                  <span className="text-sm font-medium">{emo.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label-text">情绪强度（1-10）</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={10}
                value={form.intensity}
                onChange={(e) => setForm((prev) => ({ ...prev, intensity: Number(e.target.value) }))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                aria-label="情绪强度"
              />
              <span className="text-xl font-bold text-sky-500 w-8 text-center">{form.intensity}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>轻微</span>
              <span>强烈</span>
            </div>
          </div>

          <div>
            <label className="label-text mb-3">触发因素（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {triggerOptions.map((trigger) => (
                <button
                  key={trigger}
                  type="button"
                  onClick={() => toggleTrigger(trigger)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    form.triggers.includes(trigger)
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  aria-label={trigger}
                  aria-pressed={form.triggers.includes(trigger)}
                >
                  {trigger}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="note" className="label-text">备注</label>
            <textarea
              id="note"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              className="input-field min-h-[100px] resize-y"
              placeholder="记录更多细节..."
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !form.emotion}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            aria-label="提交情绪记录"
          >
            <Save size={16} />
            {submitting ? '提交中...' : '提交记录'}
          </button>
        </form>
      </div>
    </div>
  )
}
