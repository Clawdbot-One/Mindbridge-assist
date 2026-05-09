# MindBridge Assist — 技术设计方案 (Technical Design)

| 属性   | 值                                     |
| ---- | ------------------------------------- |
| 项目名称 | MindBridge Assist                     |
| 文档版本 | v1.1                                  |
| 创建日期 | 2026-05-07                            |
| 文档类型 | 技术设计 (Level 3 — Implementation Ready) |
| 目标受众 | 工程团队、技术负责人、架构师、评审委员会                  |

### 技术栈版本约定

| 技术           | 版本要求   | 用途                      |
| ------------ | ------ | ----------------------- |
| PostgreSQL   | 16.x   | 主数据库                    |
| Redis        | 7.2+   | 缓存 / 会话 / Pub/Sub      |
| Kafka        | 3.7+   | 事件流（实时事件分发、流处理）         |
| RabbitMQ     | 3.13+  | 任务队列（异步任务、延迟作业）         |
| Go           | 1.23+  | 后端微服务                   |
| Python       | 3.12+  | AI/ML 模型服务              |
| React Native | 0.76+  | 移动端跨平台框架                |

---

## 1. API 设计规范

### 1.1 总体规范

| 规范项    | 约定                                                      |
| ------ | ------------------------------------------------------- |
| API 风格 | RESTful (业务 API) + WebSocket (实时通信)                     |
| 版本管理   | URL 路径版本化: `/api/v1/...`                                |
| 数据格式   | JSON (Content-Type: application/json)                   |
| 字符编码   | UTF-8                                                   |
| 时间格式   | ISO 8601: `2026-05-07T01:13:00+08:00`                   |
| ID 格式  | ULID (Universally Unique Lexicographically Sortable ID) |
| 分页     | Cursor-based pagination (`?cursor=xxx&limit=20`)        |
| 错误格式   | RFC 7807 Problem Details                                |

### 1.2 RESTful API 端点

#### 用户管理 API

| 方法    | 路径                                | 描述       | 权限            |
| ----- | --------------------------------- | -------- | ------------- |
| POST  | `/api/v1/users`                   | 创建用户     | admin         |
| GET   | `/api/v1/users/{userId}`          | 获取用户详情   | self/admin    |
| PATCH | `/api/v1/users/{userId}`          | 更新用户信息   | self/admin    |
| GET   | `/api/v1/users/{userId}/profiles` | 获取用户关联档案 | self/linked   |
| POST  | `/api/v1/auth/login`              | 用户登录     | public        |
| POST  | `/api/v1/auth/refresh`            | 刷新 Token | auth          |
| POST  | `/api/v1/auth/logout`             | 登出       | auth          |
| POST  | `/api/v1/consents`                | 创建知情同意   | self/guardian |
| GET   | `/api/v1/consents/{id}`           | 获取同意记录   | self/admin    |

#### 心理评估 API

| 方法   | 路径                                   | 描述      | 权限        |
| ---- | ------------------------------------ | ------- | --------- |
| POST | `/api/v1/assessments`                | 创建评估任务  | therapist |
| GET  | `/api/v1/assessments/{id}`           | 获取评估详情  | linked    |
| POST | `/api/v1/assessments/{id}/responses` | 提交评估作答  | user      |
| GET  | `/api/v1/assessments/{id}/results`   | 获取评估结果  | linked    |
| GET  | `/api/v1/scales`                     | 获取量表列表  | therapist |
| GET  | `/api/v1/scales/{scaleId}`           | 获取量表详情  | therapist |
| POST | `/api/v1/scales/{scaleId}/adapt`     | 启动自适应评估 | therapist |

#### 行为分析 API

| 方法   | 路径                                    | 描述       | 权限        |
| ---- | ------------------------------------- | -------- | --------- |
| POST | `/api/v1/behaviors`                   | 记录行为事件   | caregiver |
| GET  | `/api/v1/behaviors`                   | 查询行为记录   | linked    |
| GET  | `/api/v1/behaviors/{userId}/patterns` | 获取行为模式分析 | linked    |
| GET  | `/api/v1/behaviors/{userId}/trends`   | 获取行为趋势   | linked    |
| GET  | `/api/v1/alerts`                      | 获取预警列表   | linked    |

#### 沟通辅助 API

| 方法   | 路径                                     | 描述     | 权限   |
| ---- | -------------------------------------- | ------ | ---- |
| POST | `/api/v1/communication/text-to-symbol` | 文本转符号  | user |
| POST | `/api/v1/communication/symbol-to-text` | 符号转文本  | user |
| POST | `/api/v1/communication/text-to-speech` | 文本转语音  | user |
| POST | `/api/v1/communication/speech-to-text` | 语音转文本  | user |
| GET  | `/api/v1/communication/symbol-sets`    | 获取符号集  | user |
| GET  | `/api/v1/communication/templates`      | 获取表达模板 | user |

#### 情绪识别 API

| 方法   | 路径                                  | 描述            | 权限     |
| ---- | ----------------------------------- | ------------- | ------ |
| POST | `/api/v1/emotions/detect`           | 情绪检测          | user   |
| GET  | `/api/v1/emotions/{userId}/history` | 获取情绪历史        | linked |
| POST | `/api/v1/emotions/stream`           | 启动情绪流式检测 (WS) | user   |

#### 报告 API

| 方法   | 路径                              | 描述     | 权限        |
| ---- | ------------------------------- | ------ | --------- |
| POST | `/api/v1/reports`               | 生成报告   | therapist |
| GET  | `/api/v1/reports/{id}`          | 获取报告   | linked    |
| GET  | `/api/v1/reports/{id}/download` | 下载报告   | linked    |
| GET  | `/api/v1/reports/scheduled`     | 获取定时报告 | therapist |

### 1.3 WebSocket 实时通信

| 端点                      | 事件     | 方向            |
| ----------------------- | ------ | ------------- |
| `/ws/v1/communication`  | 实时沟通会话 | 双向            |
| `/ws/v1/emotion/stream` | 情绪流式推送 | Server→Client |
| `/ws/v1/behavior/live`  | 实时行为记录 | Client→Server |
| `/ws/v1/notifications`  | 推送通知   | Server→Client |

**WebSocket 消息格式:**

```json
{
  "type": "emotion_update",
  "trace_id": "01HXYZ123456",
  "timestamp": "2026-05-07T01:13:00+08:00",
  "payload": {
    "user_id": "01HABC789012",
    "emotion": {
      "primary": "anxious",
      "confidence": 0.87,
      "intensity": 0.65
    }
  }
}
```

### 1.4 错误响应格式 (RFC 7807)

```json
{
  "type": "https://mindbridge.assist/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "评估作答格式无效",
  "instance": "/api/v1/assessments/01HXYZ123456/responses",
  "trace_id": "01HDEF345678",
  "errors": [
    {
      "field": "responses[3].value",
      "message": "值必须在 0-4 范围内"
    }
  ]
}
```

---

## 2. 数据库设计

### 2.1 核心 ER 关系图

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   tenants    │       │    users     │       │ user_profiles│
│              │  1:N  │              │  1:N  │              │
│ PK tenant_id │──────▶│ FK tenant_id │──────▶│ PK profile_id│
│ name         │       │ PK user_id   │       │ FK user_id   │
│ config       │       │ username     │       │ diagnosis    │
│ status       │       │ email        │       │ severity     │
└──────────────┘       │ password_hash│       │ allergies    │
                       │ role         │       │ emergency_ct │
                       │ status       │       └──────┬───────┘
                       └──────┬───────┘              │
                              │                      │
               ┌──────────────┼──────────────────────┘
               │              │
        ┌──────▼──────┐ ┌─────▼──────┐
        │ consents    │ │  family    │
        │             │ │  groups    │
        │ PK consent_ │ │            │
        │   id        │ │ PK group_id│
        │ FK user_id  │ │ name       │
        │ type        │ └─────┬──────┘
        │ status      │       │
        │ granted_at  │       │
        │ revoked_at  │  ┌────▼──────┐
        └─────────────┘  │ family    │
                         │  members  │
                         │           │
                         │ PK fm_id  │
                         │ FK group_ │
                         │ FK user_id│
                         │ role      │
                         └───────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   scales     │  1:N  │  questions   │  1:N  │  responses   │
│              │       │              │       │              │
│ PK scale_id  │──────▶│ PK q_id      │──────▶│ PK resp_id   │
│ name         │       │ FK scale_id  │       │ FK assessment│
│ version      │       │ text         │       │ FK user_id   │
│ category     │       │ type         │       │ FK q_id      │
│ config       │       │ options      │       │ value        │
│ status       │       │ score_map    │       │ timestamp    │
└──────────────┘       └──────────────┘       └──────────────┘
       │
       │
  ┌────▼──────┐        ┌──────────────┐       ┌──────────────┐
  │assessment │  1:N   │   results    │       │   reports    │
  │  sessions  │        │              │       │              │
  │            │        │ PK result_id │  1:1  │ PK report_id │
  │ PK session │───────▶│ FK session   │──────▶│ FK result_id │
  │ FK user_id │        │ scores       │       │ format       │
  │ FK scale_id│        │ interpretation│      │ content      │
  │ status     │        │ recommendations│     │ generated_at │
  │ started_at │        │ generated_at │       │ status       │
  │ completed_ │        └──────────────┘       └──────────────┘
  └────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  behavior    │       │  behavior    │       │   alerts     │
