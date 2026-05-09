import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.post('/records', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { userId, emotionType, intensity, note, triggers } = req.body
    if (!userId || !emotionType || !intensity) {
      res.status(400).json({ success: false, error: '缺少必填字段' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO emotion_records (id, user_id, emotion_type, intensity, note, triggers, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, emotionType, intensity, note || null, JSON.stringify(triggers || []), now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, userId, emotionType, intensity, note, triggers: triggers || [], recordedAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '创建情绪记录失败' })
  }
})

router.get('/records/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()

    let sql = `SELECT id, user_id, emotion_type, intensity, note, triggers, recorded_at FROM emotion_records WHERE user_id = ?`
    const params: (string | number)[] = [req.params.userId]

    if (startDate) {
      sql += ` AND recorded_at >= ?`
      params.push(startDate as string)
    }
    if (endDate) {
      sql += ` AND recorded_at <= ?`
      params.push(endDate as string)
    }

    sql += ` ORDER BY recorded_at DESC`

    const result = db.exec(sql, params)

    const records = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      userId: row[1],
      emotionType: row[2],
      intensity: row[3],
      note: row[4],
      triggers: JSON.parse((row[5] as string) || '[]'),
      recordedAt: row[6]
    })) : []

    res.json({ success: true, data: records })
  } catch {
    res.status(500).json({ success: false, error: '获取情绪记录失败' })
  }
})

router.get('/trends/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { period } = req.query
    const db = getDatabase()
    const userId = req.params.userId

    let dateFormat: string
    let periodLabel: string
    switch (period) {
      case 'week':
        dateFormat = '%Y-W%W'
        periodLabel = '周'
        break
      case 'year':
        dateFormat = '%Y-%m'
        periodLabel = '月'
        break
      default:
        dateFormat = '%Y-%m-%d'
        periodLabel = '日'
    }

    const frequencyResult = db.exec(
      `SELECT strftime('${dateFormat}', recorded_at) as period, emotion_type, COUNT(*) as count FROM emotion_records WHERE user_id = ? GROUP BY period, emotion_type ORDER BY period`,
      [userId]
    )

    const frequency = frequencyResult.length > 0 ? frequencyResult[0].values.map(row => ({
      period: row[0],
      emotionType: row[1],
      count: row[2]
    })) : []

    const intensityResult = db.exec(
      `SELECT strftime('${dateFormat}', recorded_at) as period, emotion_type, AVG(intensity) as avg_intensity FROM emotion_records WHERE user_id = ? GROUP BY period, emotion_type ORDER BY period`,
      [userId]
    )

    const intensity = intensityResult.length > 0 ? intensityResult[0].values.map(row => ({
      period: row[0],
      emotionType: row[1],
      avgIntensity: Math.round((row[2] as number) * 10) / 10
    })) : []

    const overallResult = db.exec(
      `SELECT emotion_type, COUNT(*) as total_count, AVG(intensity) as avg_intensity FROM emotion_records WHERE user_id = ? GROUP BY emotion_type ORDER BY total_count DESC`,
      [userId]
    )

    const overall = overallResult.length > 0 ? overallResult[0].values.map(row => ({
      emotionType: row[0],
      totalCount: row[1],
      avgIntensity: Math.round((row[2] as number) * 10) / 10
    })) : []

    res.json({
      success: true,
      data: {
        period: period || 'day',
        periodLabel,
        frequency,
        intensity,
        overall
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取情绪趋势失败' })
  }
})

export default router
