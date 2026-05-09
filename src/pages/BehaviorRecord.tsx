import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

const antecedentOptions = [
  '任务要求', '活动转换', '被拒绝', '注意力缺失', '环境变化',
  '社交互动', '感官刺激', '身体不适', '其他',
]

const behaviorCategories = [
  '攻击行为', '自伤行为', '破坏物品', '逃避行为', '刻板行为',
  '注意力寻求', '情绪爆发', '退缩行为', '其他',
]

const consequenceOptions = [
  '获得注意力', '逃避任务', '获得物品', '感官满足', '被制止',
  '被忽视', '被安抚', '环境改变', '其他',
]

const environmentOptions = [
  '教室', '家庭', '户外', '餐厅', '卫生间',
  '走廊', '操场', '治疗室', '其他',
]

export default function BehaviorRecord() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    antecedent: '',
    antecedentCustom: '',
    behaviorCategory: '',
    behaviorDescription: '',
    consequence: '',
    consequenceCustom: '',
    intensity: 5,
    duration: '',
    environment: '',
  })

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const durationMatch = form.duration.match(/(\d+)/)
      const durationMin = durationMatch ? parseInt(durationMatch[1], 10) : 0
      await api.post('/behaviors/records', {
        userId: userId || localStorage.getItem('mindbridge_userId'),
        antecedent: form.antecedent === '其他' ? form.antecedentCustom : form.antecedent,
        category: form.behaviorCategory,
        behavior: form.behaviorDescription,
        consequence: form.consequence === '其他' ? form.consequenceCustom : form.consequence,
        intensity: form.intensity,
        durationMin,
        environment: form.environment,
      })
      navigate('/behavior')
    } catch {
      // handle error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/behavior')}
        className="flex items-center gap-2 text-slate-500 hover:text-sky-500 transition-colors mb-6"
        aria-label="返回行为分析"
      >
        <ArrowLeft size={20} />
        返回行为分析
      </button>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-800 mb-6">ABC行为记录</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-sky-600 mb-3">A - 前因（Antecedent）</h3>
            <label htmlFor="antecedent" className="label-text">触发因素</label>
            <select
              id="antecedent"
              value={form.antecedent}
              onChange={(e) => updateField('antecedent', e.target.value)}
              className="input-field mb-3"
            >
              <option value="">请选择前因</option>
              {antecedentOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {form.antecedent === '其他' && (
              <input
                type="text"
                value={form.antecedentCustom}
                onChange={(e) => updateField('antecedentCustom', e.target.value)}
                className="input-field"
                placeholder="请描述具体前因"
              />
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-emerald-600 mb-3">B - 行为（Behavior）</h3>
            <label htmlFor="behaviorCategory" className="label-text">行为分类</label>
            <select
              id="behaviorCategory"
              value={form.behaviorCategory}
              onChange={(e) => updateField('behaviorCategory', e.target.value)}
              className="input-field mb-3"
            >
              <option value="">请选择行为分类</option>
              {behaviorCategories.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <label htmlFor="behaviorDescription" className="label-text">行为描述</label>
            <textarea
              id="behaviorDescription"
              value={form.behaviorDescription}
              onChange={(e) => updateField('behaviorDescription', e.target.value)}
              className="input-field min-h-[100px] resize-y"
              placeholder="请详细描述观察到的行为"
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-amber-600 mb-3">C - 后果（Consequence）</h3>
            <label htmlFor="consequence" className="label-text">行为结果</label>
            <select
              id="consequence"
              value={form.consequence}
              onChange={(e) => updateField('consequence', e.target.value)}
              className="input-field mb-3"
            >
              <option value="">请选择后果</option>
              {consequenceOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {form.consequence === '其他' && (
              <input
                type="text"
                value={form.consequenceCustom}
                onChange={(e) => updateField('consequenceCustom', e.target.value)}
                className="input-field"
                placeholder="请描述具体后果"
              />
            )}
          </div>

          <div>
            <label className="label-text">行为强度（1-10）</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={10}
                value={form.intensity}
                onChange={(e) => updateField('intensity', Number(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                aria-label="行为强度"
              />
              <span className="text-xl font-bold text-sky-500 w-8 text-center">{form.intensity}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>轻微</span>
              <span>严重</span>
            </div>
          </div>

          <div>
            <label htmlFor="duration" className="label-text">持续时间</label>
            <input
              id="duration"
              type="text"
              value={form.duration}
              onChange={(e) => updateField('duration', e.target.value)}
              className="input-field"
              placeholder="例如：5分钟"
            />
          </div>

          <div>
            <label htmlFor="environment" className="label-text">环境因素</label>
            <select
              id="environment"
              value={form.environment}
              onChange={(e) => updateField('environment', e.target.value)}
              className="input-field"
            >
              <option value="">请选择环境</option>
              {environmentOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2"
            aria-label="提交行为记录"
          >
            <Save size={16} />
            {submitting ? '提交中...' : '提交记录'}
          </button>
        </form>
      </div>
    </div>
  )
}