│  events      │  1:N  │  patterns    │  1:N  │              │
│              │       │              │       │ PK alert_id  │
│ PK event_id  │──────▶│ PK pattern_  │──────▶│ FK user_id   │
│ FK user_id   │       │   id         │       │ FK pattern_  │
│ antecedent   │       │ FK user_id   │       │ type         │
│ behavior     │       │ pattern_type │       │ severity     │
│ consequence  │       │ description  │       │ status       │
│ intensity    │       │ confidence   │       │ created_at   │
│ context      │       │ frequency    │       │ resolved_at  │
│ timestamp    │       │ created_at   │       └──────────────┘
└──────────────┘       └──────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  emotion     │       │  needs       │       │ communication│
│  records     │       │  expressions │       │  logs        │
│              │       │              │       │              │
│ PK record_id │       │ PK need_id   │       │ PK log_id    │
│ FK user_id   │       │ FK user_id   │       │ FK user_id   │
│ emotion_type │       │ need_type    │       │ input_type   │
│ confidence   │       │ description  │       │ output_type  │
│ intensity    │       │ priority     │       │ content      │
│ modality     │       │ status       │       │ context      │
│ source       │       │ created_at   │       │ timestamp    │
│ timestamp    │       │ resolved_at  │       │ session_id   │
└──────────────┘       └──────────────┘       └──────────────┘
```

### 2.2 核心表结构

#### 2.2.1 tenants (租户表)

| 字段         | 类型           | 约束           | 说明                      |
| ---------- | ------------ | ------------ | ----------------------- |
| tenant_id  | ULID         | PK, NOT NULL | 租户唯一标识                  |
| name       | VARCHAR(128) | NOT NULL     | 租户名称                    |
| type       | VARCHAR(32)  | NOT NULL     | 类型: institution/family  |
| config     | JSONB        |              | 租户级配置                   |
| status     | VARCHAR(16)  | NOT NULL     | active/suspended/closed |
| created_at | TIMESTAMPTZ  | NOT NULL     | 创建时间                    |
| updated_at | TIMESTAMPTZ  | NOT NULL     | 更新时间                    |

#### 2.2.2 users (用户表)

| 字段            | 类型           | 约束                   | 说明                             |
| ------------- | ------------ | -------------------- | ------------------------------ |
| user_id       | ULID         | PK, NOT NULL         | 用户唯一标识                         |
| tenant_id     | ULID         | FK→tenants, NOT NULL | 所属租户                           |
| username      | VARCHAR(64)  | UNIQUE, NOT NULL     | 用户名                            |
| email         | VARCHAR(255) | UNIQUE               | 邮箱                             |
| phone         | VARCHAR(20)  |                      | 手机号                            |
| password_hash | VARCHAR(255) | NOT NULL             | 密码哈希 (bcrypt)                  |
| role          | VARCHAR(32)  | NOT NULL             | user/caregiver/therapist/admin |
| status        | VARCHAR(16)  | NOT NULL             | active/suspended/deleted       |
| last_login    | TIMESTAMPTZ  |                      | 最后登录时间                         |
| created_at    | TIMESTAMPTZ  | NOT NULL             | 创建时间                           |
| updated_at    | TIMESTAMPTZ  | NOT NULL             | 更新时间                           |

**索引:**

- `idx_users_tenant_role (tenant_id, role)`
- `idx_users_email (email) WHERE email IS NOT NULL`
- `idx_users_phone (phone) WHERE phone IS NOT NULL`

#### 2.2.3 user_profiles (用户档案表)

| 字段                 | 类型          | 约束               | 说明              |
| ------------------ | ----------- | ---------------- | --------------- |
| profile_id         | ULID        | PK, NOT NULL     | 档案唯一标识          |
| user_id            | ULID        | FK→users, UNIQUE | 关联用户            |
| display_name       | VARCHAR(64) | NOT NULL         | 显示名称            |
| date_of_birth      | DATE        |                  | 出生日期            |
| gender             | VARCHAR(16) |                  | 性别              |
| diagnosis          | JSONB       |                  | 诊断信息 (ICD-11编码) |
| severity_level     | VARCHAR(32) |                  | 严重程度等级          |
| allergies          | JSONB       |                  | 过敏/禁忌信息         |
| communication      | JSONB       |                  | 沟通偏好与能力描述       |
| emergency_contacts | JSONB       |                  | 紧急联系人           |
| created_at         | TIMESTAMPTZ | NOT NULL         | 创建时间            |
| updated_at         | TIMESTAMPTZ | NOT NULL         | 更新时间            |

#### 2.2.4 assessment_sessions (评估会话表)

| 字段           | 类型          | 约束                  | 说明                                    |
| ------------ | ----------- | ------------------- | ------------------------------------- |
| session_id   | ULID        | PK, NOT NULL        | 会话唯一标识                                |
| user_id      | ULID        | FK→users, NOT NULL  | 被评估用户                                 |
| scale_id     | ULID        | FK→scales, NOT NULL | 评估量表                                  |
| therapist_id | ULID        | FK→users            | 评估执行者                                 |
| status       | VARCHAR(16) | NOT NULL            | draft/in_progress/completed/cancelled |
| adaptive     | BOOLEAN     | DEFAULT false       | 是否自适应评估                               |
| started_at   | TIMESTAMPTZ | NOT NULL            | 开始时间                                  |
| completed_at | TIMESTAMPTZ |                     | 完成时间                                  |
| metadata     | JSONB       |                     | 会话元数据                                 |
| created_at   | TIMESTAMPTZ | NOT NULL            | 创建时间                                  |

**索引:**

- `idx_sessions_user (user_id)`
- `idx_sessions_user_status (user_id, status)`
- `idx_sessions_completed (completed_at) WHERE completed_at IS NOT NULL`

#### 2.2.5 assessment_responses (评估作答表)

| 字段            | 类型          | 约束                     | 说明                     |
| ------------- | ----------- | ---------------------- | ---------------------- |
| response_id   | ULID        | PK, NOT NULL           | 作答唯一标识                 |
| session_id    | ULID        | FK→sessions, NOT NULL  | 评估会话                   |
| question_id   | ULID        | FK→questions, NOT NULL | 问题                     |
| value         | JSONB       | NOT NULL               | 作答值 (支持多类型)            |
| modality      | VARCHAR(16) | DEFAULT 'text'         | 作答方式: text/voice/touch |
| confidence    | FLOAT       |                        | AI辅助作答置信度              |
| response_time | INTERVAL    |                        | 作答耗时                   |
| timestamp     | TIMESTAMPTZ | NOT NULL               | 作答时间                   |

#### 2.2.6 assessment_results (评估结果表)

| 字段              | 类型          | 约束                  | 说明     |
| --------------- | ----------- | ------------------- | ------ |
| result_id       | ULID        | PK, NOT NULL        | 结果唯一标识 |
| session_id      | ULID        | FK→sessions, UNIQUE | 评估会话   |
| scores          | JSONB       | NOT NULL            | 各维度得分  |
| percentile      | JSONB       |                     | 百分位排名  |
| interpretation  | TEXT        |                     | AI辅助解读 |
| recommendations | JSONB       |                     | 建议方案   |
| reliability     | JSONB       |                     | 信效度指标  |
| generated_at    | TIMESTAMPTZ | NOT NULL            | 生成时间   |

#### 2.2.7 behavior_events (行为事件表)

| 字段          | 类型          | 约束                 | 说明     |
| ----------- | ----------- | ------------------ | ------ |
| event_id    | ULID        | PK, NOT NULL       | 事件唯一标识 |
| user_id     | ULID        | FK→users, NOT NULL | 关联用户   |
| antecedent  | TEXT        | NOT NULL           | 前因描述   |
| behavior    | TEXT        | NOT NULL           | 行为描述   |
| consequence | TEXT        | NOT NULL           | 结果描述   |
| intensity   | SMALLINT    | CHECK (1-10)       | 行为强度   |
| duration    | INTERVAL    |                    | 持续时间   |
| context     | JSONB       |                    | 环境上下文  |
| tags        | TEXT[]      |                    | 行为标签   |
| recorded_by | ULID        | FK→users           | 记录者    |
| recorded_at | TIMESTAMPTZ | NOT NULL           | 记录时间   |

**TimescaleDB Hypertable:** `SELECT create_hypertable('behavior_events', 'recorded_at')`

#### 2.2.8 emotion_records (情绪记录表)

| 字段           | 类型            | 约束                 | 说明                 |
| ------------ | ------------- | ------------------ | ------------------ |
| record_id    | ULID          | PK, NOT NULL       | 记录唯一标识             |
| user_id      | ULID          | FK→users, NOT NULL | 关联用户               |
| emotion_type | VARCHAR(32)   | NOT NULL           | 情绪类型               |
| confidence   | FLOAT         | NOT NULL           | AI检测置信度 (0-1)      |
| intensity    | FLOAT         | NOT NULL           | 情绪强度 (0-1)         |
| modality     | VARCHAR(32)[] |                    | 检测模态               |
| source       | VARCHAR(32)   |                    | 来源: ai/self_report |
| context      | JSONB         |                    | 上下文信息              |
| timestamp    | TIMESTAMPTZ   | NOT NULL           | 记录时间               |

**TimescaleDB Hypertable:** `SELECT create_hypertable('emotion_records', 'timestamp')`

#### 2.2.9 needs_expressions (需求表达表)

| 字段          | 类型          | 约束                 | 说明                         |
| ----------- | ----------- | ------------------ | -------------------------- |
| need_id     | ULID        | PK, NOT NULL       | 需求唯一标识                     |
| user_id     | ULID        | FK→users, NOT NULL | 关联用户                       |
| need_type   | VARCHAR(32) | NOT NULL           | 需求类型                       |
| description | TEXT        | NOT NULL           | 需求描述                       |
| inferred    | BOOLEAN     | DEFAULT false      | 是否AI推断                     |
| confidence  | FLOAT       |                    | AI推断置信度                    |
| priority    | SMALLINT    | CHECK (1-5)        | 优先级                        |
| status      | VARCHAR(16) | DEFAULT 'pending'  | pending/addressed/resolved |
| created_at  | TIMESTAMPTZ | NOT NULL           | 创建时间                       |
| resolved_at | TIMESTAMPTZ |                    | 解决时间                       |

#### 2.2.10 communication_logs (沟通日志表)

| 字段             | 类型          | 约束                 | 说明     |
| -------------- | ----------- | ------------------ | ------ |
| log_id         | ULID        | PK, NOT NULL       | 日志唯一标识 |
| user_id        | ULID        | FK→users, NOT NULL | 关联用户   |
| session_id     | ULID        |                    | 沟通会话   |
| input_type     | VARCHAR(16) | NOT NULL           | 输入类型   |
| input_content  | JSONB       | NOT NULL           | 输入内容   |
| output_type    | VARCHAR(16) | NOT NULL           | 输出类型   |
| output_content | JSONB       | NOT NULL           | 输出内容   |
| context        | JSONB       |                    | 沟通上下文  |
| created_at     | TIMESTAMPTZ | NOT NULL           | 创建时间   |

#### 2.2.11 audit_logs (审计日志表)

| 字段          | 类型           | 约束           | 说明            |
| ----------- | ------------ | ------------ | ------------- |
| log_id      | ULID         | PK, NOT NULL | 日志唯一标识        |
| tenant_id   | ULID         | FK→tenants   | 租户            |
| user_id     | ULID         |              | 操作用户          |
| action      | VARCHAR(64)  | NOT NULL     | 操作类型          |
| resource    | VARCHAR(128) | NOT NULL     | 操作资源          |
| resource_id | ULID         |              | 资源ID          |
| old_value   | JSONB        |              | 变更前值 (敏感字段脱敏) |
| new_value   | JSONB        |              | 变更后值 (敏感字段脱敏) |
| ip_address  | INET         |              | 操作IP          |
| user_agent  | TEXT         |              | 用户代理          |
| created_at  | TIMESTAMPTZ  | NOT NULL     | 操作时间          |

### 2.3 数据字典 (枚举类型)

```sql
-- 用户角色
CREATE TYPE user_role AS ENUM ('user', 'caregiver', 'therapist', 'admin', 'auditor');

-- 情绪类型
CREATE TYPE emotion_type AS ENUM (
  'happy', 'sad', 'anxious', 'angry', 'calm', 'excited',
  'frustrated', 'confused', 'scared', 'neutral',
  'overwhelmed', 'bored', 'comfortable', 'pain'
);

-- 需求类型
CREATE TYPE need_type AS ENUM (
  'physical', 'emotional', 'social', 'cognitive',
  'safety', 'communication', 'sensory', 'routine',
  'rest', 'medical', 'recreational'
);

-- 行为标签
CREATE TYPE behavior_tag AS ENUM (
  'self_injury', 'aggression', 'elopement', 'stimming',
  'verbal', 'non_compliance', 'property_destruction',
  'social_interaction', 'communication_attempt',
  'self_care', 'academic', 'play', 'transition'
);

