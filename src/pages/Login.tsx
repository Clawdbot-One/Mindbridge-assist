import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Brain, Accessibility } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const { login, isLoading, error, clearError } = useAuthStore()
  const { accessibility, updateAccessibility } = useAppStore()
  const navigate = useNavigate()

  const validate = () => {
    const newErrors: { username?: string; password?: string } = {}
    if (!username.trim()) newErrors.username = '请输入用户名'
    if (!password) newErrors.password = '请输入密码'
    else if (password.length < 6) newErrors.password = '密码至少6位'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!validate()) return
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      // error is set in store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-400 via-sky-500 to-emerald-500 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-50 rounded-2xl mb-4">
              <Brain className="text-sky-500" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">MindBridge Assist</h1>
            <p className="text-slate-500 mt-1">智能心理健康辅助平台</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label htmlFor="username" className="label-text">用户名</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`input-field ${errors.username ? 'border-red-400 focus:ring-red-400' : ''}`}
                placeholder="请输入用户名"
                autoComplete="username"
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? 'username-error' : undefined}
              />
              {errors.username && (
                <p id="username-error" className="text-red-500 text-sm mt-1">{errors.username}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="label-text">密码</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`input-field pr-12 ${errors.password ? 'border-red-400 focus:ring-red-400' : ''}`}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-red-500 text-sm mt-1">{errors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full text-lg"
              aria-label="登录"
            >
              {isLoading ? '登录中...' : '登 录'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-slate-500 text-sm">还没有账号？</span>
            <Link to="/register" className="text-sky-500 hover:text-sky-600 text-sm font-semibold ml-1">
              立即注册
            </Link>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => updateAccessibility({ simplifiedMode: !accessibility.simplifiedMode })}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-sky-500 transition-colors"
              aria-label="切换无障碍模式"
            >
              <Accessibility size={16} />
              {accessibility.simplifiedMode ? '标准模式' : '无障碍模式'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
