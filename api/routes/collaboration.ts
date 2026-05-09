import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.get('/messages', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { userId, page } = req.query
    const db = getDatabase()
    const pageNum = Number(page) || 1
    const pageSize = 20
    const offset = (pageNum - 1) * pageSize

    let sql = `SELECT m.id, m.from_user_id, m.to_user_id, m.content, m.type, m.read, m.created_at, u1.display_name as from_name, u2.display_name as to_name FROM collaboration_messages m JOIN users u1 ON m.from_user_id = u1.id JOIN users u2 ON m.to_user_id = u2.id WHERE 1=1`
    const params: (string | number)[] = []

    if (userId) {
      sql += ` AND (m.from_user_id = ? OR m.to_user_id = ?)`
      params.push(userId as string, userId as string)
    }

    sql += ` ORDER BY m.created_at DESC LIMIT ? OFFSET ?`
    params.push(pageSize, offset)

    const result = db.exec(sql, params)

    const messages = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      fromUserId: row[1],
      toUserId: row[2],
      content: row[3],
      type: row[4],
      read: row[5],
      createdAt: row[6],
      fromName: row[7],
      toName: row[8]
    })) : []

    res.json({ success: true, data: messages, page: pageNum, pageSize })
  } catch {
    res.status(500).json({ success: false, error: '获取消息列表失败' })
  }
})

router.post('/messages', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { to, content, type } = req.body
    if (!to || !content) {
      res.status(400).json({ success: false, error: '接收者和内容为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()
    const messageType = type || 'message'

    db.run(
      `INSERT INTO collaboration_messages (id, from_user_id, to_user_id, content, type, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [id, req.userId!, to, content, messageType, now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, fromUserId: req.userId, toUserId: to, content, type: messageType, read: 0, createdAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '发送消息失败' })
  }
})

router.put('/messages/:id/read', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()

    const existing = db.exec(`SELECT id FROM collaboration_messages WHERE id = ?`, [req.params.id])
    if (existing.length === 0 || existing[0].values.length === 0) {
      res.status(404).json({ success: false, error: '消息不存在' })
      return
    }

    db.run(`UPDATE collaboration_messages SET read = 1 WHERE id = ?`, [req.params.id])
    saveDatabase()

    res.json({ success: true, data: { id: req.params.id, read: 1 } })
  } catch {
    res.status(500).json({ success: false, error: '标记已读失败' })
  }
})

router.get('/tasks', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { status, assigneeId } = req.query
    const db = getDatabase()

    let sql = `SELECT t.id, t.creator_id, t.assignee_id, t.title, t.description, t.status, t.due_date, t.created_at, u1.display_name as creator_name, u2.display_name as assignee_name FROM tasks t JOIN users u1 ON t.creator_id = u1.id JOIN users u2 ON t.assignee_id = u2.id WHERE 1=1`
    const params: string[] = []

    if (status) {
      sql += ` AND t.status = ?`
      params.push(status as string)
    }
    if (assigneeId) {
      sql += ` AND t.assignee_id = ?`
      params.push(assigneeId as string)
    }

    sql += ` ORDER BY t.created_at DESC`

    const result = db.exec(sql, params)

    const tasks = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      creatorId: row[1],
      assigneeId: row[2],
      title: row[3],
      description: row[4],
      status: row[5],
      dueDate: row[6],
      createdAt: row[7],
      creatorName: row[8],
      assigneeName: row[9]
    })) : []

    res.json({ success: true, data: tasks })
  } catch {
    res.status(500).json({ success: false, error: '获取任务列表失败' })
  }
})

router.post('/tasks', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { title, assigneeId, dueDate, description } = req.body
    if (!title || !assigneeId) {
      res.status(400).json({ success: false, error: '任务标题和指派人为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO tasks (id, creator_id, assignee_id, title, description, status, due_date, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, req.userId!, assigneeId, title, description || null, dueDate || null, now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, creatorId: req.userId, assigneeId, title, description, status: 'pending', dueDate, createdAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '创建任务失败' })
  }
})

router.put('/tasks/:id', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { status, title, description, dueDate, assigneeId } = req.body
    const db = getDatabase()

    const existing = db.exec(`SELECT id FROM tasks WHERE id = ?`, [req.params.id])
    if (existing.length === 0 || existing[0].values.length === 0) {
      res.status(404).json({ success: false, error: '任务不存在' })
      return
    }

    if (status) {
      db.run(`UPDATE tasks SET status = ? WHERE id = ?`, [status, req.params.id])
    }
    if (title) {
      db.run(`UPDATE tasks SET title = ? WHERE id = ?`, [title, req.params.id])
    }
    if (description !== undefined) {
      db.run(`UPDATE tasks SET description = ? WHERE id = ?`, [description, req.params.id])
    }
    if (dueDate !== undefined) {
      db.run(`UPDATE tasks SET due_date = ? WHERE id = ?`, [dueDate, req.params.id])
    }
    if (assigneeId) {
      db.run(`UPDATE tasks SET assignee_id = ? WHERE id = ?`, [assigneeId, req.params.id])
    }

    saveDatabase()

    res.json({ success: true, data: { id: req.params.id, updated: true } })
  } catch {
    res.status(500).json({ success: false, error: '更新任务失败' })
  }
})

export default router