-- 量表分类
CREATE TYPE scale_category AS ENUM (
  'social_emotional', 'adaptive_behavior', 'autism_screening',
  'cognitive', 'language', 'behavioral', 'quality_of_life'
);
```

---

## 3. AI/ML 模型技术方案

### 3.1 模型架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI/ML 模型架构                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │ 情绪识别模型  │  │ 行为分析模型  │  │ NLP沟通辅助  │  │ 辅助决策模型  ││
│  │              │  │              │  │              │  │              ││
│  │ 多模态融合   │  │ 时序预测      │  │ 文本理解      │  │ 推荐系统      ││
│  │              │  │              │  │ 符号映射      │  │ 风险预测      ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘│
│         │                  │                  │                  │       │
│         └──────────────────┴──────────────────┴──────────────────┘       │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │   模型注册中心    │                             │
│                          │   (MLflow)       │                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│  ┌────────────────────────────────┼────────────────────────────────┐     │
│  │              特征工程层 (Feature Store)                         │     │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │     │
│  │  │ 面部特征   │  │ 语音特征   │  │ 行为特征   │  │ 文本特征   │ │     │
│  │  │ 提取        │  │ 提取        │  │ 提取        │  │ 提取        │ │     │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 情绪识别模型

#### 3.2.1 模型架构

| 模态    | 模型                         | 输入            | 输出         | 延迟目标    |
| ----- | -------------------------- | ------------- | ---------- | ------- |
| 面部表情  | EfficientNet-B3 + FACS     | 视频帧 (224×224) | 7类情绪 + 置信度 | < 100ms |
| 语音情感  | Wav2Vec 2.0 + 分类头          | 音频片段 (3s)     | 情绪概率分布     | < 150ms |
| 文本情感  | Chinese-RoBERTa-wwm + LoRA | 文本/符号序列       | 情绪极性 + 强度  | < 50ms  |
| 多模态融合 | Cross-Attention 融合层        | 三模态特征向量       | 融合情绪预测     | < 50ms  |

#### 3.2.2 情绪分类体系

```
情绪分类 (8类基础 + 3类复合):
├── positive
│   ├── happy (开心)
│   ├── calm (平静)
│   ├── excited (兴奋)
│   └── comfortable (舒适)
├── negative
│   ├── sad (悲伤)
│   ├── anxious (焦虑)
│   ├── angry (愤怒)
│   ├── frustrated (挫败)
│   ├── scared (恐惧)
│   └── overwhelmed (不知所措)
├── neutral
│   └── neutral (中性)
└── composite (复合)
    ├── anxious_frustrated (焦虑挫败)
    ├── overwhelmed_sad (不知所措悲伤)
    └── excited_anxious (兴奋焦虑)
```

#### 3.2.3 多模态融合策略

```python
# 伪代码：跨模态注意力融合 (Python 3.12+)
class EmotionFusion(nn.Module):
    def __init__(self):
        self.face_encoder = EfficientNetB3()        # 面部特征: [512]
        self.audio_encoder = Wav2Vec2Classifier()    # 语音特征: [512]
        self.text_encoder = ChineseRoBERTa()         # 文本特征: [512]

        # 跨模态注意力
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=512, num_heads=8
        )

        # 置信度加权融合
        self.confidence_gate = nn.Sequential(
            nn.Linear(1536, 128),
            nn.ReLU(),
            nn.Linear(128, 3),  # 三个模态的权重
            nn.Softmax(dim=-1)
        )

    def forward(self, face_feat, audio_feat, text_feat):
        # 模态内注意力
        combined = torch.stack([face_feat, audio_feat, text_feat])
        attended, _ = self.cross_attn(combined, combined, combined)

        # 置信度加权
        weights = self.confidence_gate(combined.view(-1))
        fused = (attended * weights.unsqueeze(-1)).sum(dim=0)

        return self.classifier(fused)
```

### 3.3 行为模式分析模型

#### 3.3.1 模型架构

| 任务     | 模型                               | 说明              |
| ------ | -------------------------------- | --------------- |
| 行为序列建模 | Transformer Encoder + Positional | ABC 序列编码，捕获长程依赖 |
| 模式聚类   | HDBSCAN + DTW                    | 发现重复性行为模式       |
| 异常检测   | Isolation Forest + LSTM-AE       | 检测偏离常规的行为       |
| 趋势预测   | Temporal Fusion Transformer      | 未来行为趋势预测        |

#### 3.3.2 行为模式定义

```
行为模式模板:
{
  "pattern_id": "pattern_stim_evening",
  "pattern_type": "repetitive",
  "description": "晚间时段自我刺激行为增加",
  "trigger_conditions": {
    "time_range": "18:00-21:00",
    "environment": ["home", "low_light"],
    "antecedent": ["transition_end", "meal_finished"]
  },
  "behavior_signature": {
    "primary_behavior": "hand_flapping",
    "secondary_behaviors": ["vocalization", "pacing"],
    "average_duration": "PT15M",
    "frequency_per_week": 5.2
  },
  "risk_level": "low",
  "intervention_suggestions": ["sensory_break", "preferred_activity"]
}
```

### 3.4 NLP 沟通辅助模型

#### 3.4.1 模型架构

| 任务      | 模型                         | 说明           |
| ------- | -------------------------- | ------------ |
| 意图理解    | Chinese-BERT-wwm-ext + 分类头 | 理解用户输入意图     |
| 文本→符号映射 | 序列到序列 + PECS 词汇表           | 文本到辅助沟通符号的映射 |
| 符号→文本生成 | 符号序列编码器 + 文本解码器            | 符号到自然语言的转换   |
| 语音识别    | Whisper-large-v3 (中文微调)    | 中文语音转文本，容错口音 |
| 语音合成    | VITS (个性化音色)               | 多语速、清晰语音输出   |

#### 3.4.2 符号映射示例

```
输入文本: "我想要喝水"
         │
         ▼
    ┌─────────────────┐
    │ 意图: REQUEST   │
    │ 对象: WATER     │
    │ 动作: DRINK     │
    └────────┬────────┘
             ▼
    ┌─────────────────┐
    │ 符号序列:        │
    │ [我] [想要]      │
    │ [喝水] [杯子]    │
    └────────┬────────┘
             ▼
    ┌─────────────────┐
    │ 输出: PECS 卡片  │
    │ 序列展示         │
    └─────────────────┘
```

#### 3.4.3 语音容错设计

针对心智障碍用户的语音特点:

- **语速变化大** — 支持 0.5x ~ 2.0x 语速识别
- **发音不标准** — 基于中文方言/口音数据微调
- **重复表达** — 自动去重，提取核心意图
- **非语言声音** — 区分有意义的声音与背景噪音

### 3.5 辅助决策模型

#### 3.5.1 推荐架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    辅助决策推荐引擎                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────────┐   │
│  │ 评估结果     │   │ 行为模式    │   │  用户画像             │   │
│  │ (SDQ评分)   │   │ (聚类结果)  │   │  (年龄/诊断/偏好)     │   │
│  └──────┬──────┘   └──────┬──────┘   └──────────┬───────────┘   │
│         │                  │                     │               │
│         └──────────────────┼─────────────────────┘               │
│                            │                                     │
│                   ┌────────▼────────┐                             │
│                   │  知识图谱检索    │                             │
│                   │  (EBP文献库)    │                             │
│                   └────────┬────────┘                             │
│                            │                                     │
│                   ┌────────▼────────┐                             │
│                   │  推荐排序模型    │                             │
│                   │  (LightGBM)     │                             │
│                   └────────┬────────┘                             │
│                            │                                     │
│              ┌─────────────┼─────────────┐                       │
│              │             │             │                        │
│       ┌──────▼──────┐ ┌───▼────┐ ┌─────▼──────┐                 │
│       │治疗方案推荐 │ │风险预警│ │干预建议     │                 │
│       └─────────────┘ └────────┘ └────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.6 模型训练与部署

#### 3.6.1 训练流程

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  数据准备     │───▶│  模型训练     │───▶│  模型评估     │
│              │    │              │    │              │
│ • 数据清洗   │    │ • 预训练加载  │    │ • 准确率     │
│ • 数据标注   │    │ • LoRA微调   │    │ • 召回率     │
│ • 数据增强   │    │ • 全量微调   │    │ • F1 Score   │
│ • 隐私脱敏   │    │ • 蒸馏压缩   │    │ • 延迟测试   │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  模型注册     │
                                        │              │
                                        │ • MLflow登录 │
                                        │ • 版本管理   │
                                        │ • 元数据记录  │
                                        └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  生产部署     │
                                        │              │
                                        │ • Triton导入 │
                                        │ • A/B 测试   │
                                        │ • 金丝雀发布  │
                                        └──────────────┘
```

#### 3.6.2 部署配置

| 模型           | GPU 需求   | 内存需求  | 批处理大小 | 吞吐量目标     |
| ------------ | -------- | ----- | ----- | --------- |
| 情绪识别 (融合)    | A10G × 1 | 8 GB  | 32    | 100 req/s |
| 行为模式分析       | CPU      | 4 GB  | 64    | 50 req/s  |
| NLP (意图理解)   | A10G × 1 | 6 GB  | 64    | 200 req/s |
| Whisper (语音) | A10G × 2 | 16 GB | 8     | 20 req/s  |
| VITS (语音合成)  | A10G × 1 | 4 GB  | 16    | 50 req/s  |

#### 3.6.3 模型监控

| 监控指标       | 阈值       | 告警动作        |
| ---------- | -------- | ----------- |
| 推理延迟 P95   | > 500ms  | 扩容 / 降级     |
| 预测漂移 (PSI) | > 0.1    | 触发模型重训      |
| 数据质量异常     | > 5% 异常值 | 通知数据团队      |
| 推理错误率      | > 1%     | 告警 + 回退上一版本 |

---

## 4. 评估量表数字化方案

### 4.1 支持的量表

| 量表         | 全称                                        | 适用年龄    | 评估维度         | 题目数  |
| ---------- | ----------------------------------------- | ------- | ------------ | ---- |
| SDQ        | Strengths and Difficulties Questionnaire  | 4-17 岁  | 情绪/行为/同伴/亲社会 | 25   |
| Vineland-3 | Vineland Adaptive Behavior Scales, 3rd Ed | 0-90+ 岁 | 沟通/日常/社交/运动  | 200+ |
| ABAS-3     | Adaptive Behavior Assessment System, 3rd  | 0-89 岁  | 概念/社交/实用技能   | 200+ |
| CARS-2     | Childhood Autism Rating Scale, 2nd Ed     | ≥ 2 岁   | 自闭症严重程度      | 15   |
| SRS-2      | Social Responsiveness Scale, 2nd Ed       | 2.5-成年  | 社交反应         | 65   |
| ABC        | Autism Behavior Checklist                 | ≥ 18 月  | 感觉/交往/语言/运动  | 57   |

