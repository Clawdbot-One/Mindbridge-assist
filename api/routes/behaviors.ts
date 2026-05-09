import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.post('/records', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { userId, antecedent, behavior, consequence, category, intensity, durationMin, environment } = req.body
    if (!userId || !antecedent || !behavior || !consequence || !category || !intensity) {
      res.status(400).json({ success: false, error: '缺少必填字段' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO behavior_records (id, user_id, antecedent, behavior, consequence, category, intensity, duration_min, environment, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, antecedent, behavior, consequence, category, intensity, durationMin || null, environment || null, now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, userId, antecedent, behavior, consequence, category, intensity, durationMin, environment, occurredAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '创建行为记录失败' })
  }
})

router.get('/records/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { startDate, endDate, category } = req.query
    const db = getDatabase()

    let sql = `SELECT id, user_id, antecedent, behavior, consequence, category, intensity, duration_min, environment, occurred_at FROM behavior_records WHERE user_id = ?`
    const params: (string | number)[] = [req.params.userId]

    if (startDate) {
      sql += ` AND occurred_at >= ?`
      params.push(startDate as string)
    }
    if (endDate) {
      sql += ` AND occurred_at <= ?`
      params.push(endDate as string)
    }
    if (category) {
      sql += ` AND category = ?`
      params.push(category as string)
    }

    sql += ` ORDER BY occurred_at DESC`

    const result = db.exec(sql, params)

    const records = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      userId: row[1],
      antecedent: row[2],
      behavior: row[3],
      consequence: row[4],
      category: row[5],
      intensity: row[6],
      durationMin: row[7],
      environment: row[8],
      occurredAt: row[9]
    })) : []

    res.json({ success: true, data: records })
  } catch {
    res.status(500).json({ success: false, error: '获取行为记录失败' })
  }
})

router.get('/patterns/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const userId = req.params.userId

    const categoryResult = db.exec(
      `SELECT category, COUNT(*) as count FROM behavior_records WHERE user_id = ? GROUP BY category ORDER BY count DESC`,
      [userId]
    )

    const categoryFrequency = categoryResult.length > 0 ? categoryResult[0].values.map(row => ({
      category: row[0],
      count: row[1]
    })) : []

    const antecedentResult = db.exec(
      `SELECT antecedent, COUNT(*) as count FROM behavior_records WHERE user_id = ? GROUP BY antecedent ORDER BY count DESC LIMIT 5`,
      [userId]
    )

    const commonAntecedents = antecedentResult.length > 0 ? antecedentResult[0].values.map(row => ({
      antecedent: row[0],
      count: row[1]
    })) : []

    const consequenceResult = db.exec(
      `SELECT consequence, COUNT(*) as count FROM behavior_records WHERE user_id = ? GROUP BY consequence ORDER BY count DESC LIMIT 5`,
      [userId]
    )

    const commonConsequences = consequenceResult.length > 0 ? consequenceResult[0].values.map(row => ({
      consequence: row[0],
      count: row[1]
    })) : []

    const intensityResult = db.exec(
      `SELECT category, AVG(intensity) as avg_intensity, MAX(intensity) as max_intensity FROM behavior_records WHERE user_id = ? GROUP BY category`,
      [userId]
    )

    const intensityByCategory = intensityResult.length > 0 ? intensityResult[0].values.map(row => ({
      category: row[0],
      avgIntensity: Math.round((row[1] as number) * 10) / 10,
      maxIntensity: row[2]
    })) : []

    const environmentResult = db.exec(
      `SELECT environment, COUNT(*) as count FROM behavior_records WHERE user_id = ? AND environment IS NOT NULL GROUP BY environment ORDER BY count DESC LIMIT 5`,
      [userId]
    )

    const commonEnvironments = environmentResult.length > 0 ? environmentResult[0].values.map(row => ({
      environment: row[0],
      count: row[1]
    })) : []

    res.json({
      success: true,
      data: {
        categoryFrequency,
        commonAntecedents,
        commonConsequences,
        intensityByCategory,
        commonEnvironments
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取行为模式分析失败' })
  }
})

router.get('/alerts', authMiddleware, (_req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()

    const recentHighIntensity = db.exec(
      `SELECT br.id, br.user_id, br.behavior, br.category, br.intensity, br.occurred_at, u.display_name FROM behavior_records br JOIN users u ON br.user_id = u.id WHERE br.intensity >= 7 AND br.occurred_at >= datetime('now', '-7 days') ORDER BY br.occurred_at DESC`
    )

    const alerts = recentHighIntensity.length > 0 ? recentHighIntensity[0].values.map(row => ({
      id: row[0],
      userId: row[1],
      behavior: row[2],
      category: row[3],
      intensity: row[4],
      occurredAt: row[5],
      userName: row[6],
      alertType: 'high_intensity',
      message: `${row[6]} 在 ${row[5]} 出现高强度(${row[4]})行为: ${row[2]}`
    })) : []

    const frequentRecent = db.exec(
      `SELECT br.user_id, br.behavior, COUNT(*) as count, u.display_name FROM behavior_records br JOIN users u ON br.user_id = u.id WHERE br.occurred_at >= datetime('now', '-3 days') GROUP BY br.user_id, br.behavior HAVING count >= 3 ORDER BY count DESC`
    )

    const frequentAlerts = frequentRecent.length > 0 ? frequentRecent[0].values.map(row => ({
      userId: row[0],
      behavior: row[1],
      count: row[2],
      userName: row[3],
      alertType: 'frequent_behavior',
      message: `${row[3]} 近3天内"${row[1]}"行为出现${row[2]}次`
    })) : []

    res.json({
      success: true,
      data: [...alerts, ...frequentAlerts]
    })
  } catch {
    res.status(500).json({ success: false, error: '获取行为预警失败' })
  }
})

export default router
