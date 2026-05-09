import { useState } from 'react'
import { Volume2, Trash2, Play, X } from 'lucide-react'

function speak(text: string) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    speechSynthesis.speak(utterance)
  }
}

interface SymbolItem {
  id: string
  label: string
  emoji: string
  category: string
}

const categories = [
  { id: 'daily', label: '日常需求' },
  { id: 'food', label: '食物饮品' },
  { id: 'emotion', label: '情绪感受' },
  { id: 'people', label: '人物称呼' },
  { id: 'activity', label: '活动' },
  { id: 'place', label: '地点' },
]

const symbols: SymbolItem[] = [
  { id: '1', label: '喝水', emoji: '💧', category: 'daily' },
  { id: '2', label: '吃饭', emoji: '🍚', category: 'daily' },
  { id: '3', label: '上厕所', emoji: '🚽', category: 'daily' },
  { id: '4', label: '睡觉', emoji: '😴', category: 'daily' },
  { id: '5', label: '休息', emoji: '🛋️', category: 'daily' },
  { id: '6', label: '帮忙', emoji: '🆘', category: 'daily' },
  { id: '7', label: '洗澡', emoji: '🚿', category: 'daily' },
  { id: '8', label: '穿衣', emoji: '👕', category: 'daily' },
  { id: '9', label: '苹果', emoji: '🍎', category: 'food' },
  { id: '10', label: '面包', emoji: '🍞', category: 'food' },
  { id: '11', label: '牛奶', emoji: '🥛', category: 'food' },
  { id: '12', label: '水', emoji: '💧', category: 'food' },
  { id: '13', label: '饼干', emoji: '🍪', category: 'food' },
  { id: '14', label: '果汁', emoji: '🧃', category: 'food' },
  { id: '15', label: '米饭', emoji: '🍚', category: 'food' },
  { id: '16', label: '面条', emoji: '🍜', category: 'food' },
  { id: '17', label: '开心', emoji: '😊', category: 'emotion' },
  { id: '18', label: '难过', emoji: '😢', category: 'emotion' },
  { id: '19', label: '生气', emoji: '😠', category: 'emotion' },
  { id: '20', label: '害怕', emoji: '😨', category: 'emotion' },
  { id: '21', label: '累了', emoji: '😴', category: 'emotion' },
  { id: '22', label: '疼痛', emoji: '🤕', category: 'emotion' },
  { id: '23', label: '喜欢', emoji: '❤️', category: 'emotion' },
  { id: '24', label: '不喜欢', emoji: '👎', category: 'emotion' },
  { id: '25', label: '妈妈', emoji: '👩', category: 'people' },
  { id: '26', label: '爸爸', emoji: '👨', category: 'people' },
  { id: '27', label: '老师', emoji: '👩‍🏫', category: 'people' },
  { id: '28', label: '朋友', emoji: '👫', category: 'people' },
  { id: '29', label: '医生', emoji: '👨‍⚕️', category: 'people' },
  { id: '30', label: '奶奶', emoji: '👵', category: 'people' },
  { id: '31', label: '爷爷', emoji: '👴', category: 'people' },
  { id: '32', label: '同学', emoji: '👦', category: 'people' },
  { id: '33', label: '画画', emoji: '🎨', category: 'activity' },
  { id: '34', label: '唱歌', emoji: '🎵', category: 'activity' },
  { id: '35', label: '读书', emoji: '📖', category: 'activity' },
  { id: '36', label: '游戏', emoji: '🎮', category: 'activity' },
  { id: '37', label: '运动', emoji: '⚽', category: 'activity' },
  { id: '38', label: '散步', emoji: '🚶', category: 'activity' },
  { id: '39', label: '看电视', emoji: '📺', category: 'activity' },
  { id: '40', label: '玩玩具', emoji: '🧸', category: 'activity' },
  { id: '41', label: '教室', emoji: '🏫', category: 'place' },
  { id: '42', label: '家', emoji: '🏠', category: 'place' },
  { id: '43', label: '操场', emoji: '🏟️', category: 'place' },
  { id: '44', label: '医院', emoji: '🏥', category: 'place' },
  { id: '45', label: '公园', emoji: '🌳', category: 'place' },
  { id: '46', label: '商店', emoji: '🏪', category: 'place' },
  { id: '47', label: '餐厅', emoji: '🍽️', category: 'place' },
  { id: '48', label: '厕所', emoji: '🚻', category: 'place' },
]

interface Board {
  id: string
  name: string
  description: string
}

const boards: Board[] = [
  { id: 'default', name: '通用沟通板', description: '日常沟通常用符号' },
  { id: 'school', name: '学校沟通板', description: '学校场景专用符号' },
  { id: 'home', name: '家庭沟通板', description: '家庭场景专用符号' },
]

export default function AAC() {
  const [activeCategory, setActiveCategory] = useState('daily')
  const [selectedSymbols, setSelectedSymbols] = useState<SymbolItem[]>([])
  const [activeBoard, setActiveBoard] = useState('default')

  const filteredSymbols = symbols.filter((s) => s.category === activeCategory)

  const addSymbol = (symbol: SymbolItem) => {
    setSelectedSymbols((prev) => [...prev, symbol])
    speak(symbol.label)
  }

  const removeSymbol = (index: number) => {
    setSelectedSymbols((prev) => prev.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    setSelectedSymbols([])
  }

  const playAll = () => {
    const text = selectedSymbols.map((s) => s.label).join('，')
    speak(text)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">沟通辅助 (AAC)</h2>

      <div className="card bg-sky-50 border-sky-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-sky-700">句子栏</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={playAll}
              disabled={selectedSymbols.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
              aria-label="播放全部"
            >
              <Play size={14} />
              播放
            </button>
            <button
              onClick={clearAll}
              disabled={selectedSymbols.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label="清除全部"
            >
              <Trash2 size={14} />
              清除
            </button>
          </div>
        </div>
        <div className="min-h-[60px] flex items-center gap-2 flex-wrap bg-white rounded-xl p-3 border border-sky-200">
          {selectedSymbols.length === 0 ? (
            <span className="text-slate-400 text-sm">点击下方符号组成句子...</span>
          ) : (
            selectedSymbols.map((symbol, index) => (
              <button
                key={`${symbol.id}-${index}`}
                onClick={() => removeSymbol(index)}
                className="flex items-center gap-1 px-3 py-2 bg-sky-100 rounded-lg text-sm font-medium text-sky-700 hover:bg-sky-200 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
                aria-label={`移除 ${symbol.label}`}
              >
                <span>{symbol.emoji}</span>
                <span>{symbol.label}</span>
                <X size={12} className="text-sky-400" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="board-select" className="text-sm font-medium text-slate-600">沟通板：</label>
          <select
            id="board-select"
            value={activeBoard}
            onChange={(e) => setActiveBoard(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2" role="tablist" aria-label="符号分类">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                activeCategory === cat.id
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              role="tab"
              aria-selected={activeCategory === cat.id}
              aria-label={cat.label}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3" role="tabpanel">
          {filteredSymbols.map((symbol) => (
            <button
              key={symbol.id}
              onClick={() => addSymbol(symbol)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-sky-300 hover:bg-sky-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
              aria-label={symbol.label}
            >
              <span className="text-3xl">{symbol.emoji}</span>
              <span className="text-sm font-medium text-slate-700">{symbol.label}</span>
              <Volume2 size={14} className="text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
