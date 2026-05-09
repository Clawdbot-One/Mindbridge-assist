import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, saveDatabase } from '../database.js'
import { authMiddleware, generateToken, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password, email, role, displayName } = req.body
    if (!username || !password || !email) {
      res.status(400).json({ success: false, error: '用户名、密码和邮箱为必填项' })
      return
    }

    const validRoles = ['service_user', 'parent', 'family', 'teacher', 'therapist', 'researcher', 'org_admin', 'sys_admin']
    const userRole = validRoles.includes(role) ? role : 'service_user'
    const name = displayName || username

    const db = getDatabase()
    const existing = db.exec(`SELECT id FROM users WHERE username = ? OR email = ?`, [username, email])
    if (existing.length > 0 && existing[0].values.length > 0) {
      res.status(409).json({ success: false, error: '用户名或邮箱已存在' })
      return
    }

    const id = uuidv4()
    const hash = await bcrypt.hash(password, 10)

    db.run(
      `INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, username, email, hash, userRole, name]
    )
    saveDatabase()

    const token = generateToken(id, userRole)
    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id, username, email, role: userRole, displayName: name }
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('CONSTRAINT') || msg.includes('CHECK')) {
      res.status(400).json({ success: false, error: '角色类型无效' })
    } else {
      res.status(500).json({ success: false, error: '注册失败' })
    }
  }
})

router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ success: false, error: '用户名和密码为必填项' })
      return
    }

    const db = getDatabase()
    const result = db.exec(`SELECT id, username, email, password_hash, role, display_name, avatar, accessibility_config FROM users WHERE username = ?`, [username])

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(401).json({ success: false, error: '用户名或密码错误' })
      return
    }

    const row = result[0].values[0]
    const user = {
      id: row[0] as string,
      username: row[1] as string,
      email: row[2] as string,
      passwordHash: row[3] as string,
      role: row[4] as string,
      displayName: row[5] as string,
      avatar: row[6] as string | null,
      accessibilityConfig: row[7] as string,
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      res.status(401).json({ success: false, error: '用户名或密码错误' })
      return
    }

    const token = generateToken(user.id, user.role)
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          avatar: user.avatar,
          accessibilityConfig: JSON.parse(user.accessibilityConfig || '{}')
        }
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '登录失败' })
  }
})

router.get('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDatabase()
    const result = db.exec(`SELECT id, username, email, role, display_name, avatar, accessibility_config FROM users WHERE id = ?`, [req.userId!])

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(404).json({ success: false, error: '用户不存在' })
      return
    }

    const row = result[0].values[0]
    res.json({
      success: true,
      data: {
        id: row[0],
        username: row[1],
        email: row[2],
        role: row[3],
        displayName: row[4],
        avatar: row[5],
        accessibilityConfig: JSON.parse((row[6] as string) || '{}')
      }
    })
  } catch {
    res.status(500).json({ success: false, error: '获取用户信息失败' })
  }
})

export default router
