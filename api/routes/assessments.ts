import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.get('/scales', (_req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const result = db.exec(`SELECT id, name, description, category, min_age, max_age, item_count, scoring_rules, version FROM assessment_scales`)

    const scales = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      category: row[3],
      minAge: row[4],
      maxAge: row[5],
      itemCount: row[6],
      scoringRules: JSON.parse((row[7] as string) || '{}'),
      version: row[8]
    })) : []

    res.json({ success: true, data: scales })
  } catch {
    res.status(500).json({ success: false, error: '获取评估量表失败' })
  }
})

router.get('/scales/:id/items', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const result = db.exec(
      `SELECT id, scale_id, order_num, content, options, dimension, difficulty, scoring_key FROM scale_items WHERE scale_id = ? ORDER BY order_num`,
      [req.params.id]
    )

    const items = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      scaleId: row[1],
      orderNum: row[2],
      content: row[3],
      options: JSON.parse((row[4] as string) || '[]'),
      dimension: row[5],
      difficulty: row[6],
      scoringKey: JSON.parse((row[7] as string) || '{}')
    })) : []

    res.json({ success: true, data: items })
  } catch {
    res.status(500).json({ success: false, error: '获取量表题目失败' })
  }
})

router.post('/sessions', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { scaleId, userId } = req.body
    if (!scaleId || !userId) {
      res.status(400).json({ success: false, error: '量表ID和用户ID为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO assessment_sessions (id, user_id, scale_id, status, started_at) VALUES (?, ?, ?, 'in_progress', ?)`,
      [id, userId, scaleId, now]
    )
    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, userId, scaleId, status: 'in_progress', startedAt: now }
    })
  } catch {
    res.status(500).json({ success: false, error: '创建评估会话失败' })
  }
})

router.put('/sessions/:id/responses', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { itemId, response, duration } = req.body
    if (!itemId || response === undefined) {
      res.status(400).json({ success: false, error: '题目ID和作答为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    const existing = db.exec(
      `SELECT id FROM session_responses WHERE session_id = ? AND item_id = ?`,
      [req.params.id, itemId]
    )

    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run(
        `UPDATE session_responses SET response = ?, duration_ms = ?, created_at = ? WHERE session_id = ? AND item_id = ?`,
        [String(response), duration || null, now, req.params.id, itemId]
      )
    } else {
      db.run(
        `INSERT INTO session_responses (id, session_id, item_id, response, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, req.params.id, itemId, String(response), duration || null, now]
      )
    }
    saveDatabase()

    res.json({ success: true, data: { id, sessionId: req.params.id, itemId, response, durationMs: duration } })
  } catch {
    res.status(500).json({ success: false, error: '提交作答失败' })
  }
})

router.get('/sessions/:id/result', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()

    const sessionResult = db.exec(
      `SELECT id, user_id, scale_id, status, started_at, completed_at FROM assessment_sessions WHERE id = ?`,
      [req.params.id]
    )

    if (sessionResult.length === 0 || sessionResult[0].values.length === 0) {
      res.status(404).json({ success: false, error: '评估会话不存在' })
      return
    }

    const sessionRow = sessionResult[0].values[0]
    const sessionId = sessionRow[0] as string
    const scaleId = sessionRow[2] as string

    const responsesResult = db.exec(
      `SELECT sr.item_id, sr.response, si.dimension, si.options, si.order_num FROM session_responses sr JOIN scale_items si ON sr.item_id = si.id WHERE sr.session_id = ?`,
      [sessionId]
    )

    let totalScore = 0
    const dimensionScores: Record<string, number> = {}
    const dimensionCounts: Record<string, number> = {}

    if (responsesResult.length > 0) {
      for (const row of responsesResult[0].values) {
        const dimension = row[2] as string
        const optionsStr = row[3] as string
        const responseValue = Number(row[1])

        const options = JSON.parse(optionsStr || '[]')
        const selectedOption = options.find((opt: { value: number }) => opt.value === responseValue)
        const score = selectedOption ? selectedOption.value : responseValue

        totalScore += score
        dimensionScores[dimension] = (dimensionScores[dimension] || 0) + score
        dimensionCounts[dimension] = (dimensionCounts[dimension] || 0) + 1
      }
    }

    const maxScorePerItem = scaleId ? (() => {
      const itemsResult = db.exec(`SELECT options FROM scale_items WHERE scale_id = ?`, [scaleId])
      let maxTotal = 0
      if (itemsResult.length > 0) {
        for (const row of itemsResult[0].values) {
          const opts = JSON.parse((row[0] as string) || '[]')
          const maxOpt = opts.reduce((m: number, o: { value: number }) => Math.max(m, o.value), 0)
          maxTotal += maxOpt
        }
      }
      return maxTotal
    })() : 0

    const percentile = maxScorePerItem > 0 ? Math.round((totalScore / maxScorePerItem) * 100) : 0

    const now = new Date().toISOString()
    db.run(
      `UPDATE assessment_sessions SET status = 'completed', total_score = ?, dimension_scores = ?, completed_at = ? WHERE id = ?`,
      [totalScore, JSON.stringify(dimensionScores), now, sessionId]
    )
    saveDatabase()

    const responses = responsesResult.length > 0 ? responsesResult[0].values.map(row => ({
      itemId: row[0],
      response: row[1],
      dimension: row[2]
    })) : []

    res.json({
      success: true,
      data: {
        sessionId,
        scaleId,
        status: 'completed',
        totalScore,
        maxScore: maxScorePerItem,
        percentile,
        dimensionScores,
        responses,
        completedAt: now
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取评估结果失败' })
  }
})

router.get('/history/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const result = db.exec(
      `SELECT s.id, s.scale_id, s.status, s.total_score, s.dimension_scores, s.started_at, s.completed_at, sc.name as scale_name FROM assessment_sessions s JOIN assessment_scales sc ON s.scale_id = sc.id WHERE s.user_id = ? ORDER BY s.started_at DESC`,
      [req.params.userId]
    )

    const sessions = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      scaleId: row[1],
      status: row[2],
      totalScore: row[3],
      dimensionScores: JSON.parse((row[4] as string) || '{}'),
      startedAt: row[5],
      completedAt: row[6],
      scaleName: row[7]
    })) : []

    res.json({ success: true, data: sessions })
  } catch {
    res.status(500).json({ success: false, error: '获取评估历史失败' })
  }
})

export default router