### 4.2 数字化架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                        量表数字化引擎                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  量表解析器   │    │  题目渲染器   │    │  作答采集器   │              │
│  │              │    │              │    │              │              │
│  │ • JSON Schema│    │ • 自适应布局  │    │ • 多模态输入 │              │
│  │ • 版本管理   │    │ • 认知友好    │    │ • 容错处理   │              │
│  │ • 版权校验   │    │ • 渐进展示   │    │ • 进度保存   │              │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘              │
│         │                   │                   │                      │
│  ┌──────▼───────────────────▼───────────────────▼───────┐              │
│  │                    评分引擎                           │              │
│  │                                                      │              │
│  │  • 自动计分 (原始分 → 标准分 → 百分位)                  │              │
│  │  • IRT 自适应选题                                      │              │
│  │  • 信效度自动计算 (Cronbach's α, 重测信度)             │              │
│  │  • 常模对照 (年龄/性别/文化分层)                        │              │
│  │  • 临床临界值判定                                      │              │
│  └──────────────────────────────────────────────────────┘              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 量表 JSON Schema 示例

```json
{
  "scale_id": "sdq_v2.0",
  "name": "Strengths and Difficulties Questionnaire",
  "version": "2.0",
  "category": "social_emotional",
  "age_range": { "min": 4, "max": 17 },
  "informant_types": ["parent", "teacher", "self"],
  "subscales": [
    {
      "id": "emotional",
      "name": "情绪症状",
      "question_ids": ["q3", "q8", "q13", "q16", "q24"],
      "scoring": { "range": [0, 10], "clinical_cutoff": 5 }
    },
    {
      "id": "conduct",
      "name": "品行问题",
      "question_ids": ["q5", "q7", "q12", "q18", "q22"],
      "scoring": { "range": [0, 10], "clinical_cutoff": 4 }
    },
    {
      "id": "hyperactivity",
      "name": "多动/注意力",
      "question_ids": ["q2", "q10", "q15", "q21", "q25"],
      "scoring": { "range": [0, 10], "clinical_cutoff": 6 }
    },
    {
      "id": "peer",
      "name": "同伴关系",
      "question_ids": ["q6", "q11", "q14", "q19", "q23"],
      "scoring": { "range": [0, 10], "clinical_cutoff": 4 }
    },
    {
      "id": "prosocial",
      "name": "亲社会行为",
      "question_ids": ["q1", "q4", "q9", "q17", "q20"],
      "scoring": { "range": [0, 10], "clinical_cutoff": 4 }
    }
  ],
  "total_score": {
    "excludes": ["prosocial"],
    "range": [0, 40],
    "banding": {
      "normal": [0, 13],
      "borderline": [14, 16],
      "abnormal": [17, 40]
    }
  },
  "questions": [
    {
      "id": "q1",
      "text": "体贴他人感受",
      "type": "likert",
      "options": [
        { "value": 0, "label": "不符合" },
        { "value": 1, "label": " somewhat符合" },
        { "value": 2, "label": "完全符合" }
      ],
      "reverse_scored": false,
      "subscales": ["prosocial"],
      "accessibility": {
        "symbol": "🤗",
        "audio_prompt": "体贴他人感受的音频提示",
        "simplified_text": "关心别人的感受"
      }
    }
  ],
  "norms": [
    {
      "age_band": "4-6",
      "gender": "male",
      "population": "china_urban",
      "means": { "emotional": 1.4, "conduct": 1.2 },
      "sds": { "emotional": 1.1, "conduct": 1.0 }
    }
  ]
}
```

### 4.4 IRT 自适应评估

```
自适应评估流程:

┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ 初始题   │────▶│ 能力估计│────▶│ 选题决策│────▶│ 下一题   │
│ (中等   │     │ (EAP/   │     │ (最大   │     │         │
│  难度)  │     │  MLE)   │     │ 信息量) │     │         │
└─────────┘     └─────────┘     └─────────┘     └────┬────┘
                                                      │
                                                      ▼
                                               ┌─────────────┐
                                               │ 终止条件检查 │
                                               │             │
                                               │ • SE < 阈值 │
                                               │ • 最大题数  │
                                               │ • 时间超时  │
                                               └──────┬──────┘
                                                      │
                                           ┌──────────┴──────────┐
                                           │                     │
                                    ┌──────▼──────┐     ┌───────▼──────┐
                                    │  满足条件    │     │  继续评估     │
                                    │  → 输出结果  │     │  → 下一轮     │
                                    └─────────────┘     └──────────────┘
```

---

## 5. 多模态输入支持

### 5.1 输入模态架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          多模态输入处理                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │   文本     │  │   语音    │  │   图像    │  │   触控    │            │
│  │           │  │           │  │           │  │           │            │
│  │ • 键盘    │  │ • 麦克风  │  │ • 摄像头  │  │ • 触摸屏  │            │
│  │ • 手写板  │  │ • 语音输入 │  │ • 拍照    │  │ • 拖拽    │            │
│  │ • 符号板  │  │ • 语音命令│  │ • 相册    │  │ • 点选    │            │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
│        │               │              │              │                  │
│        ▼               ▼              ▼              ▼                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │ NLP 管道  │  │ ASR 管道  │  │ CV 管道   │  │ 交互解析  │            │
│  │           │  │           │  │           │  │           │            │
│  │ • 分词    │  │ • Whisper │  │ • 目标    │  │ • 意图    │            │
│  │ • NER     │  │ • VAD     │  │   检测    │  │ • 手势    │            │
│  │ • 意图    │  │ • 情感    │  │ • 表情    │  │ • 力度    │            │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
│        │               │              │              │                  │
│        └───────────────┴──────────────┴──────────────┘                  │
│                                │                                        │
│                       ┌────────▼────────┐                               │
│                       │   意图融合层     │                               │
│                       │                 │                               │
│                       │  • 多模态对齐   │                               │
│                       │  • 冲突消解     │                               │
│                       │  • 统一意图输出  │                               │
│                       └─────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 模态选择策略

| 用户场景   | 推荐模态     | 降级策略      |
| ------ | -------- | --------- |
| 精细表达能力 | 文本 + 符号  | 语音输入      |
| 粗大运动控制 | 触控 (大按钮) | 语音命令      |
| 语音能力较好 | 语音       | 触控选择      |
| 视觉学习为主 | 图像 + 触控  | 语音提示      |
| 多感官需求  | 全模态      | 根据置信度自动选择 |

---

## 6. 无障碍设计 (WCAG 2.1 AA)

### 6.1 WCAG 合规矩阵

| WCAG 准则   | 要求等级 | 实现方案                   | 验证方式         |
| --------- | ---- | ---------------------- | ------------ |
| 1.1 文本替代  | A    | 所有非文本内容提供文字替代          | axe-core 扫描  |
| 1.2 时间替代  | A    | 音频/视频提供字幕与文字脚本         | 手动测试         |
| 1.3 可适配   | A    | 语义化 HTML，ARIA 标签，阅读顺序  | axe-core 扫描  |
| 1.4 可辨别   | AA   | 对比度 ≥ 4.5:1，文字可放大 200% | axe-core 扫描  |
| 2.1 键盘可访问 | A    | 完整键盘导航，跳过导航链接          | 键盘遍历测试       |
| 2.2 充足时间  | A    | 可延长时间限制，暂停/停止/移动内容     | 手动测试         |
| 2.3 光敏癫痫  | A    | 无闪烁内容 (≤ 3Hz)，动画可控     | 手动测试         |
| 2.4 可导航   | AA   | 页面标题、焦点顺序、面包屑、跳过链接     | 手动测试         |
| 3.1 可读    | A    | 语言声明，简单语言模式，专业术语解释     | 手动测试         |
| 3.2 可预测   | A    | 一致的导航、焦点不意外跳转          | 手动测试         |
| 3.3 输入辅助  | AA   | 错误提示、标签/说明、自动纠错        | 手动测试         |
| 4.1 兼容    | A    | 语义标记、ARIA 状态、屏幕阅读器兼容   | NVDA/JAWS 测试 |

### 6.2 心智障碍友好设计

| 设计维度 | 具体措施                            |
| ---- | ------------------------------- |
| 视觉设计 | 高对比度 (≥ 7:1)、大字体 (最小 18px)、简洁背景 |
| 交互设计 | 大触控区域 (≥ 44×44pt)、容错边界、单步骤操作    |
| 认知负荷 | 单任务界面、渐进式引导、图标+文字双通道            |
| 反馈机制 | 即时视觉+声音反馈、进度可视化、确认步骤            |
| 错误预防 | 输入限制、自动纠正、撤销功能、安全确认             |
| 一致性  | 全局一致的图标含义、颜色语义、操作位置             |
| 辅助功能 | 屏幕阅读器优化、语音导航、开关控制支持             |
| 个性化  | 用户可调节的字体大小、颜色主题、交互速度            |

### 6.3 无障碍 UI 组件库

```
无障碍组件层次:

Base Component (React Native 0.76+ + a11y props)
├── Button
│   ├── LargeButton (60×60pt, high contrast)
│   └── IconLabelButton (图标+文字双通道)
├── Input
│   ├── LargeTextInput (min-height: 60px)
│   ├── SymbolInput (符号选择器)
│   └── VoiceInput (语音输入)
├── Navigation
│   ├── SimpleNav (≤ 5 个导航项)
│   └── BreadcrumbNav (面包屑导航)
├── Feedback
│   ├── SuccessFeedback (绿色 + ✓ + 声音)
│   └── ErrorFeedback (红色 + ✗ + 语音提示)
└── Layout
    ├── SingleTaskLayout (单任务布局)
    └── ProgressiveLayout (渐进式布局)
```

---

## 7. 实时通信架构

### 7.1 架构设计

```
┌──────────────────────────────────────────────────────────────────────┐
│                        实时通信架构                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐                │
│  │ 客户端    │───▶│  WebSocket   │───▶│  Session     │                │
│  │ (Browser  │    │  Gateway     │    │  Manager     │                │
│  │  /Mobile) │    │  (Go 1.23+)  │    │              │                │
│  └──────────┘    └──────┬───────┘    └──────┬───────┘                │
│                         │                    │                        │
│                  ┌──────▼────────────────────▼──────┐                 │
│                  │       Redis 7.2+ Pub/Sub        │                 │
│                  │   (跨节点消息广播)                 │                 │
│                  └──────┬────────────────────┬──────┘                 │
│                         │                    │                        │
│                  ┌──────▼──────┐      ┌──────▼──────┐                 │
│                  │ Event       │      │ Event       │                 │
│                  │ Publisher   │      │ Publisher   │                 │
│                  │ (Kafka 3.7+ │      │ (Service)   │                 │
│                  │  →WS)       │      │             │                 │
│                  └─────────────┘      └─────────────┘                 │
│                                                                      │
│  连接管理:                                                            │
│  ├── 心跳保活 (30s interval)                                          │
│  ├── 断线重连 (指数退避, max 5 次)                                     │
│  ├── 会话恢复 (消息重放, last_seq_id)                                  │
│  └── 连接限制 (per-user: 3, per-tenant: 1000)                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 WebSocket 消息协议

```
消息帧格式:
┌────────┬──────────┬───────────┬──────────┬────────────────┐
│ Version│ MsgType  │ TraceID   │ SeqID    │    Payload     │
│ (1B)   │ (1B)     │ (16B ULID)│ (8B)     │    (JSON)      │
└────────┴──────────┴───────────┴──────────┴────────────────┘

消息类型:
0x01: CONNECT      (连接建立)
0x02: CONNECT_ACK  (连接确认)
0x03: DATA         (业务数据)
0x04: ACK          (确认收到)
0x05: PING         (心跳)
0x06: PONG         (心跳响应)
0x07: DISCONNECT   (断开连接)
0x08: RECONNECT    (重连请求)
```

### 7.3 双MQ消息架构

系统采用 Kafka + RabbitMQ 双消息队列架构，分别承载事件流与任务队列两种不同的消息模式：

```
┌──────────────────────────────────────────────────────────────────────┐
│                      双MQ消息架构                                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    Kafka 3.7+ 事件流                         │     │
│  │                                                              │     │
│  │  用途: 实时事件分发、流处理、事件溯源                           │     │
│  │                                                              │     │
│  │  Topics:                                                     │     │
│  │  ├── behavior.events     (行为事件流)                        │     │
│  │  ├── emotion.events      (情绪事件流)                        │     │
│  │  ├── assessment.events   (评估事件流)                        │     │
│  │  └── communication.events(沟通事件流)                        │     │
│  │                                                              │     │
│  │  特性:                                                       │     │
│  │  ├── 高吞吐量 (100K+ msg/s)                                  │     │
│  │  ├── 持久化存储 (7天保留)                                     │     │
│  │  ├── 消费者组横向扩展                                        │     │
│  │  └── Exactly-Once 语义 (事务消息)                             │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                   RabbitMQ 3.13+ 任务队列                    │     │
│  │                                                              │     │
│  │  用途: 异步任务执行、延迟作业、工作流编排                       │     │
│  │                                                              │     │
│  │  Queues:                                                     │     │
│  │  ├── report.generation   (报告生成任务)                      │     │
│  │  ├── notification.send   (通知推送任务)                      │     │
│  │  ├── data.export         (数据导出任务)                      │     │
│  │  ├── assessment.schedule (评估调度任务)                      │     │
│  │  └── model.inference     (AI推理批处理任务)                   │     │
│  │                                                              │     │
│  │  特性:                                                       │     │
│  │  ├── 精确路由 (Exchange + Binding Key)                       │     │
│  │  ├── 延迟消息 (Dead Letter + TTL)                            │     │
│  │  ├── 优先级队列 (紧急任务优先处理)                             │     │
│  │  └── 消息确认机制 (手动ACK, 保证可靠投递)                     │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  协同工作流:                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │ 事件产生 │───▶│ Kafka    │───▶│ 流处理   │───▶│ 触发任务 │       │
│  │ (服务)   │    │ (分发)   │    │ (Flink)  │    │ (RabbitMQ)│      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

| 对比维度   | Kafka 3.7+               | RabbitMQ 3.13+           |
| ------ | ------------------------ | ------------------------ |
| 定位     | 事件流平台                   | 任务队列代理                  |
| 消息模型   | 发布/订阅 (Topic)           | 路由/队列 (Exchange+Queue)  |
| 吞吐量    | 100K+ msg/s              | 20K+ msg/s               |
| 消息持久化  | 磁盘日志 (可回放)               | 队列持久化 (确认后删除)           |
| 消费语义   | At-Least-Once / Exactly  | At-Most-Once / Exactly   |
| 延迟支持   | 否                        | 是 (TTL + DLX)            |
| 优先级    | 否                        | 是 (优先级队列)               |
| 适用场景   | 行为事件流、情绪流、审计日志          | 报告生成、通知推送、数据导出          |

---

## 8. 缓存策略

### 8.1 缓存层级

```
┌──────────────────────────────────────────────────────────────────────┐
│                          缓存策略                                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  L1: 客户端缓存 (Browser/Device)                                     │
│  ├── Service Worker (静态资源, 离线可用)                               │
│  ├── IndexedDB (用户数据快照, 离线模式)                                │
│  └── Memory Cache (当前会话数据)                                      │
│  TTL: 按需 / 24h                                                     │
│                                                                      │
│  L2: API 层缓存 (Redis 7.2+)                                              │
│  ├── 热点数据 (用户画像、量表定义)                                     │
│  ├── 会话状态 (WebSocket 会话)                                        │
│  └── 计算结果 (评估结果, 行为分析)                                     │
│  TTL: 5min - 1h (按数据类型)                                          │
│                                                                      │
│  L3: 数据库缓存 (PostgreSQL 16.x shared_buffers)                          │
│  ├── 热表数据 (最近7天)                                               │
│  └── 索引缓存                                                          │
│                                                                      │
│  L4: AI 模型缓存                                                      │
│  ├── 模型权重 (Triton 常驻内存)                                        │
│  └── 推理结果缓存 (Redis 7.2+, 相同输入短期复用)                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.2 缓存键策略

| 数据类型 | 缓存键模式                         | TTL   | 失效策略    |
| ---- | ----------------------------- | ----- | ------- |
| 用户档案 | `user:profile:{user_id}`      | 30min | 更新时主动失效 |
| 量表定义 | `scale:def:{scale_id}:{ver}`  | 24h   | 版本更新时失效 |
| 评估结果 | `assess:result:{session_id}`  | 7d    | 过期自动失效  |
| 行为模式 | `behavior:patterns:{user_id}` | 1h    | 新记录时刷新  |
| 符号映射 | `comm:symbol:{text_hash}`     | 7d    | LRU 淘汰  |
| 情绪历史 | `emotion:history:{user_id}`   | 24h   | 过期自动失效  |
| 系统配置 | `config:{key}`                | 1h    | 主动失效    |

### 8.3 缓存一致性

```
缓存一致性策略:
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  写操作        │────▶│  更新 DB       │────▶│  失效缓存      │
│  (API)         │     │  (PostgreSQL   │     │  (Redis 7.2+   │
│                │     │   16.x)        │     │   DEL)         │
└────────────────┘     └────────────────┘     └──────┬─────────┘
                                                      │
                                            ┌─────────▼─────────┐
                                            │  发布事件          │
                                            │  (Redis 7.2+ Pub) │
                                            └─────────┬─────────┘
                                                      │
                                            ┌─────────▼─────────┐
                                            │  集群同步          │
                                            │  (其他节点)        │
                                            └────────────────────┘
```

---

## 9. 日志与监控方案

### 9.1 可观测性三支柱

```
┌──────────────────────────────────────────────────────────────────────┐
│                        可观测性架构                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │     Metrics      │  │     Logs         │  │     Traces       │    │
│  │                  │  │                  │  │                  │    │
│  │  Prometheus      │  │  ELK Stack       │  │  Jaeger          │    │
│  │  + Grafana       │  │  (Fluent Bit     │  │  (OpenTelemetry) │    │
│  │                  │  │   → ES → Kibana) │  │                  │    │
│  │  • 系统指标      │  │                  │  │  • 服务调用链    │    │
│  │  • 业务指标      │  │  • 应用日志      │  │  • 延迟分析      │    │
│  │  • 自定义指标    │  │  • 审计日志      │  │  • 错误追踪      │    │
│  │  • 告警规则      │  │  • 安全日志      │  │  • 依赖分析      │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
│                                                                      │
│  日志规范:                                                            │
│  ├── 结构化日志 (JSON 格式)                                           │
│  ├── TraceID 全链路透传                                               │
│  ├── 敏感字段自动脱敏                                                 │
│  └── 日志分级: DEBUG / INFO / WARN / ERROR / FATAL                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.2 核心监控指标

| 指标类别  | 具体指标        | 告警阈值            | 告警级别 |
| ----- | ----------- | --------------- | ---- |
| 可用性   | 服务 UP 率     | < 99.95%        | P0   |
| 响应时间  | API P95 延迟  | > 500ms         | P1   |
| 响应时间  | API P99 延迟  | > 1000ms        | P0   |
| 错误率   | 5xx 错误率     | > 1%            | P0   |
| 错误率   | 4xx 错误率     | > 10%           | P1   |
| AI 推理 | 推理延迟 P95    | > 500ms         | P1   |
| AI 推理 | GPU 利用率     | > 90% (持续 5min) | P1   |
| 数据库   | 连接池使用率      | > 80%           | P1   |
| 数据库   | 慢查询数 (> 1s) | > 10/min        | P1   |
| 缓存    | Redis 7.2+ 内存使用率 | > 80%           | P1   |
| 缓存    | 缓存命中率       | < 85%           | P2   |
| 消息队列  | Kafka 3.7+ Lag | > 10000         | P1   |
| 业务    | 活跃用户数 (DAU) | < 预期 50%        | P2   |
| 业务    | 评估完成率       | < 70%           | P2   |

### 9.3 日志示例

```json
{
  "timestamp": "2026-05-07T01:13:00.123Z",
  "level": "INFO",
  "service": "assessment-service",
  "trace_id": "01HXYZ123456",
  "span_id": "01HXYZ789012",
  "action": "assessment.response_submitted",
  "user_id": "01HABC789012",
  "session_id": "01HDEF345678",
  "question_id": "q3",
  "response_time_ms": 2500,
  "modality": "voice",
  "duration_ms": 45,
  "message": "评估作答提交成功"
}
```

---

## 10. 性能指标与 SLA

### 10.1 性能基准

| 场景             | 指标         | 目标值     | 测量方法       |
| -------------- | ---------- | ------- | ---------- |
| 页面加载 (首次)      | FCP        | < 1.5s  | Web Vitals |
| 页面加载 (首次)      | LCP        | < 2.5s  | Web Vitals |
| 页面加载 (首次)      | INP        | < 200ms | Web Vitals |
| API 响应 (一般)    | P50 延迟     | < 100ms | Prometheus |
| API 响应 (一般)    | P95 延迟     | < 200ms | Prometheus |
| API 响应 (复杂查询)  | P95 延迟     | < 1s    | Prometheus |
| AI 情绪识别        | 端到端延迟      | < 300ms | 自定义指标      |
| AI 语音转文本       | RTF (实时因子) | < 0.3   | 自定义指标      |
| 评估提交           | 全量表完成      | < 3s    | 端到端测试      |
| WebSocket 消息投递 | 延迟         | < 50ms  | 自定义指标      |
| 报告生成           | 标准报告       | < 5s    | 端到端测试      |

### 10.2 SLA 承诺

| SLA 条款     | 承诺值           | 测量周期 | 违约责任   |
| ---------- | ------------- | ---- | ------ |
| 服务可用性      | 99.95%        | 月度   | 服务抵扣   |
| 数据安全       | 零泄露           | 持续   | 法律追责   |
| 数据持久性      | 99.999999999% | 年度   | 数据恢复   |
| API 可用性    | 99.99%        | 月度   | 服务抵扣   |
| 支持响应 (P0)  | < 15min       | 每次事件 | 升级处理   |
| 支持响应 (P1)  | < 1h          | 每次事件 | 优先处理   |
| 支持响应 (P2)  | < 4h          | 每次事件 | 工作日内处理 |
| 故障恢复 (RTO) | < 5min        | 每次故障 | 事后报告   |

### 10.3 容量规划

| 资源              | 当前容量      | 目标容量 (12月) | 扩展触发条件         |
| --------------- | --------- | ---------- | -------------- |
| 并发用户            | 1,000     | 10,000     | CPU > 70%      |
| API QPS         | 500       | 5,000      | P95 > 300ms    |
| AI 推理 QPS       | 50        | 500        | GPU > 80%      |
| 存储 (PostgreSQL 16.x) | 500 GB    | 5 TB       | 磁盘 > 70%       |
| 存储 (对象)         | 1 TB      | 10 TB      | 磁盘 > 70%       |
| 消息吞吐量           | 10K msg/s | 100K msg/s | Kafka 3.7+ Lag > 5K |

---

## 11. 关键业务流程时序图

### 11.1 用户注册与知情同意流程

```
用户(监护人)         客户端           API Gateway      用户服务        同意服务        通知服务
    │                 │                 │               │              │              │
    │  1.注册请求     │                 │               │              │              │
    │────────────────▶│                 │               │              │              │
    │                 │  2.POST /users  │               │              │              │
    │                 │────────────────▶│               │              │              │
    │                 │                 │  3.创建用户    │              │              │
    │                 │                 │──────────────▶│              │              │
    │                 │                 │               │  4.校验唯一性 │              │
    │                 │                 │               │  (email/phone)│              │
    │                 │                 │               │              │              │
    │                 │                 │               │  5.分配角色   │              │
    │                 │                 │               │  (caregiver) │              │
    │                 │                 │               │              │              │
    │                 │                 │  6.用户创建成功│              │              │
    │                 │                 │◀──────────────│              │              │
    │                 │                 │               │              │              │
    │                 │                 │  7.触发GDPR同意流程           │              │
    │                 │                 │──────────────────────────────▶│              │
    │                 │                 │               │              │              │
    │                 │                 │               │    8.生成同意书模板            │
    │                 │                 │               │    (数据采集/处理/存储同意)    │
    │                 │                 │               │              │              │
    │  9.返回用户+同意书URL             │               │              │              │
    │◀────────────────│◀────────────────│◀──────────────│◀─────────────│              │
    │                 │                 │               │              │              │
    │  10.签署同意书  │                 │               │              │              │
    │────────────────▶│                 │               │              │              │
    │                 │  11.POST /consents              │              │              │
    │                 │────────────────▶│               │              │              │
    │                 │                 │  12.记录同意   │              │              │
    │                 │                 │──────────────────────────────▶│              │
    │                 │                 │               │              │              │
    │                 │                 │               │   13.验证同意完整性           │
    │                 │                 │               │   (必要条款全部同意)          │
    │                 │                 │               │              │              │
    │                 │                 │               │   14.激活用户账户            │
    │                 │                 │               │──────────────│              │
    │                 │                 │               │              │              │
    │                 │                 │               │   15.创建家庭组             │
    │                 │                 │               │   (自动创建+设为管理员)       │
    │                 │                 │               │              │              │
    │                 │                 │               │              │  16.发送欢迎通知│
    │                 │                 │               │              │─────────────▶│
    │                 │                 │               │              │              │
    │  17.注册完成通知 │                 │               │              │              │
    │◀────────────────│◀────────────────│◀──────────────│◀─────────────│◀─────────────│
    │                 │                 │               │              │              │
    │  18.邀请家庭成员│                 │               │              │              │
    │────────────────▶│                 │               │              │              │
    │                 │  19.POST /family/members        │              │              │
    │                 │────────────────▶│               │              │              │
    │                 │                 │  20.创建家庭成员链接           │              │
    │                 │                 │──────────────▶│              │              │
    │                 │                 │               │  21.发送邀请  │              │
    │                 │                 │               │──────────────│─────────────▶│
    │                 │                 │               │              │              │
```

### 11.2 自适应评估执行流程

```
治疗师            客户端           评估服务         IRT引擎         AI服务          报告服务
 │                │                │               │               │               │
 │ 1.启动评估     │                │               │               │               │
 │───────────────▶│                │               │               │               │
 │                │ 2.POST /adapt  │               │               │               │
 │                │───────────────▶│               │               │               │
 │                │                │ 3.加载量表配置 │               │               │
 │                │                │──────────────▶│               │               │
 │                │                │               │               │               │
 │                │                │ 4.初始化能力估计│              │               │
 │                │                │               │ (θ=0, 先验分布)│               │
 │                │                │               │               │               │
 │                │                │ 5.IRT选题     │               │               │
 │                │                │◀──────────────│               │               │
 │                │                │ (最大Fisher信息量)             │               │
 │                │                │               │               │               │
 │ 6.展示首题     │                │               │               │               │
 │◀───────────────│◀───────────────│               │               │               │
 │                │                │               │               │               │
 │  ┌─────────────────────────────────────────────────────────────┐ │               │
 │  │                    自适应循环 (每题重复)                      │ │               │
 │  │                                                             │ │               │
 │  │  7.用户作答  │                │               │               │ │               │
 │  │────────────▶│                │               │               │ │               │
 │  │             │ 8.提交作答     │               │               │ │               │
 │  │             │───────────────▶│               │               │ │               │
 │  │             │                │ 9.更新能力估计 │               │ │               │
 │  │             │                │──────────────▶│               │ │               │
 │  │             │                │               │ (EAP/MLE)     │ │               │
 │  │             │                │               │               │ │               │
 │  │             │                │ 10.计算SE     │               │ │               │
 │  │             │                │◀──────────────│               │ │               │
 │  │             │                │               │               │ │               │
 │  │             │                │ 11.终止判定    │               │ │               │
 │  │             │                │──────────────▶│               │ │               │
 │  │             │                │               │ SE < 0.3?     │ │               │
 │  │             │                │               │ 题数 >= 最大?  │ │               │
 │  │             │                │               │               │ │               │
 │  │             │ 12a.继续→下一题 │               │               │ │               │
 │  │             │ 或 12b.终止评估 │               │               │ │               │
 │  └─────────────────────────────────────────────────────────────┘ │               │
 │                │                │               │               │               │
 │                │                │ 13.生成最终能力估计            │               │
 │                │                │◀──────────────│               │               │
 │                │                │               │               │               │
 │                │                │ 14.AI辅助解读  │               │               │
 │                │                │──────────────────────────────▶│               │
 │                │                │               │               │               │
 │                │                │ 15.生成评估结果│               │               │
 │                │                │ (维度得分/百分位/解读)          │               │
 │                │                │               │               │               │
 │                │                │ 16.触发报告生成│               │               │
 │                │                │───────────────────────────────│──────────────▶│
 │                │                │               │               │               │
 │ 17.返回结果    │                │               │               │               │
 │◀───────────────│◀───────────────│               │               │               │
 │                │                │               │               │               │
```

### 11.3 行为事件实时分析流程

```
照护者/设备       客户端          API Gateway     行为服务       Kafka         流处理服务
    │              │               │              │             │             │
    │ 1.记录行为   │               │              │             │             │
    │─────────────▶│               │              │             │             │
    │              │ 2.POST /behaviors             │             │             │
    │              │──────────────▶│              │             │             │
    │              │               │ 3.验证+存储   │             │             │
    │              │               │─────────────▶│             │             │
    │              │               │              │             │             │
    │              │               │              │ 4.发布事件   │             │
    │              │               │              │────────────▶│             │
    │              │               │              │             │             │
    │              │               │              │             │ 5.消费事件   │
    │              │               │              │             │────────────▶│
    │              │               │              │             │             │
    │              │               │              │             │  6.模式匹配  │
    │              │               │              │             │  ┌──────────────────────┐
    │              │               │              │             │  │ • ABC序列匹配        │
    │              │               │              │             │  │ • 时序异常检测        │
    │              │               │              │             │  │ • 频率阈值判断        │
    │              │               │              │             │  │ • 强度趋势分析        │
    │              │               │              │             │  └──────────────────────┘
    │              │               │              │             │             │
    │              │               │              │             │  7.匹配结果 │
    │              │               │              │             │◀────────────│
    │              │               │              │             │             │
    │              │               │              │ 8.触发预警   │             │
    │              │               │              │◀────────────│             │
    │              │               │              │             │             │
    │              │               │              │ 9.创建预警记录             │
    │              │               │              │ (severity/类型/建议)       │
    │              │               │              │             │             │
    │              │               │              │ 10.推送通知  │             │
    │              │               │              │────────────────────────────▶通知服务
    │              │               │              │             │             │    │
    │              │               │              │             │             │    │11.发送
    │              │               │              │             │             │    │预警通知
    │              │               │              │             │             │    │(APP/短信)
    │              │               │              │             │             │    │
    │ 12.实时行为确认│              │              │             │             │    │
    │◀─────────────│               │              │             │             │    │
    │              │               │              │             │             │    │
```

### 11.4 AAC沟通辅助交互流程

```
用户              客户端           沟通服务         NLP引擎         语音服务        符号服务
 │                │                │               │               │               │
 │ 1.多模态输入   │                │               │               │               │
 │ (语音/触控/    │                │               │               │               │
 │  符号/文本)    │                │               │               │               │
 │───────────────▶│                │               │               │               │
 │                │                │               │               │               │
 │                │ 2.输入预处理    │               │               │               │
 │                │ ┌──────────────────────────────────────────────────────────┐    │
 │                │ │ 语音→ASR转文本 │ 触控→坐标映射 │ 符号→ID解析 │ 文本→分词 │    │
 │                │ └──────────────────────────────────────────────────────────┘    │
 │                │                │               │               │               │
 │                │ 3.发送处理请求  │               │               │               │
 │                │───────────────▶│               │               │               │
 │                │                │ 4.意图识别     │               │               │
 │                │                │──────────────▶│               │               │
 │                │                │               │               │               │
 │                │                │               │ 5.解析意图    │               │
 │                │                │               │ ┌────────────────────────┐     │
 │                │                │               │ │ • 意图类型: REQUEST   │     │
 │                │                │               │ │ • 实体: [水, 喝]      │     │
 │                │                │               │ │ • 置信度: 0.92        │     │
 │                │                │               │ └────────────────────────┘     │
 │                │                │               │               │               │
 │                │                │ 6.意图结果     │               │               │
 │                │                │◀──────────────│               │               │
 │                │                │               │               │               │
 │                │                │ 7.符号映射     │               │               │
 │                │                │──────────────────────────────────────────────▶│
 │                │                │               │               │               │
 │                │                │               │               │   8.匹配符号   │
 │                │                │               │               │ ┌──────────┐  │
 │                │                │               │               │ │ [我]     │  │
 │                │                │               │               │ │ [想要]   │  │
 │                │                │               │               │ │ [喝水]   │  │
 │                │                │               │               │ │ [杯子]   │  │
 │                │                │               │               │ └──────────┘  │
 │                │                │               │               │               │
 │                │                │ 9.符号序列     │               │               │
 │                │                │◀──────────────────────────────────────────────│
 │                │                │               │               │               │
 │                │                │ 10.语音合成    │               │               │
 │                │                │──────────────────────────────▶│               │
 │                │                │               │               │               │
 │                │                │               │  11.TTS生成   │               │
 │                │                │               │  (个性化音色)  │               │
 │                │                │               │               │               │
 │                │                │ 12.音频流      │               │               │
 │                │                │◀──────────────────────────────│               │
 │                │                │               │               │               │
 │ 13.展示结果    │                │               │               │               │
 │ ┌──────────────────────────────────────────────────────────┐    │               │
 │ │ • 符号卡片序列展示                                        │    │               │
 │ │ • 语音播放                                                │    │               │
 │ │ • 文本显示                                                │    │               │
 │ └──────────────────────────────────────────────────────────┘    │               │
 │                │                │               │               │               │
 │ 14.用户反馈    │                │               │               │               │
 │ (确认/修正/    │                │               │               │               │
 │  重新输入)     │                │               │               │               │
 │───────────────▶│                │               │               │               │
 │                │ 15.记录交互日志 │               │               │               │
 │                │───────────────▶│               │               │               │
 │                │                │ 16.更新用户沟通模型            │               │
 │                │                │ (偏好学习/常用表达)            │               │
 │                │                │               │               │               │
```

---

## 12. 错误处理与弹性模式

### 12.1 全局错误码体系

错误码采用6位数字编码：前2位为服务标识，中2位为模块标识，后2位为具体错误。

| 位段   | 范围        | 说明                                     |
| ---- | --------- | -------------------------------------- |
| 服务标识 | 01-99     | 01=用户服务, 02=评估服务, 03=行为服务, 04=沟通服务, 05=情绪服务, 06=报告服务, 07=通知服务, 00=公共 |
| 模块标识 | 01-99     | 各服务内部模块编号                              |
| 具体错误 | 01-99     | 模块内具体错误编号                              |

**服务标识定义：**

| 服务标识 | 服务名称   | 模块标识示例                                |
| ---- | ------ | ------------------------------------- |
| 01   | 用户服务   | 01=认证, 02=档案, 03=同意, 04=家庭组          |
| 02   | 评估服务   | 01=会话, 02=作答, 03=IRT, 04=结果           |
| 03   | 行为服务   | 01=事件, 02=模式, 03=预警                   |
| 04   | 沟通服务   | 01=意图, 02=符号, 03=语音, 04=模板            |
| 05   | 情绪服务   | 01=检测, 02=历史, 03=流式                   |
| 06   | 报告服务   | 01=生成, 02=下载, 03=定时                   |
| 07   | 通知服务   | 01=推送, 02=邮件, 03=短信                   |
| 00   | 公共     | 01=参数校验, 02=权限, 03=限流, 04=内部错误       |

**常见错误码示例：**

| 错误码    | HTTP状态码 | 描述                  |
| ------ | ------- | ------------------- |
| 000101 | 400     | 请求参数校验失败            |
| 000201 | 401     | 未认证（Token缺失或过期）     |
| 000202 | 403     | 无权限访问该资源            |
| 000301 | 429     | 请求频率超限              |
| 000401 | 500     | 服务内部错误              |
| 010101 | 401     | 登录凭证无效              |
| 010201 | 404     | 用户档案不存在             |
| 010301 | 409     | 知情同意版本冲突            |
| 020101 | 404     | 评估会话不存在             |
| 020301 | 422     | IRT参数估计失败           |
| 030101 | 422     | 行为事件数据格式无效          |
| 030301 | 503     | 预警服务暂时不可用           |
| 040101 | 422     | 意图识别置信度不足           |
| 040301 | 503     | 语音合成服务不可用           |
| 050101 | 422     | 情绪检测输入数据不足          |

### 12.2 重试策略

| 参数         | 值                  | 说明                    |
| ---------- | ------------------ | --------------------- |
| 重试策略       | 指数退避 + 抖动          | 避免重试风暴                |
| 初始退避时间    | 100ms              | 首次重试等待时间              |
| 退避倍数       | 2                  | 每次退避时间翻倍              |
| 最大退避时间    | 30s                | 退避时间上限                |
| 抖动因子       | ±20%               | 随机抖动防止同步重试            |
| 最大重试次数    | 3                  | 超过后返回错误               |
| 重试超时       | 单次请求超时的1.5倍        | 每次重试的超时时间             |

**可重试错误类型：**

| 错误类型       | 可重试 | 说明                 |
| ---------- | --- | ------------------ |
| 网络超时       | 是   | 连接超时/读取超时          |
| 连接拒绝       | 是   | 服务暂时不可达            |
| 503 服务不可用  | 是   | 服务过载或维护中           |
| 429 请求限流   | 是   | 触发限流，等待后重试         |
| 500 内部错误   | 是   | 临时性服务故障            |
| 400 参数错误   | 否   | 客户端请求有误，重试无意义      |
| 401 未认证    | 否   | 需要重新获取凭证           |
| 403 无权限    | 否   | 权限不足，重试无意义         |
| 404 不存在    | 否   | 资源不存在              |
| 409 冲突     | 否   | 数据版本冲突，需客户端处理      |
| 422 业务校验失败 | 否   | 业务规则校验不通过          |

### 12.3 熔断器模式

```
                    ┌─────────────────────────────────────┐
                    │          熔断器状态机                  │
                    │                                     │
     失败率<阈值      │  ┌─────────┐    失败率≥阈值    ┌─────────┐
  ┌──────────────────│  │         │───────────────▶│         │
  │                  │  │ Closed  │               │  Open   │
  │                  │  │ (正常)   │               │ (熔断)   │
  │                  │  └─────────┘               └────┬────┘
  │                  │       ▲                         │
  │                  │       │                         │ 超时后
  │                  │       │                         │
  │                  │  ┌────┴────┐               ┌────▼────┐
  │    探测成功       │  │         │   探测请求     │         │
  └──────────────────│  │ Closed  │◀─────────────│Half-Open│
                     │  │         │               │ (半开)   │
   探测失败           │  └─────────┘───────────────│         │
  ┌──────────────────│                          └────┬────┘
  │                  │                               │
  └──────────────────│──────────────────────────────▶│ Open
                     │                                     │
                     └─────────────────────────────────────┘
```

**熔断器配置：**

| 配置项            | 默认值  | 说明                       |
| -------------- | ---- | ------------------------ |
| 滑动窗口大小        | 100  | 统计失败率的请求窗口数量             |
| 失败率阈值         | 50%  | 超过此阈值触发熔断                |
| 慢调用阈值         | 5s   | 超过此时间视为慢调用               |
| 慢调用率阈值        | 80%  | 慢调用占比超过此阈值触发熔断           |
| Open状态持续时间    | 30s  | 熔断器保持Open的最短时间           |
| Half-Open探测请求数 | 5    | 半开状态下允许通过的探测请求数          |
| Half-Open成功阈值  | 3    | 探测请求中成功数达到此值则关闭熔断器       |

**各服务熔断器配置：**

| 服务       | 失败率阈值 | 慢调用阈值 | Open持续时间 |
| -------- | ----- | ------ | --------- |
| AI推理服务   | 30%   | 3s     | 60s       |
| 数据库服务    | 50%   | 2s     | 30s       |
| 外部通知服务   | 60%   | 5s     | 120s      |
| Kafka生产者 | 40%   | 1s     | 30s       |

### 12.4 降级策略

| 降级场景       | 降级方案                          | 触发条件               | 影响范围     |
| ---------- | ----------------------------- | ------------------ | -------- |
| AI情绪识别不可用  | 降级到规则引擎（基于关键词匹配+阈值判断）        | AI服务熔断或超时率>30%     | 情绪检测准确度下降 |
| AI行为分析不可用  | 降级到统计规则（频率阈值+简单趋势判断）         | AI服务熔断或超时率>30%     | 行为模式识别精度下降 |
| AI意图识别不可用  | 降级到精确匹配（符号直接映射+模板匹配）         | NLP服务熔断             | 沟通辅助灵活性下降 |
| Redis不可用  | 降级到本地缓存+直接查询数据库              | Redis连接失败率>50%     | 响应延迟增加   |
| Kafka不可用  | 降级到同步处理+本地队列缓冲               | Kafka生产失败率>30%     | 实时性降低    |
| 报告生成服务不可用  | 降级到简化报告模板（无AI解读，仅原始数据）       | 报告服务超时率>50%        | 报告内容简化   |
| 语音合成不可用   | 降级到文本展示+预录音频                 | TTS服务不可用           | 无语音输出    |
| 语音识别不可用   | 降级到纯文本/符号输入模式                | ASR服务不可用           | 无语音输入    |

**功能降级优先级表（从高到低）：**

| 优先级 | 功能模块     | 降级策略               | 说明           |
| --- | -------- | ------------------ | ------------ |
| P0  | 核心认证与授权  | 不降级                | 系统基础，必须可用    |
| P0  | 数据存储与读取  | 降级到只读模式            | 保证数据不丢失      |
| P1  | 评估作答采集   | 降级到离线模式+延迟同步       | 保证评估数据不丢失    |
| P1  | 行为事件记录   | 降级到本地缓冲+延迟上报       | 保证行为数据不丢失    |
| P1  | AAC基础沟通  | 降级到本地符号板           | 保证基本沟通能力     |
| P2  | AI情绪识别   | 降级到规则引擎            | 准确度下降但可用     |
| P2  | AI行为分析   | 降级到统计规则            | 模式识别精度下降     |
| P2  | 自适应评估    | 降级到固定量表            | 评估效率降低       |
| P3  | 报告AI解读   | 降级到原始数据报告          | 无AI辅助解读      |
| P3  | 个性化语音合成  | 降级到默认音色            | 无个性化音色      |
| P4  | 高级数据可视化  | 降级到简单图表            | 可视化效果简化      |

### 12.5 幂等性设计

| 机制        | 实现方式                                    | 适用场景             |
| --------- | --------------------------------------- | ---------------- |
| ULID幂等键   | 客户端生成ULID作为请求幂等键，服务端基于幂等键去重            | 所有写操作            |
| 乐观锁       | 基于version字段的CAS更新，`UPDATE ... SET version=version+1 WHERE version=old` | 并发更新场景（用户档案、评估结果） |
| 去重表       | 独立`idempotency_keys`表记录已处理的请求ID，TTL 24h自动清理 | 关键业务操作（支付、通知发送）  |
| 数据库唯一约束   | 利用UNIQUE约束防止重复插入                       | 唯一性要求（邮箱、用户名）    |
| Redis SETNX | 使用`SETNX`实现分布式锁+幂等判断                  | 高频短时操作（点赞、行为记录）  |

**幂等键表结构：**

| 字段             | 类型           | 说明                |
| -------------- | ------------ | ----------------- |
| idempotency_key | VARCHAR(64)  | PK, ULID幂等键       |
| service_name   | VARCHAR(32)  | 服务名称              |
| request_hash   | VARCHAR(128) | 请求内容哈希（用于结果复用）    |
| response_data  | JSONB        | 首次响应数据（用于重复请求返回）  |
| status         | VARCHAR(16)  | processing/completed/failed |
| created_at     | TIMESTAMPTZ  | 创建时间              |
| expired_at     | TIMESTAMPTZ  | 过期时间（默认24h）       |

### 12.6 超时策略

| API类别         | 连接超时   | 读取超时    | 总超时     | 说明           |
| -------------- | ------ | ------- | ------- | ------------ |
| 用户认证API       | 2s     | 5s      | 7s      | 登录/刷新Token   |
| 用户档案API       | 2s     | 5s      | 7s      | 读写用户信息       |
| 评估作答API       | 2s     | 10s     | 12s     | 提交作答需较长处理    |
| 行为事件API       | 2s     | 5s      | 7s      | 行为记录写入       |
| AI情绪检测API     | 3s     | 5s      | 8s      | 含模型推理时间      |
| AI语音识别API     | 3s     | 15s     | 18s     | 长音频处理需较长时间   |
| AI语音合成API     | 3s     | 10s     | 13s     | 流式返回         |
| 报告生成API       | 2s     | 30s     | 32s     | 报告生成耗时较长     |
| 数据导出API       | 2s     | 60s     | 62s     | 大数据量导出       |
| WebSocket连接   | 5s     | -       | -       | 心跳保活30s      |
| Kafka生产者      | 2s     | 5s      | 7s      | 消息发送超时       |
| RabbitMQ生产者   | 2s     | 5s      | 7s      | 消息发送超时       |
| PostgreSQL查询  | 2s     | 5s      | 7s      | 一般查询         |
| PostgreSQL复杂查询 | 2s     | 30s     | 32s     | 报告/统计类查询     |
| Redis操作       | 1s     | 2s      | 3s      | 缓存读写         |
| 外部通知服务        | 3s     | 10s     | 13s     | 短信/邮件/推送     |

---

## 13. 国际化与本地化方案

### 13.1 i18n架构设计

```
┌──────────────────────────────────────────────────────────────────────┐
│                       i18n架构设计                                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    前端 i18next                              │     │
│  │                                                              │     │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │     │
│  │  │ zh-Hans    │  │ zh-Hant    │  │ en         │             │     │
│  │  │ (简体中文)  │  │ (繁体中文)  │  │ (英语)     │             │     │
│  │  └────────────┘  └────────────┘  └────────────┘             │     │
│  │  ┌────────────┐                                             │     │
│  │  │ ja         │                                             │     │
│  │  │ (日语)     │                                             │     │
│  │  └────────────┘                                             │     │
│  │                                                              │     │
│  │  • 运行时语言切换 (无需刷新)                                    │     │
│  │  • 命名空间分离 (common/assessment/behavior/communication)   │     │
│  │  • 复数规则 + 性别语法支持                                     │     │
│  │  • ICU MessageFormat (变量插值 + 选择器)                      │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                   后端 i18n 资源包                            │     │
│  │                                                              │     │
│  │  ├── locales/                                               │     │
│  │  │   ├── zh-Hans/  (错误消息、邮件模板、通知模板)               │     │
│  │  │   ├── zh-Hant/                                           │     │
│  │  │   ├── en/                                                │     │
│  │  │   └── ja/                                                │     │
│  │  ├── Accept-Language 头解析                                  │     │
│  │  └── 用户偏好语言覆盖 (user_profile.locale)                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                  AI模型多语言支持                              │     │
│  │                                                              │     │
│  │  ├── 情绪识别: 多语言语音/文本情感模型                         │     │
│  │  ├── NLP: 多语言BERT/意图识别模型                            │     │
│  │  ├── TTS: 多语言语音合成（含方言变体）                        │     │
│  │  └── ASR: 多语言语音识别（Whisper多语言版）                   │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 13.2 支持语言列表

| 语言代码   | 语言名称   | 字体要求             | 文本方向 | 完成度目标 |
| ------ | ------ | ---------------- | ---- | ---- |
| zh-Hans | 中文简体   | Noto Sans SC     | LTR  | 100% |
| zh-Hant | 中文繁体   | Noto Sans TC     | LTR  | 100% |
| en     | 英语     | Inter / Roboto   | LTR  | 100% |
| ja     | 日语     | Noto Sans JP     | LTR  | 80%  |

**语言检测优先级：**

1. 用户档案中存储的语言偏好 (`user_profile.locale`)
2. Accept-Language HTTP 头
3. 客户端设备系统语言
4. 默认语言：zh-Hans

### 13.3 量表本地化策略

| 本地化维度  | 具体策略                                    | 质量保证              |
| ------ | --------------------------------------- | ----------------- |
| 翻译     | 前向翻译→回译→专家评审→认知访谈                       | 翻译等价性 (ITC指南)     |
| 文化适配   | 举例内容本地化、社会规范适配、禁忌话题处理                   | 文化敏感性评审           |
| 常模本地化  | 基于本地样本建立常模数据（≥500人/年龄组/性别）              | 常模代表性检验           |
| 认知友好适配 | 简化语言、图标配适、颜色语义本地化                       | 目标用户认知访谈          |
| 评分适配   | 保留原始评分逻辑，本地化仅影响呈现和常模对照                  | 评分等价性验证           |
| 版本管理   | 每个语言版本独立版本号，与原版量表版本关联                   | 版本对齐追踪            |

**量表本地化流程：**

```
原版量表 (英文) ──▶ 前向翻译 (双语专家) ──▶ 回译验证 (独立翻译者)
                                                      │
                                               回译与原版对比
                                                      │
                                              ┌───────┴───────┐
                                              │ 差异可接受?     │
                                              └───────┬───────┘
                                         否 ◀──────────┤──────────▶ 是
                                         │             │
                                    修订翻译      专家评审通过
                                         │             │
                                         └──────┬──────┘
                                                │
                                         认知访谈 (目标用户)
                                                │
                                         本地常模数据采集
                                                │
                                         发布本地化版本
```

### 13.4 日期/时间/数字格式化

| 格式类型   | zh-Hans          | zh-Hant          | en               | ja               |
| ------ | ---------------- | ---------------- | ---------------- | ---------------- |
| 日期     | 2026年5月7日       | 2026年5月7日       | May 7, 2026      | 2026年5月7日       |
| 短日期    | 2026/05/07       | 2026/05/07       | 05/07/2026       | 2026/05/07       |
| 时间     | 14:30            | 14:30            | 2:30 PM          | 14:30            |
| 日期时间   | 2026年5月7日 14:30 | 2026年5月7日 14:30 | May 7, 2026 2:30 PM | 2026年5月7日 14:30 |
| 数字     | 1,234.56         | 1,234.56         | 1,234.56         | 1,234.56         |
| 百分比    | 85.5%            | 85.5%            | 85.5%            | 85.5%            |
| 货币     | ¥1,234.56        | NT$1,234.56      | $1,234.56        | ¥1,234           |

**格式化实现：**

- 前端：使用 `Intl` API（`Intl.DateTimeFormat`、`Intl.NumberFormat`）
- 后端：使用 Go 的 `golang.org/x/text` 和 `time` 包
- 数据库：统一存储为 UTC TIMESTAMPTZ，展示时按用户时区转换

### 13.5 RTL布局支持预留

虽然当前支持的语言均为LTR（从左到右）布局，但架构层面预留RTL（从右到左）支持：

| 预留措施         | 实现方式                                  |
| ------------ | ------------------------------------- |
| CSS逻辑属性     | 使用 `margin-inline-start` 替代 `margin-left` |
| Flexbox方向    | 使用 `dir="auto"` 自动推断文本方向              |
| 组件镜像         | 导航栏、图标、进度条支持RTL镜像                    |
| i18next RTL检测 | `i18n.dir()` 返回文本方向                   |
| 布局翻转         | `html[dir="rtl"]` 选择器触发布局翻转           |
| 符号板方向        | AAC符号板支持RTL排列方向                       |

---

## 14. 数据迁移与版本演进策略

### 14.1 数据库迁移框架

采用 [golang-migrate](https://github.com/golang-migrate/migrate) 作为数据库迁移工具：

```
migrations/
├── 000001_create_tenants.up.sql
├── 000001_create_tenants.down.sql
├── 000002_create_users.up.sql
├── 000002_create_users.down.sql
├── 000003_create_user_profiles.up.sql
├── 000003_create_user_profiles.down.sql
├── 000004_create_assessment_tables.up.sql
├── 000004_create_assessment_tables.down.sql
├── 000005_create_behavior_tables.up.sql
├── 000005_create_behavior_tables.down.sql
└── ...
```

**迁移规范：**

| 规范项        | 约定                                          |
| ---------- | ------------------------------------------- |
| 命名格式       | `{序号}_{描述}.up.sql` / `{序号}_{描述}.down.sql`   |
| 序号格式       | 6位零填充递增数字                                   |
| 迁移不可变      | 已执行的迁移文件不可修改，只能新增补偿迁移                       |
| 向前兼容       | 新迁移必须兼容上一版本的应用代码                            |
| 回滚要求       | 每个up迁移必须提供对应的down迁移                         |
| 数据迁移       | DDL变更与数据迁移分离，数据迁移使用独立脚本                     |
| 审核要求       | 破坏性变更（删列、改类型）需架构师审核                         |

### 14.2 语义化版本控制规范

采用 SemVer 2.0 规范：

```
MAJOR.MINOR.PATCH[-PRERELEASE]+BUILD

示例:
  1.0.0        — 首个正式发布版本
  1.1.0        — 新增功能（向后兼容）
  1.1.1        — Bug修复
  2.0.0        — 破坏性变更
  2.0.0-beta.1 — 预发布版本
```

| 版本段     | 递增条件             | 示例                    |
| ------- | ---------------- | --------------------- |
| MAJOR   | 破坏性API变更、不兼容的数据模型变更 | 删除API端点、修改数据库表结构      |
| MINOR   | 新增功能（向后兼容）        | 新增API端点、新增量表支持        |
| PATCH   | Bug修复（向后兼容）       | 修复评估计分错误、修复UI问题       |
| PRERELEASE | 预发布标识         | alpha, beta, rc        |

**版本发布流程：**

```
开发分支 (feature/*) ──▶ develop ──▶ release/vX.Y.Z ──▶ main
                              │              │               │
                              │              │               │
                         持续集成          版本冻结测试       正式发布
                         自动部署到        部署到Staging     部署到Production
                         Dev环境         仅修Bug           打Tag+Changelog
```

### 14.3 API版本管理策略

**URL路径版本化：**

```
/api/v1/users     — 当前稳定版本
/api/v2/users     — 下一主版本（引入破坏性变更时）
```

| 策略       | 规则                                    |
| -------- | ------------------------------------- |
| 版本格式     | `/api/v{MAJOR}/...`                   |
| 小版本兼容    | MINOR/PATCH变更不改变API路径，保持向后兼容         |
| 大版本升级    | MAJOR变更时新增路径版本，旧版本进入废弃周期             |
| 请求头标识    | `API-Version: v1` 可选，覆盖URL版本          |

**API废弃周期：**

| 阶段      | 持续时间  | 行为                           |
| ------- | ----- | ---------------------------- |
| 活跃      | -     | 正常服务，完整支持                    |
| 弃用通知    | 即时    | 响应头添加 `Deprecation: true` + `Sunset: <date>` |
| 兼容维护    | 6个月   | 继续服务但不再新增功能，文档标记为已弃用         |
| 停止服务    | 到期后   | 返回 `410 Gone` + 迁移指引         |

**版本迁移支持：**

- 提供版本间差异文档与迁移指南
- 弃用API响应中包含迁移建议链接
- 监控旧版本API调用量，设定下线阈值（< 1%流量）

### 14.4 数据模型演进原则

| 原则       | 说明                                    | 示例                    |
| -------- | ------------------------------------- | --------------------- |
| 向前兼容     | 新版本代码能读取旧版本数据，旧版本代码能容忍新版本数据           | 新增列设默认值，旧代码忽略未知字段     |
| 双写策略     | 模型变更期间同时写入新旧两种格式，读取优先新格式              | 新增`scores_v2`列，同时写入`scores`和`scores_v2` |
| 零停机迁移    | 迁移分多步执行，避免锁表和长时间阻塞                    | 加列→双写→迁移数据→验证→删旧列     |
| 可逆性      | 每步迁移均可回滚，保证故障时快速恢复                    | 保留旧列直到确认新列数据完整        |
| 增量迁移     | 大表数据迁移采用批量处理，避免长事务                    | 每批1000行，间隔100ms       |

**零停机迁移示例（新增列+数据转换）：**

```
步骤1: 添加新列 (可在线执行)
  ALTER TABLE assessment_results ADD COLUMN scores_v2 JSONB;
  → 应用代码: 仅写入scores_v2，仍读取scores

步骤2: 双写阶段 (部署新版本代码)
  → 应用代码: 同时写入scores和scores_v2，优先读取scores_v2
  → 运行数据回填脚本: 批量将scores转换为scores_v2

步骤3: 验证阶段
  → 对比scores和scores_v2数据一致性
  → 确认100%数据已迁移

步骤4: 切换读取 (部署新版本代码)
  → 应用代码: 仅读取scores_v2

步骤5: 清理 (确认稳定后执行)
  ALTER TABLE assessment_results DROP COLUMN scores;
  ALTER TABLE assessment_results RENAME COLUMN scores_v2 TO scores;
```

### 14.5 回滚策略

| 回滚场景       | 回滚策略                          | RTO目标  | 数据处理           |
| ---------- | ----------------------------- | ------ | -------------- |
| 应用代码缺陷     | 回滚到上一版本容器镜像                   | < 2min | 无需处理（向前兼容保证）   |
| 数据库迁移失败    | 执行down迁移脚本回滚                  | < 5min | 自动回滚DDL        |
| 数据迁移异常     | 从备份恢复+重放增量日志                  | < 30min | PITR时间点恢复      |
| 配置变更错误     | GitOps自动回滚到上一配置版本             | < 1min | 无需处理           |
| AI模型异常     | MLflow模型版本回退到上一稳定版本           | < 3min | 推理结果缓存失效       |
| 全局性故障      | 蓝绿部署切换到稳定环境                   | < 5min | 数据库只读切换        |

**回滚决策矩阵：**

| 影响范围   | 严重程度 | 决策     | 审批要求   |
| ------ | ---- | ------ | ------ |
| 单个功能   | 低    | 下一版本修复 | 开发负责人  |
| 单个功能   | 高    | 立即回滚   | 开发负责人  |
| 多个功能   | 低    | 下一版本修复 | 技术负责人  |
| 多个功能   | 高    | 立即回滚   | 技术负责人  |
| 核心功能   | 任何   | 立即回滚   | 架构师    |
| 数据安全   | 任何   | 立即回滚+安全评估 | CTO + 安全团队 |

**数据库备份与恢复：**

| 备份类型   | 频率    | 保留策略   | 恢复方式          |
| ------ | ----- | ------ | ------------- |
| 全量备份   | 每日    | 保留30天  | pg_restore    |
| 增量备份   | 每小时   | 保留7天   | WAL重放         |
| WAL归档  | 持续    | 保留7天   | PITR时间点恢复     |
| 逻辑备份   | 每周    | 保留90天  | pg_dump恢复     |

---

## 附录 A: 技术债务与风险登记

| 编号  | 风险描述        | 影响  | 概率  | 缓解策略               |
| --- | ----------- | --- | --- | ------------------ |
| R1  | AI 模型偏差导致误判 | 高   | 中   | 多模型校验 + 人工审核兜底     |
| R2  | 敏感数据泄露      | 极高  | 低   | 加密 + 审计 + 定期渗透测试   |
| R3  | 第三方依赖服务不可用  | 高   | 中   | 降级策略 + 本地缓存 + 多供应商 |
| R4  | 量表版权合规风险    | 中   | 低   | 版权授权审查 + 替代方案储备    |
| R5  | 无障碍兼容性碎片化   | 中   | 中   | 多平台测试矩阵 + 自动化检测    |

## 附录 B: 项目启动检查清单

- [ ] 基础设施: K8s 集群、网络、存储、DNS 就绪
- [ ] CI/CD: 流水线、镜像仓库、GitOps 配置完成
- [ ] 数据库: PostgreSQL 16.x 集群、Redis 7.2+ 集群、ES 集群部署
- [ ] 密钥管理: Vault 初始化、KMS 集成
- [ ] 监控: Prometheus、Grafana、ELK、Jaeger 部署
- [ ] AI 平台: MLflow、Triton、Kubeflow 部署
- [ ] 安全: WAF、DDoS、渗透测试计划
- [ ] 合规: HIPAA/GDPR 评估、等保三级备案
- [ ] 无障碍: axe-core 集成、WCAG 测试用例
- [ ] 团队: 角色分工、开发环境搭建、代码规范

---

*文档版本: v1.1 | 最后更新: 2026-05-07 | 状态: 评审中*
