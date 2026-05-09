import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const roles = [
  { value: 'parent', label: '家长' },
  { value: 'teacher', label: '教师' },
  { value: 'therapist', label: '治疗师' },
  { value: 'researcher', label: '研究者' },
]

export default function Register() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'parent',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { register, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.username.trim()) newErrors.username = '请输入用户名'
    else if (form.username.length < 3) newErrors.username = '用户名至少3个字符'
    if (!form.email.trim()) newErrors.email = '请输入邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = '邮箱格式不正确'
    if (!form.password) newErrors.password = '请输入密码'
    else if (form.password.length < 6) newErrors.password = '密码至少6位'
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = '两次密码不一致'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!validate()) return
    try {
      await register({
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
      })
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
            <h1 className="text-2xl font-bold text-slate-800">创建账号</h1>
            <p className="text-slate-500 mt-1">加入 MindBridge Assist</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="username" className="label-text">用户名</label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => updateField('username', e.target.value)}
                className={`input-field ${errors.username ? 'border-red-400' : ''}`}
                placeholder="请输入用户名"
                autoComplete="username"
                aria-invalid={!!errors.username}
              />
              {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="label-text">邮箱</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={`input-field ${errors.email ? 'border-red-400' : ''}`}
                placeholder="请输入邮箱"
                autoComplete="email"
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="label-text">密码</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={`input-field pr-12 ${errors.password ? 'border-red-400' : ''}`}
                  placeholder="请输入密码（至少6位）"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
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
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>

            <div className="mb-4">
              <label htmlFor="confirmPassword" className="label-text">确认密码</label>
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                className={`input-field ${errors.confirmPassword ? 'border-red-400' : ''}`}
                placeholder="请再次输入密码"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="role" className="label-text">角色</label>
              <select
                id="role"
                value={form.role}
                onChange={(e) => updateField('role', e.target.value)}
                className="input-field"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full text-lg"
              aria-label="注册"
            >
              {isLoading ? '注册中...' : '注 册'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-slate-500 text-sm">已有账号？</span>
            <Link to="/login" className="text-sky-500 hover:text-sky-600 text-sm font-semibold ml-1">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
