import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, Clock, Users, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'

const SCALE_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: '全部量表', icon: '📋', color: 'bg-slate-100 text-slate-700' },
  intellectual_development: { label: '智力与发育', icon: '🧠', color: 'bg-purple-100 text-purple-700' },
  autism_spectrum: { label: '孤独谱系', icon: '🧩', color: 'bg-blue-100 text-blue-700' },
  emotion_mood: { label: '情绪与心境', icon: '💝', color: 'bg-pink-100 text-pink-700' },
  behavior_attention: { label: '行为与注意力', icon: '⚡', color: 'bg-amber-100 text-amber-700' },
  social_adaptive: { label: '社交与适应', icon: '🤝', color: 'bg-green-100 text-green-700' },
  sensory_motor: { label: '感觉与运动', icon: '🏃', color: 'bg-orange-100 text-orange-700' },
  mental_health: { label: '综合心理健康', icon: '🏥', color: 'bg-red-100 text-red-700' },
  language_communication: { label: '语言与沟通', icon: '💬', color: 'bg-cyan-100 text-cyan-700' },
}

interface ScaleRaw {
  id: string
  name: string
  description: string
  itemCount: number
  minAge: number | null
  maxAge: number | null
  category: string
  scoringRules: string
  version: string
}

interface Scale {
  id: string
  name: string
  description: string
  questionCount: number
  ageRange: string
  estimatedTime: string
  category: string
}

function mapScale(raw: ScaleRaw): Scale {
  const ageRange = raw.minAge != null && raw.maxAge != null
    ? `${raw.minAge}-${raw.maxAge}岁`
    : raw.minAge != null ? `${raw.minAge}岁以上` : '全年龄'
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    questionCount: raw.itemCount,
    ageRange,
    estimatedTime: `约${raw.itemCount * 1.5}分钟`,
    category: raw.category,
  }
}

export default function AssessmentList() {
  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchScales() {
      try {
        const res = await api.get<ScaleRaw[]>('/assessments/scales')
        setScales(res.map(mapScale))
      } catch {
        setScales([])
      } finally {
        setLoading(false)
      }
    }
    fetchScales()
  }, [])

  const filteredScales = activeCategory === 'all'
    ? scales
    : scales.filter(s => s.category === activeCategory)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">心理评估</h2>
        <p className="text-slate-500 text-sm mt-1">选择适合的评估量表</p>
      </div>

      <div
        role="tablist"
        aria-label="量表分类筛选"
        className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide"
      >
        {Object.entries(SCALE_CATEGORIES).map(([key, { label, icon }]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeCategory === key}
            aria-controls="scale-panel"
            onClick={() => setActiveCategory(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === key
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div id="scale-panel" role="tabpanel" aria-label="量表列表">
        {filteredScales.length === 0 ? (
          <div className="card text-center py-16">
            <ClipboardCheck size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-400 text-lg">该分类下暂无评估量表</p>
            <p className="text-slate-400 text-sm mt-1">请尝试选择其他分类查看</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScales.map((scale) => {
              const cat = SCALE_CATEGORIES[scale.category]
              return (
                <div key={scale.id} className="card hover:shadow-md transition-shadow flex flex-col">
                  {cat && (
                    <span className={`inline-flex items-center gap-1 self-start px-2.5 py-0.5 rounded-full text-xs font-medium mb-3 ${cat.color}`}>
                      <span aria-hidden="true">{cat.icon}</span>
                      {cat.label}
                    </span>
                  )}
                  <h3 className="font-bold text-lg text-slate-800 mb-1">{scale.name}</h3>
                  <p className="text-slate-600 text-sm line-clamp-2 mb-4 flex-1">{scale.description}</p>
                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <ClipboardCheck size={14} aria-hidden="true" />
                      {scale.questionCount}题
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={14} aria-hidden="true" />
                      {scale.ageRange}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} aria-hidden="true" />
                      {scale.estimatedTime}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => navigate(`/assessment/${scale.id}`)}
                      className="btn-primary flex items-center gap-2"
                      aria-label={`开始评估 ${scale.name}`}
                    >
                      开始评估
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
