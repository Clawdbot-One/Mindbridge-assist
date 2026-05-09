import { useState, useEffect } from 'react'
import { Save, Download, User } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'

type FontSize = 'normal' | 'large' | 'xlarge'

const fontSizeLabels: Record<FontSize, string> = {
  normal: '标准',
  large: '大号',
  xlarge: '超大号',
}

export default function Profile() {
  const { user, loadUser } = useAuthStore()
  const { accessibility, updateAccessibility } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    email: '',
  })

  useEffect(() => {
    loadUser()
  }, [loadUser])

  useEffect(() => {
    if (user) {
      setProfileForm({
        displayName: user.displayName || '',
        email: user.email || '',
      })
    }
  }, [user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await loadUser()
    } catch {
      // handle error
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    alert('数据导出功能暂未开放')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">个人中心</h2>

      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <User size={20} className="text-sky-500" />
          <h3 className="text-lg font-bold text-slate-800">个人信息</h3>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="label-text">显示名称</label>
            <input
              id="displayName"
              type="text"
              value={profileForm.displayName}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="email" className="label-text">邮箱</label>
            <input
              id="email"
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
              className="input-field"
            />
          </div>

          <div>
            <label className="label-text">角色</label>
            <div className="px-4 py-3 bg-slate-50 rounded-xl text-slate-600">
              {user?.role === 'parent' ? '家长' : user?.role === 'teacher' ? '教师' : user?.role === 'therapist' ? '治疗师' : user?.role === 'researcher' ? '研究者' : user?.role || '未设置'}
            </div>
          </div>

          <div>
            <label className="label-text">用户名</label>
            <div className="px-4 py-3 bg-slate-50 rounded-xl text-slate-600">
              {user?.username || '未设置'}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
            aria-label="保存个人信息"
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存修改'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-6">无障碍配置</h3>

        <div className="space-y-6">
          <div>
            <label className="label-text mb-3">字体大小</label>
            <div className="flex gap-3">
              {(['normal', 'large', 'xlarge'] as FontSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => updateAccessibility({ fontSize: size })}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    accessibility.fontSize === size
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  aria-label={`字体大小：${fontSizeLabels[size]}`}
                  aria-pressed={accessibility.fontSize === size}
                >
                  {fontSizeLabels[size]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium text-slate-700">高对比度模式</div>
              <div className="text-sm text-slate-400">增强界面元素的对比度</div>
            </div>
            <button
              onClick={() => updateAccessibility({ highContrast: !accessibility.highContrast })}
              className={`relative w-12 h-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                accessibility.highContrast ? 'bg-sky-500' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={accessibility.highContrast}
              aria-label="高对比度模式"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow-sm ${
                  accessibility.highContrast ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium text-slate-700">简化模式</div>
              <div className="text-sm text-slate-400">减少界面元素，简化操作流程</div>
            </div>
            <button
              onClick={() => updateAccessibility({ simplifiedMode: !accessibility.simplifiedMode })}
              className={`relative w-12 h-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                accessibility.simplifiedMode ? 'bg-sky-500' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={accessibility.simplifiedMode}
              aria-label="简化模式"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow-sm ${
                  accessibility.simplifiedMode ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-slate-800 mb-4">数据管理</h3>
        <p className="text-sm text-slate-500 mb-4">导出您的所有数据，包括评估记录、行为记录、情绪记录等。</p>
        <button
          onClick={handleExport}
          className="btn-outline flex items-center gap-2"
          aria-label="导出数据"
        >
          <Download size={16} />
          导出数据
        </button>
      </div>
    </div>
  )
}
