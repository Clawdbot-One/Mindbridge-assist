import { Router, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.get('/symbols', (req: AuthRequest, res: Response): void => {
  try {
    const { category, search } = req.query
    const db = getDatabase()

    let sql = `SELECT id, category, label, icon_name, image_url, metadata FROM aac_symbols WHERE 1=1`
    const params: string[] = []

    if (category) {
      sql += ` AND category = ?`
      params.push(category as string)
    }
    if (search) {
      sql += ` AND label LIKE ?`
      params.push(`%${search}%`)
    }

    sql += ` ORDER BY category, label`

    const result = db.exec(sql, params)

    const symbols = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      category: row[1],
      label: row[2],
      iconName: row[3],
      imageUrl: row[4],
      metadata: JSON.parse((row[5] as string) || '{}')
    })) : []

    res.json({ success: true, data: symbols })
  } catch {
    res.status(500).json({ success: false, error: '获取符号列表失败' })
  }
})

router.get('/boards', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const result = db.exec(
      `SELECT b.id, b.user_id, b.name, b.layout, b.is_default, b.created_at, COUNT(bs.id) as symbol_count FROM aac_boards b LEFT JOIN aac_board_symbols bs ON b.id = bs.board_id GROUP BY b.id ORDER BY b.is_default DESC, b.created_at DESC`
    )

    const boards = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      userId: row[1],
      name: row[2],
      layout: JSON.parse((row[3] as string) || '{}'),
      isDefault: row[4],
      createdAt: row[5],
      symbolCount: row[6]
    })) : []

    res.json({ success: true, data: boards })
  } catch {
    res.status(500).json({ success: false, error: '获取沟通板列表失败' })
  }
})

router.get('/boards/:id', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()

    const boardResult = db.exec(
      `SELECT id, user_id, name, layout, is_default, created_at FROM aac_boards WHERE id = ?`,
      [req.params.id]
    )

    if (boardResult.length === 0 || boardResult[0].values.length === 0) {
      res.status(404).json({ success: false, error: '沟通板不存在' })
      return
    }

    const boardRow = boardResult[0].values[0]

    const symbolsResult = db.exec(
      `SELECT s.id, s.category, s.label, s.icon_name, s.image_url, s.metadata, bs.position FROM aac_board_symbols bs JOIN aac_symbols s ON bs.symbol_id = s.id WHERE bs.board_id = ? ORDER BY bs.position`,
      [req.params.id]
    )

    const symbols = symbolsResult.length > 0 ? symbolsResult[0].values.map(row => ({
      id: row[0],
      category: row[1],
      label: row[2],
      iconName: row[3],
      imageUrl: row[4],
      metadata: JSON.parse((row[5] as string) || '{}'),
      position: row[6]
    })) : []

    res.json({
      success: true,
      data: {
        id: boardRow[0],
        userId: boardRow[1],
        name: boardRow[2],
        layout: JSON.parse((boardRow[3] as string) || '{}'),
        isDefault: boardRow[4],
        createdAt: boardRow[5],
        symbols
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取沟通板详情失败' })
  }
})

router.post('/boards', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { name, symbolIds, layout } = req.body
    if (!name) {
      res.status(400).json({ success: false, error: '沟通板名称为必填项' })
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO aac_boards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
      [id, req.userId!, name, JSON.stringify(layout || {}), now]
    )

    if (symbolIds && Array.isArray(symbolIds)) {
      symbolIds.forEach((symbolId: string, index: number) => {
        db.run(
          `INSERT INTO aac_board_symbols (id, board_id, symbol_id, position) VALUES (?, ?, ?, ?)`,
          [uuidv4(), id, symbolId, index + 1]
        )
      })
    }

    saveDatabase()

    res.status(201).json({
      success: true,
      data: { id, userId: req.userId, name, layout: layout || {}, isDefault: 0, createdAt: now, symbols: symbolIds || [] }
    })
  } catch {
    res.status(500).json({ success: false, error: '创建沟通板失败' })
  }
})

router.put('/boards/:id', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { name, symbolIds, layout } = req.body
    const db = getDatabase()

    const existing = db.exec(`SELECT id FROM aac_boards WHERE id = ?`, [req.params.id])
    if (existing.length === 0 || existing[0].values.length === 0) {
      res.status(404).json({ success: false, error: '沟通板不存在' })
      return
    }

    if (name) {
      db.run(`UPDATE aac_boards SET name = ? WHERE id = ?`, [name, req.params.id])
    }
    if (layout) {
      db.run(`UPDATE aac_boards SET layout = ? WHERE id = ?`, [JSON.stringify(layout), req.params.id])
    }

    if (symbolIds && Array.isArray(symbolIds)) {
      db.run(`DELETE FROM aac_board_symbols WHERE board_id = ?`, [req.params.id])
      symbolIds.forEach((symbolId: string, index: number) => {
        db.run(
          `INSERT INTO aac_board_symbols (id, board_id, symbol_id, position) VALUES (?, ?, ?, ?)`,
          [uuidv4(), req.params.id, symbolId, index + 1]
        )
      })
    }

    saveDatabase()

    res.json({ success: true, data: { id: req.params.id, updated: true } })
  } catch {
    res.status(500).json({ success: false, error: '更新沟通板失败' })
  }
})

router.get('/templates', (_req: AuthRequest, res: Response): void => {
  try {
    const templates = [
      {
        id: 'template-basic',
        name: '基础沟通板模板',
        description: '包含日常需求、食物饮品等基础沟通符号',
        layout: { columns: 5, rows: 6 },
        categories: ['日常需求', '食物饮品', '情绪感受']
      },
      {
        id: 'template-emotion',
        name: '情绪表达板模板',
        description: '专注于情绪识别和表达',
        layout: { columns: 5, rows: 2 },
        categories: ['情绪感受']
      },
      {
        id: 'template-social',
        name: '社交互动板模板',
        description: '包含人物称呼和活动相关符号',
        layout: { columns: 5, rows: 4 },
        categories: ['人物称呼', '活动', '地点']
      },
      {
        id: 'template-full',
        name: '完整沟通板模板',
        description: '包含所有类别的符号',
        layout: { columns: 6, rows: 6 },
        categories: ['日常需求', '食物饮品', '情绪感受', '人物称呼', '活动', '地点']
      }
    ]

    res.json({ success: true, data: templates })
  } catch {
    res.status(500).json({ success: false, error: '获取沟通板模板失败' })
  }
})

export default router
