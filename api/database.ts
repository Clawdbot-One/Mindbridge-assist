import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let db: Database

export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  const dbPath = path.join(__dirname, '..', 'data', 'mindbridge.db')

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
    createTables()
    await seedData()
    saveDatabase()
  }

  return db
}

export function saveDatabase() {
  const data = db.export()
  const buffer = Buffer.from(data)
  const dbDir = path.join(__dirname, '..', 'data')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  writeFileSync(path.join(dbDir, 'mindbridge.db'), buffer)
}

export function getDatabase(): Database {
  return db
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('service_user','parent','family','teacher','therapist','researcher','org_admin','sys_admin')),
      display_name TEXT NOT NULL,
      avatar TEXT,
      accessibility_config TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_scales (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      min_age INTEGER,
      max_age INTEGER,
      item_count INTEGER NOT NULL,
      scoring_rules TEXT DEFAULT '{}',
      version TEXT DEFAULT '1.0'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS scale_items (
      id TEXT PRIMARY KEY,
      scale_id TEXT NOT NULL REFERENCES assessment_scales(id),
      order_num INTEGER NOT NULL,
      content TEXT NOT NULL,
      options TEXT DEFAULT '[]',
      dimension TEXT NOT NULL,
      difficulty REAL DEFAULT 0.5,
      scoring_key TEXT DEFAULT '{}'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      scale_id TEXT NOT NULL REFERENCES assessment_scales(id),
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
      total_score REAL,
      dimension_scores TEXT DEFAULT '{}',
      ai_interpretation TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS session_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES assessment_sessions(id),
      item_id TEXT NOT NULL REFERENCES scale_items(id),
      response TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS behavior_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      antecedent TEXT NOT NULL,
      behavior TEXT NOT NULL,
      consequence TEXT NOT NULL,
      category TEXT NOT NULL,
      intensity INTEGER NOT NULL CHECK(intensity BETWEEN 1 AND 10),
      duration_min INTEGER,
      environment TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS emotion_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      emotion_type TEXT NOT NULL,
      intensity INTEGER NOT NULL CHECK(intensity BETWEEN 1 AND 10),
      note TEXT,
      triggers TEXT DEFAULT '[]',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS aac_boards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      layout TEXT DEFAULT '{}',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS aac_symbols (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      icon_name TEXT,
      image_url TEXT,
      metadata TEXT DEFAULT '{}'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS aac_board_symbols (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES aac_boards(id),
      symbol_id TEXT NOT NULL REFERENCES aac_symbols(id),
      position INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed','shared')),
      content TEXT DEFAULT '{}',
      pdf_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS collaboration_messages (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id),
      to_user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'message' CHECK(type IN ('message','notification','alert','task')),
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES users(id),
      assignee_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON assessment_sessions(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_scale ON assessment_sessions(scale_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_responses_session ON session_responses(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_records(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_behavior_occurred ON behavior_records(occurred_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_emotion_user ON emotion_records(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_emotion_recorded ON emotion_records(recorded_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_to ON collaboration_messages(to_user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_from ON collaboration_messages(from_user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`)
}

async function seedData() {
  const adminId = uuidv4()
  const hash = await bcrypt.hash('admin123', 10)
  db.run(
    `INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)`,
    [adminId, 'admin', 'admin@mindbridge.com', hash, 'sys_admin', '系统管理员']
  )

  const scales = [
    {
      id: 'scale_abc_autism',
      name: '孤独症行为量表(ABC)',
      description: '用于筛查孤独症谱系障碍的行为评估工具，涵盖感觉、交往、运动、语言和自我照顾五个维度',
      category: 'autism_spectrum',
      min_age: 0,
      max_age: 28,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 20, level: '正常' }, { min: 21, max: 30, level: '轻度可疑' }, { min: 31, max: 40, level: '中度可疑' }, { min: 41, max: 60, level: '高度可疑' }] }),
      version: '1.0'
    },
    {
      id: 'scale_mchat',
      name: 'M-CHAT-R改良婴幼儿孤独症筛查量表',
      description: '用于16-30个月婴幼儿的孤独症谱系障碍早期筛查工具',
      category: 'autism_spectrum',
      min_age: 1,
      max_age: 2,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 2, level: '低风险' }, { min: 3, max: 6, level: '中等风险，建议进一步筛查' }, { min: 7, max: 20, level: '高风险，建议尽快转诊评估' }] }),
      version: '1.0'
    },
    {
      id: 'scale_sas',
      name: 'SAS焦虑自评量表',
      description: '用于评估个体焦虑症状严重程度的自评量表，涵盖焦虑情绪、躯体症状、认知表现和行为表现四个维度',
      category: 'emotion_mood',
      min_age: 16,
      max_age: 120,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum_then_multiply', multiplier: 1.25, cutoffs: [{ min: 25, max: 49, level: '正常' }, { min: 50, max: 59, level: '轻度焦虑' }, { min: 60, max: 69, level: '中度焦虑' }, { min: 70, max: 100, level: '重度焦虑' }] }),
      version: '1.0'
    },
    {
      id: 'scale_sds',
      name: 'SDS抑郁自评量表',
      description: '用于评估个体抑郁症状严重程度的自评量表，涵盖情感症状、躯体症状、精神运动性症状和心理症状四个维度',
      category: 'emotion_mood',
      min_age: 16,
      max_age: 120,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum_then_multiply', multiplier: 1.25, cutoffs: [{ min: 25, max: 52, level: '正常' }, { min: 53, max: 62, level: '轻度抑郁' }, { min: 63, max: 72, level: '中度抑郁' }, { min: 73, max: 100, level: '重度抑郁' }] }),
      version: '1.0'
    },
    {
      id: 'scale_phq9',
      name: 'PHQ-9抑郁筛查量表',
      description: '基于DSM诊断标准的抑郁症状快速筛查工具，评估过去两周内的抑郁症状频率',
      category: 'emotion_mood',
      min_age: 12,
      max_age: 120,
      item_count: 9,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 4, level: '无抑郁' }, { min: 5, max: 9, level: '轻度抑郁' }, { min: 10, max: 14, level: '中度抑郁' }, { min: 15, max: 19, level: '中重度抑郁' }, { min: 20, max: 27, level: '重度抑郁' }] }),
      version: '1.0'
    },
    {
      id: 'scale_gad7',
      name: 'GAD-7焦虑筛查量表',
      description: '用于快速筛查广泛性焦虑症状严重程度的自评工具',
      category: 'emotion_mood',
      min_age: 12,
      max_age: 120,
      item_count: 7,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 4, level: '无焦虑' }, { min: 5, max: 9, level: '轻度焦虑' }, { min: 10, max: 14, level: '中度焦虑' }, { min: 15, max: 21, level: '重度焦虑' }] }),
      version: '1.0'
    },
    {
      id: 'scale_conners',
      name: 'Conners儿童行为量表(家长版)',
      description: '用于评估儿童行为问题的家长问卷，涵盖品行问题、学习问题、心身障碍、冲动-多动和焦虑五个维度',
      category: 'behavior_attention',
      min_age: 3,
      max_age: 17,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 15, level: '正常范围' }, { min: 16, max: 30, level: '轻度行为问题' }, { min: 31, max: 45, level: '中度行为问题' }, { min: 46, max: 60, level: '重度行为问题' }] }),
      version: '1.0'
    },
    {
      id: 'scale_snapiv',
      name: 'SNAP-IV注意力缺陷评估',
      description: '用于评估注意力缺陷多动障碍(ADHD)核心症状的量表，涵盖注意力缺陷和多动-冲动两个维度',
      category: 'behavior_attention',
      min_age: 6,
      max_age: 18,
      item_count: 18,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 17, level: '正常范围' }, { min: 18, max: 35, level: '注意力或多动问题可疑' }, { min: 36, max: 54, level: '建议进一步专业评估' }] }),
      version: '1.0'
    },
    {
      id: 'scale_social_child',
      name: '儿童社交能力评估',
      description: '评估儿童社交发起、回应和维持能力的量表',
      category: 'social_adaptive',
      min_age: 3,
      max_age: 12,
      item_count: 15,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 15, max: 35, level: '社交能力较弱' }, { min: 36, max: 55, level: '社交能力中等' }, { min: 56, max: 75, level: '社交能力良好' }] }),
      version: '1.0'
    },
    {
      id: 'scale_adaptive',
      name: '适应性行为评估',
      description: '评估个体适应性行为水平的量表，涵盖沟通能力、日常生活技能、社交技能和运动技能四个维度',
      category: 'social_adaptive',
      min_age: 3,
      max_age: 21,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 20, level: '适应能力较弱' }, { min: 21, max: 40, level: '适应能力中等' }, { min: 41, max: 60, level: '适应能力良好' }] }),
      version: '1.0'
    },
    {
      id: 'scale_sensory',
      name: '感觉统合功能评估',
      description: '评估儿童感觉统合功能发展水平的量表，涵盖前庭觉、本体觉、触觉和视觉-空间觉四个维度',
      category: 'sensory_motor',
      min_age: 3,
      max_age: 12,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 20, max: 40, level: '感觉统合功能良好' }, { min: 41, max: 60, level: '轻度感觉统合失调' }, { min: 61, max: 80, level: '中度感觉统合失调' }, { min: 81, max: 100, level: '重度感觉统合失调' }] }),
      version: '1.0'
    },
    {
      id: 'scale_scl90',
      name: 'SCL-90症状自评量表(精简版)',
      description: '评估个体心理健康状况的综合量表，涵盖躯体化、强迫、人际敏感、抑郁、焦虑、敌对、恐怖、偏执和精神病性九个维度',
      category: 'mental_health',
      min_age: 16,
      max_age: 120,
      item_count: 36,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 36, max: 72, level: '正常' }, { min: 73, max: 108, level: '轻度心理症状' }, { min: 109, max: 144, level: '中度心理症状' }, { min: 145, max: 180, level: '重度心理症状' }] }),
      version: '1.0'
    },
    {
      id: 'scale_language',
      name: '语言沟通能力评估',
      description: '评估儿童语言理解、语言表达和语用能力的量表',
      category: 'language_communication',
      min_age: 2,
      max_age: 12,
      item_count: 15,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 15, level: '语言沟通能力较弱' }, { min: 16, max: 30, level: '语言沟通能力中等' }, { min: 31, max: 45, level: '语言沟通能力良好' }] }),
      version: '1.0'
    },
    {
      id: 'scale_emotion_regulation',
      name: '儿童情绪调节评估',
      description: '评估儿童情绪识别、表达和调节能力的量表',
      category: 'emotion_mood',
      min_age: 4,
      max_age: 16,
      item_count: 15,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 15, max: 35, level: '情绪调节能力较弱' }, { min: 36, max: 55, level: '情绪调节能力中等' }, { min: 56, max: 75, level: '情绪调节能力良好' }] }),
      version: '1.0'
    },
    {
      id: 'scale_development',
      name: '发育筛查评估',
      description: '用于筛查儿童发育水平的评估工具，涵盖大运动、精细运动、语言、认知和社交五个维度',
      category: 'intellectual_development',
      min_age: 0,
      max_age: 6,
      item_count: 20,
      scoring_rules: JSON.stringify({ method: 'sum', cutoffs: [{ min: 0, max: 13, level: '发育迟缓可疑，建议进一步评估' }, { min: 14, max: 26, level: '发育水平中等' }, { min: 27, max: 40, level: '发育水平良好' }] }),
      version: '1.0'
    }
  ]

  scales.forEach(s => {
    db.run(
      `INSERT INTO assessment_scales (id, name, description, category, min_age, max_age, item_count, scoring_rules, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.description, s.category, s.min_age, s.max_age, s.item_count, s.scoring_rules, s.version]
    )
  })

  const optAbc = [{ label: '无此行为', value: 0 }, { label: '偶尔有', value: 1 }, { label: '经常有', value: 2 }, { label: '总是如此', value: 3 }]
  const optMchat = [{ label: '是', value: 0 }, { label: '否', value: 1 }]
  const optMchatReverse = [{ label: '是', value: 1 }, { label: '否', value: 0 }]
  const optSas = [{ label: '没有或很少时间', value: 1 }, { label: '少部分时间', value: 2 }, { label: '相当多时间', value: 3 }, { label: '绝大部分或全部时间', value: 4 }]
  const optPhq = [{ label: '完全没有', value: 0 }, { label: '有几天', value: 1 }, { label: '一半以上天数', value: 2 }, { label: '几乎每天', value: 3 }]
  const optConners = [{ label: '没有', value: 0 }, { label: '偶尔', value: 1 }, { label: '经常', value: 2 }, { label: '总是', value: 3 }]
  const optSnap = [{ label: '完全没有', value: 0 }, { label: '有一点', value: 1 }, { label: '相当多', value: 2 }, { label: '非常多', value: 3 }]
  const optSocial = [{ label: '从不', value: 1 }, { label: '很少', value: 2 }, { label: '有时', value: 3 }, { label: '经常', value: 4 }, { label: '总是', value: 5 }]
  const optAdaptive = [{ label: '完全不能', value: 0 }, { label: '需要大量帮助', value: 1 }, { label: '需要少量帮助', value: 2 }, { label: '完全独立', value: 3 }]
  const optSensory = [{ label: '从不', value: 1 }, { label: '很少', value: 2 }, { label: '有时', value: 3 }, { label: '经常', value: 4 }, { label: '总是', value: 5 }]
  const optScl90 = [{ label: '没有', value: 1 }, { label: '很轻', value: 2 }, { label: '中等', value: 3 }, { label: '偏重', value: 4 }, { label: '严重', value: 5 }]
  const optLanguage = [{ label: '完全不能', value: 0 }, { label: '需要大量提示', value: 1 }, { label: '需要少量提示', value: 2 }, { label: '独立完成', value: 3 }]
  const optEmotionReg = [{ label: '从不', value: 1 }, { label: '很少', value: 2 }, { label: '有时', value: 3 }, { label: '经常', value: 4 }, { label: '总是', value: 5 }]
  const optDev = [{ label: '尚未出现', value: 0 }, { label: '偶尔出现', value: 1 }, { label: '已经掌握', value: 2 }]

  const skForward = JSON.stringify({ type: 'forward' })
  const skReverse4 = JSON.stringify({ type: 'reverse', max: 4 })
  const skReverse1 = JSON.stringify({ type: 'reverse', max: 1 })

  const allItems: Record<string, Array<{ content: string; dimension: string; options: Array<{ label: string; value: number }>; scoring_key: string }>> = {
    'scale_abc_autism': [
      { content: '喜欢长时间自身旋转', dimension: '感觉能力', options: optAbc, scoring_key: skForward },
      { content: '经常没有接触环境或进行交往的要求', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '往往不能接受日常习惯的变化', dimension: '运动能力', options: optAbc, scoring_key: skForward },
      { content: '回避与他人的目光接触', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '对声音过度敏感或迟钝', dimension: '感觉能力', options: optAbc, scoring_key: skForward },
      { content: '不适当的微笑或大笑', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '不怕真正的危险', dimension: '运动能力', options: optAbc, scoring_key: skForward },
      { content: '模仿别人的言语或动作', dimension: '语言能力', options: optAbc, scoring_key: skForward },
      { content: '对疼痛不敏感', dimension: '感觉能力', options: optAbc, scoring_key: skForward },
      { content: '拒绝别人的抚摸或拥抱', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '反复做某些特殊动作或行为', dimension: '运动能力', options: optAbc, scoring_key: skForward },
      { content: '不会恰当地注视物体', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '自伤行为', dimension: '运动能力', options: optAbc, scoring_key: skForward },
      { content: '说话时音量、节律异常', dimension: '语言能力', options: optAbc, scoring_key: skForward },
      { content: '对周围事物漠不关心', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '对某些物品有特殊依恋', dimension: '感觉能力', options: optAbc, scoring_key: skForward },
      { content: '不会做扮演性游戏', dimension: '交往能力', options: optAbc, scoring_key: skForward },
      { content: '不会用手指指物', dimension: '语言能力', options: optAbc, scoring_key: skForward },
      { content: '大小便自理困难', dimension: '自我照顾', options: optAbc, scoring_key: skForward },
      { content: '进食行为异常', dimension: '自我照顾', options: optAbc, scoring_key: skForward }
    ],
    'scale_mchat': [
      { content: '您的孩子喜欢被放在膝上摇摆、弹跳吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子对其他孩子感兴趣吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子喜欢攀爬东西吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子喜欢玩捉迷藏吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会假装做事吗（如假装打电话）？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会用手指指东西要求得到某物吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会用手指指东西分享有趣的事物吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子能理解别人的手势吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会对您微笑吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子听到自己的名字会转头看吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子看到您笑时也会笑吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会对您感到厌烦或不高兴吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会模仿您的动作吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会回应您的呼唤吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会拿着东西给您看吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会看着您指的东西吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会有不寻常的手指动作吗？', dimension: '行为特征', options: optMchatReverse, scoring_key: skReverse1 },
      { content: '您的孩子会注视您的眼睛吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会对您的声音有反应吗？', dimension: '社交沟通', options: optMchat, scoring_key: skForward },
      { content: '您的孩子会把玩具按特定方式排列吗？', dimension: '行为特征', options: optMchatReverse, scoring_key: skReverse1 }
    ],
    'scale_sas': [
      { content: '我觉得比平常容易紧张和着急', dimension: '焦虑情绪', options: optSas, scoring_key: skForward },
      { content: '我无缘无故地感到害怕', dimension: '焦虑情绪', options: optSas, scoring_key: skReverse4 },
      { content: '我容易心里烦乱或觉得惊恐', dimension: '焦虑情绪', options: optSas, scoring_key: skForward },
      { content: '我觉得我可能将要发疯', dimension: '认知表现', options: optSas, scoring_key: skForward },
      { content: '我觉得一切都很好，也不会发生什么不幸', dimension: '焦虑情绪', options: optSas, scoring_key: skReverse4 },
      { content: '我手脚发抖打颤', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我因为头痛、颈痛和背痛而苦恼', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我觉得容易衰弱和疲乏', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我觉得心平气和，并且容易安静坐着', dimension: '躯体症状', options: optSas, scoring_key: skReverse4 },
      { content: '我觉得心跳得很快', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我因为一阵阵头晕而苦恼', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我有晕倒发作，或觉得要晕倒似的', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我吸气呼气都感到很容易', dimension: '躯体症状', options: optSas, scoring_key: skReverse4 },
      { content: '我的手脚麻木和刺痛', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我因为胃痛和消化不良而苦恼', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我常常要小便', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我的手常常是干燥温暖的', dimension: '躯体症状', options: optSas, scoring_key: skReverse4 },
      { content: '我脸红发热', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我容易入睡并且一夜睡得很好', dimension: '行为表现', options: optSas, scoring_key: skReverse4 },
      { content: '我做噩梦', dimension: '行为表现', options: optSas, scoring_key: skForward }
    ],
    'scale_sds': [
      { content: '我觉得闷闷不乐，情绪低沉', dimension: '情感症状', options: optSas, scoring_key: skForward },
      { content: '我觉得一天之中早晨最好', dimension: '情感症状', options: optSas, scoring_key: skReverse4 },
      { content: '我一阵阵哭出来或想哭', dimension: '情感症状', options: optSas, scoring_key: skForward },
      { content: '我晚上睡眠不好', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我吃得跟平常一样多', dimension: '躯体症状', options: optSas, scoring_key: skReverse4 },
      { content: '我与异性密切接触时和以往一样感到愉快', dimension: '躯体症状', options: optSas, scoring_key: skReverse4 },
      { content: '我发觉我的体重在下降', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我有便秘的苦恼', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我心跳比平时快', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我无缘无故地感到疲乏', dimension: '躯体症状', options: optSas, scoring_key: skForward },
      { content: '我的头脑跟平常一样清楚', dimension: '精神运动性', options: optSas, scoring_key: skReverse4 },
      { content: '我觉得做以前常做的事情并没有困难', dimension: '精神运动性', options: optSas, scoring_key: skReverse4 },
      { content: '我觉得不安而平静不下来', dimension: '精神运动性', options: optSas, scoring_key: skForward },
      { content: '我对将来抱有希望', dimension: '心理症状', options: optSas, scoring_key: skReverse4 },
      { content: '我比平常容易生气激动', dimension: '心理症状', options: optSas, scoring_key: skForward },
      { content: '我觉得做出决定是容易的', dimension: '心理症状', options: optSas, scoring_key: skReverse4 },
      { content: '我觉得自己是个有用的人', dimension: '心理症状', options: optSas, scoring_key: skReverse4 },
      { content: '我的生活过得很有意思', dimension: '心理症状', options: optSas, scoring_key: skReverse4 },
      { content: '我认为如果我死了别人会生活得好些', dimension: '心理症状', options: optSas, scoring_key: skForward },
      { content: '平常感兴趣的事我仍然照样感兴趣', dimension: '心理症状', options: optSas, scoring_key: skReverse4 }
    ],
    'scale_phq9': [
      { content: '做事时提不起劲或没有兴趣', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '感到心情低落、沮丧或绝望', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '入睡困难、睡不安稳或睡眠过多', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '感觉疲倦或没有活力', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '食欲不振或吃太多', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '觉得自己很糟，或觉得自己很失败，或让自己和家人失望', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '对事物专注有困难，例如阅读报纸或看电视', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '动作或说话速度缓慢到别人可以察觉，或正好相反——烦躁不安地动来动去', dimension: '抑郁症状', options: optPhq, scoring_key: skForward },
      { content: '有不如死掉或用某种方式伤害自己的念头', dimension: '抑郁症状', options: optPhq, scoring_key: skForward }
    ],
    'scale_gad7': [
      { content: '感到紧张、焦虑或烦躁', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '不能停止或控制担忧', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '对各种各样的事情担忧过多', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '很难放松下来', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '由于不安而无法静坐', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '变得容易烦恼或急躁', dimension: '焦虑症状', options: optPhq, scoring_key: skForward },
      { content: '感到似乎将有可怕的事情发生而害怕', dimension: '焦虑症状', options: optPhq, scoring_key: skForward }
    ],
    'scale_conners': [
      { content: '经常扭动或坐立不安', dimension: '冲动-多动', options: optConners, scoring_key: skForward },
      { content: '在需要坐好的场合离开座位', dimension: '冲动-多动', options: optConners, scoring_key: skForward },
      { content: '做事注意力不集中', dimension: '学习问题', options: optConners, scoring_key: skForward },
      { content: '容易分心', dimension: '学习问题', options: optConners, scoring_key: skForward },
      { content: '做作业需要过多监督', dimension: '学习问题', options: optConners, scoring_key: skForward },
      { content: '脾气暴躁', dimension: '品行问题', options: optConners, scoring_key: skForward },
      { content: '经常打架或威胁他人', dimension: '品行问题', options: optConners, scoring_key: skForward },
      { content: '不服从管教', dimension: '品行问题', options: optConners, scoring_key: skForward },
      { content: '说话过多', dimension: '冲动-多动', options: optConners, scoring_key: skForward },
      { content: '经常打断别人的话', dimension: '冲动-多动', options: optConners, scoring_key: skForward },
      { content: '难以等待轮到自己', dimension: '冲动-多动', options: optConners, scoring_key: skForward },
      { content: '经常丢失学习用品', dimension: '学习问题', options: optConners, scoring_key: skForward },
      { content: '经常头痛', dimension: '心身障碍', options: optConners, scoring_key: skForward },
      { content: '经常胃痛或恶心', dimension: '心身障碍', options: optConners, scoring_key: skForward },
      { content: '容易疲劳', dimension: '心身障碍', options: optConners, scoring_key: skForward },
      { content: '过分担忧', dimension: '焦虑', options: optConners, scoring_key: skForward },
      { content: '害怕新环境', dimension: '焦虑', options: optConners, scoring_key: skForward },
      { content: '紧张或焦虑', dimension: '焦虑', options: optConners, scoring_key: skForward },
      { content: '破坏自己或他人的物品', dimension: '品行问题', options: optConners, scoring_key: skForward },
      { content: '做危险的事情不觉得害怕', dimension: '品行问题', options: optConners, scoring_key: skForward }
    ],
    'scale_snapiv': [
      { content: '在学习、工作或其他活动中，常常不注意细节或犯粗心大意的错误', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '在学习或游戏活动中，常常难以保持注意力', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '与之对话时，常常显得心不在焉', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常不能按指示完成作业、家务或工作', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常难以组织任务和活动', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常回避、讨厌或不愿从事需要持久脑力的任务', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常遗失任务或活动所需的物品', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常容易因外界刺激而分心', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常在日常活动中健忘', dimension: '注意力缺陷', options: optSnap, scoring_key: skForward },
      { content: '常常手脚动个不停，或在座位上扭动', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '在应该坐好的场合常常离开座位', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常在不适当的场合过度跑动或攀爬', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常难以安静地玩耍或参与休闲活动', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常处于活跃状态，像"装了马达一样"', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常说话过多', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常在问题还没问完时就抢着回答', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常难以等待轮到自己', dimension: '多动-冲动', options: optSnap, scoring_key: skForward },
      { content: '常常打断或侵扰他人', dimension: '多动-冲动', options: optSnap, scoring_key: skForward }
    ],
    'scale_social_child': [
      { content: '主动与人眼神对视', dimension: '社交发起', options: optSocial, scoring_key: skForward },
      { content: '主动向他人打招呼', dimension: '社交发起', options: optSocial, scoring_key: skForward },
      { content: '主动邀请同伴一起玩耍', dimension: '社交发起', options: optSocial, scoring_key: skForward },
      { content: '主动分享自己的物品或经历', dimension: '社交发起', options: optSocial, scoring_key: skForward },
      { content: '主动寻求帮助', dimension: '社交发起', options: optSocial, scoring_key: skForward },
      { content: '能够回应他人的打招呼', dimension: '社交回应', options: optSocial, scoring_key: skForward },
      { content: '对他人的提问做出回应', dimension: '社交回应', options: optSocial, scoring_key: skForward },
      { content: '能够接受他人的邀请', dimension: '社交回应', options: optSocial, scoring_key: skForward },
      { content: '对他人的情绪做出适当反应', dimension: '社交回应', options: optSocial, scoring_key: skForward },
      { content: '能够理解他人的手势或表情', dimension: '社交回应', options: optSocial, scoring_key: skForward },
      { content: '能够参与轮流游戏', dimension: '社交维持', options: optSocial, scoring_key: skForward },
      { content: '能够遵守游戏规则', dimension: '社交维持', options: optSocial, scoring_key: skForward },
      { content: '能够与同伴维持对话', dimension: '社交维持', options: optSocial, scoring_key: skForward },
      { content: '能够处理简单的冲突', dimension: '社交维持', options: optSocial, scoring_key: skForward },
      { content: '能够表达歉意或感谢', dimension: '社交维持', options: optSocial, scoring_key: skForward }
    ],
    'scale_adaptive': [
      { content: '能够表达基本需求', dimension: '沟通能力', options: optAdaptive, scoring_key: skForward },
      { content: '能够理解简单的指令', dimension: '沟通能力', options: optAdaptive, scoring_key: skForward },
      { content: '能够使用至少10个有意义的词语', dimension: '沟通能力', options: optAdaptive, scoring_key: skForward },
      { content: '能够回答简单的是/否问题', dimension: '沟通能力', options: optAdaptive, scoring_key: skForward },
      { content: '能够描述过去发生的事情', dimension: '沟通能力', options: optAdaptive, scoring_key: skForward },
      { content: '能够独立进食', dimension: '日常生活技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够独立如厕', dimension: '日常生活技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够自己穿脱简单衣物', dimension: '日常生活技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够遵守基本安全规则', dimension: '日常生活技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够完成简单的家务', dimension: '日常生活技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够辨认熟悉的人', dimension: '社交技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够在群体中遵守基本规则', dimension: '社交技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够表达自己的情感', dimension: '社交技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够与他人合作完成任务', dimension: '社交技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够在不同社交场合表现适当', dimension: '社交技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够独立行走', dimension: '运动技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够上下楼梯', dimension: '运动技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够使用餐具', dimension: '运动技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够画简单图形', dimension: '运动技能', options: optAdaptive, scoring_key: skForward },
      { content: '能够接住大球', dimension: '运动技能', options: optAdaptive, scoring_key: skForward }
    ],
    'scale_sensory': [
      { content: '喜欢旋转或快速运动', dimension: '前庭觉', options: optSensory, scoring_key: skForward },
      { content: '害怕荡秋千或滑梯', dimension: '前庭觉', options: optSensory, scoring_key: skForward },
      { content: '经常跌倒或碰撞', dimension: '前庭觉', options: optSensory, scoring_key: skForward },
      { content: '坐姿不稳，频繁变换姿势', dimension: '前庭觉', options: optSensory, scoring_key: skForward },
      { content: '对运动过度渴望或过度回避', dimension: '前庭觉', options: optSensory, scoring_key: skForward },
      { content: '动作笨拙，不协调', dimension: '本体觉', options: optSensory, scoring_key: skForward },
      { content: '用力不当（过轻或过重）', dimension: '本体觉', options: optSensory, scoring_key: skForward },
      { content: '喜欢碰撞或跳跃', dimension: '本体觉', options: optSensory, scoring_key: skForward },
      { content: '难以模仿动作', dimension: '本体觉', options: optSensory, scoring_key: skForward },
      { content: '对身体位置感知不清', dimension: '本体觉', options: optSensory, scoring_key: skForward },
      { content: '不喜欢被触摸或拥抱', dimension: '触觉', options: optSensory, scoring_key: skForward },
      { content: '对衣物标签或材质敏感', dimension: '触觉', options: optSensory, scoring_key: skForward },
      { content: '不喜欢玩沙子、黏土等', dimension: '触觉', options: optSensory, scoring_key: skForward },
      { content: '对温度变化过度敏感', dimension: '触觉', options: optSensory, scoring_key: skForward },
      { content: '喜欢触摸各种物品', dimension: '触觉', options: optSensory, scoring_key: skForward },
      { content: '难以完成拼图', dimension: '视觉-空间觉', options: optSensory, scoring_key: skForward },
      { content: '容易在熟悉环境中迷路', dimension: '视觉-空间觉', options: optSensory, scoring_key: skForward },
      { content: '写字大小不一或歪斜', dimension: '视觉-空间觉', options: optSensory, scoring_key: skForward },
      { content: '难以区分相似的字或图形', dimension: '视觉-空间觉', options: optSensory, scoring_key: skForward },
      { content: '对光线过度敏感', dimension: '视觉-空间觉', options: optSensory, scoring_key: skForward }
    ],
    'scale_scl90': [
      { content: '头痛', dimension: '躯体化', options: optScl90, scoring_key: skForward },
      { content: '感到身体发沉或无力', dimension: '躯体化', options: optScl90, scoring_key: skForward },
      { content: '恶心或胃部不适', dimension: '躯体化', options: optScl90, scoring_key: skForward },
      { content: '呼吸不畅', dimension: '躯体化', options: optScl90, scoring_key: skForward },
      { content: '反复确认门锁等', dimension: '强迫', options: optScl90, scoring_key: skForward },
      { content: '做事必须做得很完美', dimension: '强迫', options: optScl90, scoring_key: skForward },
      { content: '感到难以完成任务', dimension: '强迫', options: optScl90, scoring_key: skForward },
      { content: '反复想同一件事', dimension: '强迫', options: optScl90, scoring_key: skForward },
      { content: '感到别人不理解你', dimension: '人际敏感', options: optScl90, scoring_key: skForward },
      { content: '感到比不上别人', dimension: '人际敏感', options: optScl90, scoring_key: skForward },
      { content: '容易受伤害', dimension: '人际敏感', options: optScl90, scoring_key: skForward },
      { content: '感到别人不友好', dimension: '人际敏感', options: optScl90, scoring_key: skForward },
      { content: '对事物缺乏兴趣', dimension: '抑郁', options: optScl90, scoring_key: skForward },
      { content: '感到前途无望', dimension: '抑郁', options: optScl90, scoring_key: skForward },
      { content: '容易哭泣', dimension: '抑郁', options: optScl90, scoring_key: skForward },
      { content: '感到孤独', dimension: '抑郁', options: optScl90, scoring_key: skForward },
      { content: '容易紧张', dimension: '焦虑', options: optScl90, scoring_key: skForward },
      { content: '无缘无故害怕', dimension: '焦虑', options: optScl90, scoring_key: skForward },
      { content: '心跳加速', dimension: '焦虑', options: optScl90, scoring_key: skForward },
      { content: '坐立不安', dimension: '焦虑', options: optScl90, scoring_key: skForward },
      { content: '容易生气', dimension: '敌对', options: optScl90, scoring_key: skForward },
      { content: '想要摔东西', dimension: '敌对', options: optScl90, scoring_key: skForward },
      { content: '与人争论', dimension: '敌对', options: optScl90, scoring_key: skForward },
      { content: '大叫或摔门', dimension: '敌对', options: optScl90, scoring_key: skForward },
      { content: '害怕空旷场所', dimension: '恐怖', options: optScl90, scoring_key: skForward },
      { content: '害怕独处', dimension: '恐怖', options: optScl90, scoring_key: skForward },
      { content: '害怕人群', dimension: '恐怖', options: optScl90, scoring_key: skForward },
      { content: '害怕乘坐交通工具', dimension: '恐怖', options: optScl90, scoring_key: skForward },
      { content: '感到有人在监视你', dimension: '偏执', options: optScl90, scoring_key: skForward },
      { content: '感到别人不信任你', dimension: '偏执', options: optScl90, scoring_key: skForward },
      { content: '感到有人针对你', dimension: '偏执', options: optScl90, scoring_key: skForward },
      { content: '感到别人想害你', dimension: '偏执', options: optScl90, scoring_key: skForward },
      { content: '听到别人听不到的声音', dimension: '精神病性', options: optScl90, scoring_key: skForward },
      { content: '感到思维不属于自己的', dimension: '精神病性', options: optScl90, scoring_key: skForward },
      { content: '感到被控制', dimension: '精神病性', options: optScl90, scoring_key: skForward },
      { content: '有奇怪的信念', dimension: '精神病性', options: optScl90, scoring_key: skForward }
    ],
    'scale_language': [
      { content: '能够理解简单的日常指令', dimension: '语言理解', options: optLanguage, scoring_key: skForward },
      { content: '能够理解"谁、什么、哪里"的问题', dimension: '语言理解', options: optLanguage, scoring_key: skForward },
      { content: '能够理解否定句', dimension: '语言理解', options: optLanguage, scoring_key: skForward },
      { content: '能够理解简单的比喻', dimension: '语言理解', options: optLanguage, scoring_key: skForward },
      { content: '能够理解多步骤指令', dimension: '语言理解', options: optLanguage, scoring_key: skForward },
      { content: '能够说出有意义的词语', dimension: '语言表达', options: optLanguage, scoring_key: skForward },
      { content: '能够使用简单句子', dimension: '语言表达', options: optLanguage, scoring_key: skForward },
      { content: '能够描述图片内容', dimension: '语言表达', options: optLanguage, scoring_key: skForward },
      { content: '能够讲述简单的故事', dimension: '语言表达', options: optLanguage, scoring_key: skForward },
      { content: '能够使用代词', dimension: '语言表达', options: optLanguage, scoring_key: skForward },
      { content: '能够维持话题', dimension: '语用能力', options: optLanguage, scoring_key: skForward },
      { content: '能够根据听众调整说话方式', dimension: '语用能力', options: optLanguage, scoring_key: skForward },
      { content: '能够理解和使用手势', dimension: '语用能力', options: optLanguage, scoring_key: skForward },
      { content: '能够进行对话轮换', dimension: '语用能力', options: optLanguage, scoring_key: skForward },
      { content: '能够提出和回答问题', dimension: '语用能力', options: optLanguage, scoring_key: skForward }
    ],
    'scale_emotion_regulation': [
      { content: '能够辨认基本情绪（开心、难过、生气）', dimension: '情绪识别', options: optEmotionReg, scoring_key: skForward },
      { content: '能够通过面部表情识别他人情绪', dimension: '情绪识别', options: optEmotionReg, scoring_key: skForward },
      { content: '能够区分相似情绪（如生气和沮丧）', dimension: '情绪识别', options: optEmotionReg, scoring_key: skForward },
      { content: '能够理解情绪产生的原因', dimension: '情绪识别', options: optEmotionReg, scoring_key: skForward },
      { content: '能够识别复杂情绪（如尴尬、嫉妒）', dimension: '情绪识别', options: optEmotionReg, scoring_key: skForward },
      { content: '能够用语言表达自己的感受', dimension: '情绪表达', options: optEmotionReg, scoring_key: skForward },
      { content: '能够用适当方式表达不满', dimension: '情绪表达', options: optEmotionReg, scoring_key: skForward },
      { content: '不会因小事大发脾气', dimension: '情绪表达', options: optEmotionReg, scoring_key: skForward },
      { content: '能够寻求安慰或帮助', dimension: '情绪表达', options: optEmotionReg, scoring_key: skForward },
      { content: '能够表达对别人的关心', dimension: '情绪表达', options: optEmotionReg, scoring_key: skForward },
      { content: '能够自我安慰', dimension: '情绪调节', options: optEmotionReg, scoring_key: skForward },
      { content: '能够从负面情绪中恢复', dimension: '情绪调节', options: optEmotionReg, scoring_key: skForward },
      { content: '能够使用放松技巧', dimension: '情绪调节', options: optEmotionReg, scoring_key: skForward },
      { content: '能够转移注意力', dimension: '情绪调节', options: optEmotionReg, scoring_key: skForward },
      { content: '能够延迟满足', dimension: '情绪调节', options: optEmotionReg, scoring_key: skForward }
    ],
    'scale_development': [
      { content: '能够独立坐稳', dimension: '大运动', options: optDev, scoring_key: skForward },
      { content: '能够独立行走', dimension: '大运动', options: optDev, scoring_key: skForward },
      { content: '能够上下楼梯', dimension: '大运动', options: optDev, scoring_key: skForward },
      { content: '能够单脚站立', dimension: '大运动', options: optDev, scoring_key: skForward },
      { content: '能够用拇指和食指捏取物品', dimension: '精细运动', options: optDev, scoring_key: skForward },
      { content: '能够叠积木', dimension: '精细运动', options: optDev, scoring_key: skForward },
      { content: '能够用笔画线', dimension: '精细运动', options: optDev, scoring_key: skForward },
      { content: '能够使用剪刀', dimension: '精细运动', options: optDev, scoring_key: skForward },
      { content: '能够发出有意义的声音', dimension: '语言', options: optDev, scoring_key: skForward },
      { content: '能够说出词语', dimension: '语言', options: optDev, scoring_key: skForward },
      { content: '能够说出简单句子', dimension: '语言', options: optDev, scoring_key: skForward },
      { content: '能够回答简单问题', dimension: '语言', options: optDev, scoring_key: skForward },
      { content: '能够辨认常见物品', dimension: '认知', options: optDev, scoring_key: skForward },
      { content: '能够匹配相同物品', dimension: '认知', options: optDev, scoring_key: skForward },
      { content: '能够按颜色分类', dimension: '认知', options: optDev, scoring_key: skForward },
      { content: '能够理解数字概念', dimension: '认知', options: optDev, scoring_key: skForward },
      { content: '能够回应微笑', dimension: '社交', options: optDev, scoring_key: skForward },
      { content: '能够模仿动作', dimension: '社交', options: optDev, scoring_key: skForward },
      { content: '能够与同伴玩耍', dimension: '社交', options: optDev, scoring_key: skForward },
      { content: '能够遵守简单规则', dimension: '社交', options: optDev, scoring_key: skForward }
    ]
  }

  for (const [scaleId, items] of Object.entries(allItems)) {
    items.forEach((item, i) => {
      db.run(
        `INSERT INTO scale_items (id, scale_id, order_num, content, options, dimension, difficulty, scoring_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), scaleId, i + 1, item.content, JSON.stringify(item.options), item.dimension, 0.5, item.scoring_key]
      )
    })
  }

  const symbolCategories: Record<string, Array<{ label: string; icon: string }>> = {
    '日常需求': [
      { label: '喝水', icon: 'Droplets' },
      { label: '吃饭', icon: 'UtensilsCrossed' },
      { label: '上厕所', icon: 'Bath' },
      { label: '休息', icon: 'Bed' },
      { label: '帮忙', icon: 'HandHelping' },
    ],
    '食物饮品': [
      { label: '米饭', icon: 'Salad' },
      { label: '面包', icon: 'Croissant' },
      { label: '牛奶', icon: 'Milk' },
      { label: '果汁', icon: 'GlassWater' },
      { label: '水果', icon: 'Apple' },
    ],
    '情绪感受': [
      { label: '开心', icon: 'Smile' },
      { label: '难过', icon: 'Frown' },
      { label: '生气', icon: 'Angry' },
      { label: '害怕', icon: 'Scared' },
      { label: '累了', icon: 'Tired' },
    ],
    '人物称呼': [
      { label: '妈妈', icon: 'Heart' },
      { label: '爸爸', icon: 'Shield' },
      { label: '老师', icon: 'GraduationCap' },
      { label: '朋友', icon: 'Users' },
      { label: '医生', icon: 'Stethoscope' },
    ],
    '活动': [
      { label: '画画', icon: 'Palette' },
      { label: '唱歌', icon: 'Music' },
      { label: '游戏', icon: 'Gamepad2' },
      { label: '阅读', icon: 'BookOpen' },
      { label: '运动', icon: 'Dumbbell' },
    ],
    '地点': [
      { label: '家', icon: 'Home' },
      { label: '学校', icon: 'School' },
      { label: '公园', icon: 'TreePine' },
      { label: '医院', icon: 'Hospital' },
      { label: '超市', icon: 'ShoppingCart' },
    ],
  }

  const symbolIds: string[] = []
  for (const [category, symbols] of Object.entries(symbolCategories)) {
    for (const symbol of symbols) {
      const sid = uuidv4()
      symbolIds.push(sid)
      db.run(
        `INSERT INTO aac_symbols (id, category, label, icon_name, metadata) VALUES (?, ?, ?, ?, ?)`,
        [sid, category, symbol.label, symbol.icon, JSON.stringify({ category })]
      )
    }
  }

  const board1Id = uuidv4()
  const board2Id = uuidv4()

  db.run(
    `INSERT INTO aac_boards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [board1Id, adminId, '基础沟通板', JSON.stringify({ columns: 5, rows: 6 }), 1]
  )

  db.run(
    `INSERT INTO aac_boards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [board2Id, adminId, '情绪表达板', JSON.stringify({ columns: 5, rows: 2 }), 1]
  )

  symbolIds.forEach((sid, i) => {
    db.run(
      `INSERT INTO aac_board_symbols (id, board_id, symbol_id, position) VALUES (?, ?, ?, ?)`,
      [uuidv4(), board1Id, sid, i + 1]
    )
  })

  const emotionSymbolIds = symbolIds.filter((_, i) => {
    const categoryIndex = Math.floor(i / 5)
    return categoryIndex === 2
  })
  emotionSymbolIds.forEach((sid, i) => {
    db.run(
      `INSERT INTO aac_board_symbols (id, board_id, symbol_id, position) VALUES (?, ?, ?, ?)`,
      [uuidv4(), board2Id, sid, i + 1]
    )
  })
}

export { db }
