import { useState, useEffect } from 'react'
import { Plus, Send, CheckCircle2, Clock, MessageSquare, ListTodo } from 'lucide-react'
import { api } from '@/lib/api'

interface Message {
  id: string
  sender: string
  content: string
  timestamp: string
  read: boolean
}

interface Task {
  id: string
  title: string
  assignee: string
  status: 'pending' | 'in_progress' | 'completed'
  dueDate: string
}

const statusLabels: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
}

const statusColors: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

export default function Collaboration() {
  const [messages, setMessages] = useState<Message[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', assignee: '', dueDate: '' })

  useEffect(() => {
    async function fetchData() {
      try {
        const [msgRes, taskRes] = await Promise.all([
          api.get<Message[]>('/collaboration/messages'),
          api.get<Task[]>('/collaboration/tasks'),
        ])
        setMessages(msgRes)
        setTasks(taskRes)
      } catch {
        setMessages([])
        setTasks([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    try {
      const res = await api.post<Message>('/collaboration/messages', { content: newMessage })
      setMessages((prev) => [res, ...prev])
      setNewMessage('')
    } catch {
      // handle error
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await api.post<Task>('/collaboration/tasks', taskForm)
      setTasks((prev) => [res, ...prev])
      setTaskForm({ title: '', assignee: '', dueDate: '' })
      setShowNewTask(false)
    } catch {
      // handle error
    }
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
        <h2 className="text-2xl font-bold text-slate-800">协作中心</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={20} className="text-sky-500" />
              <h3 className="text-lg font-bold text-slate-800">消息</h3>
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="input-field flex-1"
                placeholder="输入消息..."
                aria-label="消息内容"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="btn-primary px-4 disabled:opacity-50"
                aria-label="发送消息"
              >
                <Send size={16} />
              </button>
            </div>
          </form>

          {messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare size={32} className="mx-auto mb-2" />
              <p>暂无消息</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl ${msg.read ? 'bg-white' : 'bg-sky-50'} border border-slate-100`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">{msg.sender}</span>
                    <span className="text-xs text-slate-400">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-slate-600">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListTodo size={20} className="text-emerald-500" />
              <h3 className="text-lg font-bold text-slate-800">任务</h3>
            </div>
            <button
              onClick={() => setShowNewTask(!showNewTask)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="新建任务"
            >
              <Plus size={14} />
              新建
            </button>
          </div>

          {showNewTask && (
            <form onSubmit={handleCreateTask} className="mb-4 p-4 bg-emerald-50 rounded-xl space-y-3">
              <div>
                <label htmlFor="task-title" className="label-text">任务标题</label>
                <input
                  id="task-title"
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="input-field"
                  placeholder="请输入任务标题"
                />
              </div>
              <div>
                <label htmlFor="task-assignee" className="label-text">负责人</label>
                <input
                  id="task-assignee"
                  type="text"
                  value={taskForm.assignee}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, assignee: e.target.value }))}
                  className="input-field"
                  placeholder="请输入负责人"
                />
              </div>
              <div>
                <label htmlFor="task-due" className="label-text">截止日期</label>
                <input
                  id="task-due"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-secondary text-sm py-2 px-4">创建</button>
                <button
                  type="button"
                  onClick={() => setShowNewTask(false)}
                  className="btn-outline text-sm py-2 px-4"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {tasks.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 size={32} className="mx-auto mb-2" />
              <p>暂无任务</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tasks.map((task) => (
                <div key={task.id} className="p-3 rounded-xl border border-slate-100 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">{task.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                      {statusLabels[task.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>负责人：{task.assignee}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {task.dueDate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
