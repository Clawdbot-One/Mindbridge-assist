import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { userId, type, status } = req.query
    const db = getDatabase()

    let sql = `SELECT r.id, r.user_id, r.type, r.title, r.status, r.content, r.pdf_url, r.created_at, u.display_name FROM reports r JOIN users u ON r.user_id = u.id WHERE 1=1`
    const params: string[] = []

    if (userId) {
      sql += ` AND r.user_id = ?`
      params.push(userId as string)
    }
    if (type) {
      sql += ` AND r.type = ?`
      params.push(type as string)
    }
    if (status) {
      sql += ` AND r.status = ?`
      params.push(status as string)
    }

    sql += ` ORDER BY r.created_at DESC`

    const result = db.exec(sql, params)

    const reports = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      userId: row[1],
      type: row[2],
      title: row[3],
      status: row[4],
      content: JSON.parse((row[5] as string) || '{}'),
      pdfUrl: row[6],
      createdAt: row[7],
      userName: row[8]
    })) : []

    res.json({ success: true, data: reports })
  } catch {
    res.status(500).json({ success: false, error: '获取报告列表失败' })
  }
})

router.get('/:id', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()

    const result = db.exec(
      `SELECT r.id, r.user_id, r.type, r.title, r.status, r.content, r.pdf_url, r.created_at, u.display_name FROM reports r JOIN users u ON r.user_id = u.id WHERE r.id = ?`,
      [req.params.id]
    )

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(404).json({ success: false, error: '报告不存在' })
      return
    }

    const row = result[0].values[0]

    res.json({
      success: true,
      data: {
        id: row[0],
        userId: row[1],
        type: row[2],
        title: row[3],
        status: row[4],
        content: JSON.parse((row[5] as string) || '{}'),
        pdfUrl: row[6],
        createdAt: row[7],
        userName: row[8]
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取报告详情失败' })
  }
})

router.post('/generate', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { userId, type, dateRange } = req.body
    if (!userId || !type) {
      res.status(400).json({ success: false, error: '用户ID和报告类型为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    const userResult = db.exec(`SELECT display_name FROM users WHERE id = ?`, [userId])
    const userName = userResult.length > 0 && userResult[0].values.length > 0 ? userResult[0].values[0][0] : '未知用户'

    const content: Record<string, unknown> = { userName, generatedAt: now, type }

    if (dateRange) {
      content.dateRange = dateRange
    }

    if (type === 'assessment' || type === 'comprehensive') {
      const sessionsResult = db.exec(
        `SELECT s.id, s.scale_id, s.total_score, s.dimension_scores, s.status, s.completed_at, sc.name FROM assessment_sessions s JOIN assessment_scales sc ON s.scale_id = sc.id WHERE s.user_id = ? AND s.status = 'completed' ORDER BY s.completed_at DESC`,
        [userId]
      )

      content.assessments = sessionsResult.length > 0 ? sessionsResult[0].values.map(row => ({
        sessionId: row[0],
        scaleId: row[1],
        totalScore: row[2],
        dimensionScores: JSON.parse((row[3] as string) || '{}'),
        completedAt: row[5],
        scaleName: row[6]
      })) : []
    }

    if (type === 'behavior' || type === 'comprehensive') {
      const behaviorResult = db.exec(
        `SELECT category, COUNT(*) as count, AVG(intensity) as avg_intensity FROM behavior_records WHERE user_id = ? GROUP BY category`,
        [userId]
      )

      content.behaviorSummary = behaviorResult.length > 0 ? behaviorResult[0].values.map(row => ({
        category: row[0],
        count: row[1],
        avgIntensity: Math.round((row[2] as number) * 10) / 10
      })) : []

      const totalBehaviorResult = db.exec(
        `SELECT COUNT(*) as total FROM behavior_records WHERE user_id = ?`,
        [userId]
      )
      content.totalBehaviorRecords = totalBehaviorResult.length > 0 ? totalBehaviorResult[0].values[0][0] : 0
    }

    if (type === 'emotion' || type === 'comprehensive') {
      const emotionResult = db.exec(
        `SELECT emotion_type, COUNT(*) as count, AVG(intensity) as avg_intensity FROM emotion_records WHERE user_id = ? GROUP BY emotion_type ORDER BY count DESC`,
        [userId]
      )

      content.emotionSummary = emotionResult.length > 0 ? emotionResult[0].values.map(row => ({
        emotionType: row[0],
        count: row[1],
        avgIntensity: Math.round((row[2] as number) * 10) / 10
      })) : []

      const totalEmotionResult = db.exec(
        `SELECT COUNT(*) as total FROM emotion_records WHERE user_id = ?`,
        [userId]
      )
      content.totalEmotionRecords = totalEmotionResult.length > 0 ? totalEmotionResult[0].values[0][0] : 0
    }

    const titleMap: Record<string, string> = {
      assessment: `${userName} - 评估报告`,
      behavior: `${userName} - 行为分析报告`,
      emotion: `${userName} - 情绪追踪报告`,
      comprehensive: `${userName} - 综合报告`
    }

    const title = titleMap[type] || `${userName} - 报告`

    db.run(
      `INSERT INTO reports (id, user_id, type, title, status, content, created_at) VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
      [id, userId, type, title, JSON.stringify(content), now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, userId, type, title, status: 'completed', content, createdAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '生成报告失败' })
  }
})

export default router
