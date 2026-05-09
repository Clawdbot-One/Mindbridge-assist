# 平台部署手册 — 在线心理评估与行为能力分析辅助支持系统

**文档版本:** 2.0  
**编制日期:** 2026-05-07  
**项目代号:** MindBridge-Assist  
**密级:** 内部公开 — 生产环境操作参考  

---

## 目录

1. [部署架构概述](#1-部署架构概述)
2. [环境要求](#2-环境要求)
3. [容器化部署方案](#3-容器化部署方案)
4. [Kubernetes集群部署方案](#4-kubernetes集群部署方案)
5. [各云平台部署指南](#5-各云平台部署指南)
6. [数据库部署与配置](#6-数据库部署与配置)
7. [中间件部署](#7-中间件部署)
8. [AI/ML服务部署](#8-aiml服务部署)
9. [网络与安全配置](#9-网络与安全配置)
10. [备份与灾备方案](#10-备份与灾备方案)
11. [监控与告警配置](#11-监控与告警配置)
12. [蓝绿/金丝雀发布流程](#12-蓝绿金丝雀发布流程)
13. [安全基线配置](#13-安全基线配置)
14. [运维SOP](#14-运维sop)
15. [多云部署一致性保障](#15-多云部署一致性保障)
16. [部署检查清单](#16-部署检查清单)
17. [环境变量配置参考](#17-环境变量配置参考)

---

## 1. 部署架构概述

### 1.1 总体架构

```
                    ┌─────────────────────────────────────┐
                    │          CDN + WAF + DDoS防护         │
                    │        (CloudFlare / 云厂商WAF)        │
                    └────────────────┬────────────────────┘
                                     │ HTTPS (443)
                    ┌────────────────▼────────────────────┐
                    │        负载均衡 (ALB/NLB)             │
                    │     公网LB + 内网LB + TLS卸载          │
                    └───────┬────────────┬────────────────┘
                            │            │
              ┌─────────────▼──┐  ┌──────▼──────────────┐
              │   API Gateway   │  │  静态资源服务器       │
              │   Kong/APISIX   │  │  (CDN回源/Nginx)     │
              └───────┬─────────┘  └─────────────────────┘
                      │
        ┌─────────────┼─────────────────┐
        │             │                 │
  ┌─────▼────┐ ┌─────▼────┐    ┌──────▼──────┐
  │ Web服务   │ │ 移动端BFF │    │ AI推理服务   │
  │ (Next.js) │ │ (Node.js) │    │ (vLLM/TF)   │
  └─────┬────┘ └─────┬────┘    └──────┬──────┘
        │             │                │
        └──────┬──────┘────────────────┘
               │ 内部gRPC/REST
    ┌──────────▼──────────────────────────┐
    │          业务微服务集群               │
    │  ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
    │  │用户   │ │评估   │ │报告   │ │通知  │ │
    │  │服务   │ │服务   │ │服务   │ │服务  │ │
    │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬──┘ │
    └─────┼────────┼────────┼────────┼─────┘
          │        │        │        │
    ┌─────▼──┐ ┌───▼───┐ ┌─▼────┐ ┌▼──────┐ ┌──────┐
    │PostgreSQL││ Redis │ │Rabbit│ │ MinIO │ │Kafka │
    │ (主从)   │ │ (集群) │ │  MQ  │ │ (S3)  │ │(事件流)│
    └────────┘ └───────┘ └──────┘ └───────┘ └──────┘
```

### 1.2 部署环境层级

| 环境 | 用途 | 域名示例 | 数据 |
|-----|------|---------|------|
| Development | 开发调试 | dev.mindbridge.internal | Mock数据 |
| Staging | 集成测试/UAT | staging.mindbridge.com | 脱敏数据 |
| Production | 正式服务 | app.mindbridge.com | 真实数据 |

### 1.3 服务清单

| 服务 | 端口 | 副本数(Prod) | 资源配额 |
|-----|------|------------|---------|
| web-frontend | 3000 | 3 | 2C4G |
| mobile-bff | 3001 | 2 | 1C2G |
| api-gateway | 8000 | 3 | 2C4G |
| user-service | 9001 | 2 | 1C2G |
| assessment-service | 9002 | 3 | 2C4G |
| report-service | 9003 | 2 | 1C2G |
| notification-service | 9004 | 2 | 1C2G |
| ai-inference (CPU) | 8501 | 3 | 4C8G |
| ai-inference (GPU) | 8502 | 2 | 8C16G+1×T4 |
| keycloak | 8080 | 2 | 2C4G |

---

## 2. 环境要求

### 2.1 硬件要求

#### 生产环境（推荐配置）

| 组件 | 最低配置 | 推荐配置 | 说明 |
|-----|---------|---------|------|
| 控制平面节点 | 4C8G × 3 | 8C16G × 3 | K8s Master/etcd |
| 工作节点（通用） | 8C16G × 3 | 16C32G × 5 | 业务服务 |
| 工作节点（AI/GPU） | 8C32G+1×T4 × 1 | 16C64G+1×A10G × 2 | AI推理服务 |
| PostgreSQL | 8C32G | 16C64G + NVMe SSD | 主从各1台 |
| Redis集群 | 4C8G × 3 | 8C16G × 6 | 3主3从 |
| RabbitMQ | 4C8G × 3 | 8C16G × 3 | 集群模式（任务队列） |
| Kafka | 8C16G × 3 | 8C32G × 3 | 集群模式（事件流） |
| MinIO | 8C16G × 4 | 16C32G × 4 + 大容量SSD | 纠删码部署 |

### 2.2 软件要求

| 软件 | 最低版本 | 推荐版本 | 说明 |
|-----|---------|---------|------|
| 操作系统 | Ubuntu 22.04 LTS / Rocky Linux 9 | Ubuntu 24.04 LTS | 所有节点统一 |
| 容器运行时 | containerd 1.7+ | containerd 1.7+ | 推荐containerd |
| Kubernetes | 1.31+ | 1.31+ | 生产推荐1.31 |
| Docker（构建用） | 26+ | 27+ | CI/CD节点 |
| Go | 1.23+ | 1.23+ | 后端服务编译 |
| Helm | 3.14+ | 3.16+ | K8s包管理 |
| Terraform | 1.8+ | 1.9+ | IaC |

### 2.3 网络要求

| 项目 | 要求 |
|-----|------|
| 公网带宽 | ≥100Mbps（生产），按流量弹性扩展 |
| 内网带宽 | ≥10Gbps（节点间通信） |
| DNS | 内网DNS + 公网域名解析 |
| SSL证书 | 通配符证书或各服务独立证书 |
| NTP | 所有节点时间同步（误差≤1s） |
| 防火墙 | 仅开放必要端口，默认拒绝策略 |

---

## 3. 容器化部署方案

### 3.1 Docker 镜像规范

所有服务遵循统一Docker镜像规范：

```dockerfile
# ===== 多阶段构建示例（后端Go服务）=====

# Stage 1: Build
FROM golang:1.23-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/server ./cmd/server

# Stage 2: Runtime
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata && \
    addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app
COPY --from=builder /app/server .

USER appuser
EXPOSE 9001

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9001/health || exit 1

ENTRYPOINT ["/app/server"]
```

### 3.2 镜像命名规范

```
<registry>/<project>/<service>:<version>

示例：
registry.mindbridge.com/mindbridge/user-service:v1.2.0
registry.mindbridge.com/mindbridge/ai-inference:v1.2.0-gpu
```

### 3.3 Docker Compose 配置（开发/单机部署）

```yaml
# docker-compose.yml — 完整开发环境
version: "3.9"

x-common-env: &common-env
  LOG_LEVEL: info
  DB_HOST: postgres
  DB_PORT: 5432
  DB_NAME: mindbridge
  DB_USER: ${DB_USER:-mindbridge}
  DB_PASSWORD: ${DB_PASSWORD}
  REDIS_URL: redis://redis:6379/0
  RABBITMQ_URL: amqp://rabbitmq:5672
  KAFKA_BROKERS: kafka:9092
  MINIO_ENDPOINT: minio:9000
  MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
  MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
  KEYCLOAK_URL: http://keycloak:8080
  KEYCLOAK_REALM: mindbridge
  JWT_SECRET: ${JWT_SECRET}

services:
  # ===== 基础设施 =====
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mindbridge
      POSTGRES_USER: ${DB_USER:-mindbridge}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-mindbridge}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.2-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-admin}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmqdata:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"  # Management UI

  kafka:
    image: confluentinc/cp-kafka:7.7.0
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
      KAFKA_LOG_RETENTION_HOURS: 168
    volumes:
      - kafkadata:/var/lib/kafka/data
    ports:
      - "9092:9092"

  zookeeper:
    image: confluentinc/cp-zookeeper:7.7.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeperdata:/var/lib/zookeeper/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"  # Console

  keycloak:
    image: quay.io/keycloak/keycloak:25.0
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${DB_USER:-mindbridge}
      KC_DB_PASSWORD: ${DB_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8080:8080"

  # ===== 业务服务 =====
  api-gateway:
    image: ${REGISTRY}/mindbridge/api-gateway:${TAG:-latest}
    environment:
      <<: *common-env
    ports:
      - "8000:8000"
    depends_on:
      keycloak:
        condition: service_started

  user-service:
    image: ${REGISTRY}/mindbridge/user-service:${TAG:-latest}
    environment:
      <<: *common-env
      SERVICE_PORT: 9001
    expose:
      - "9001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  assessment-service:
    image: ${REGISTRY}/mindbridge/assessment-service:${TAG:-latest}
    environment:
      <<: *common-env
      SERVICE_PORT: 9002
      AI_INFERENCE_URL: http://ai-inference:8501
    expose:
      - "9002"
    depends_on:
      postgres:
        condition: service_healthy
      ai-inference:
        condition: service_healthy

  report-service:
    image: ${REGISTRY}/mindbridge/report-service:${TAG:-latest}
    environment:
      <<: *common-env
      SERVICE_PORT: 9003
    expose:
      - "9003"
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_started

  notification-service:
    image: ${REGISTRY}/mindbridge/notification-service:${TAG:-latest}
    environment:
      <<: *common-env
      SERVICE_PORT: 9004
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD}
    expose:
      - "9004"
    depends_on:
      rabbitmq:
        condition: service_started

  ai-inference:
    image: ${REGISTRY}/mindbridge/ai-inference:${TAG:-latest}
    environment:
      MODEL_PATH: /models
      MAX_BATCH_SIZE: 32
      INFERENCE_THREADS: 4
    volumes:
      - ./models:/models:ro
    expose:
      - "8501"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8501/health"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3

  web-frontend:
    image: ${REGISTRY}/mindbridge/web-frontend:${TAG:-latest}
    environment:
      NEXT_PUBLIC_API_URL: http://api-gateway:8000
      NEXT_PUBLIC_KEYCLOAK_URL: http://keycloak:8080
    ports:
      - "3000:3000"
    depends_on:
      - api-gateway

volumes:
  pgdata:
  redisdata:
  rabbitmqdata:
  kafkadata:
  zookeeperdata:
  miniodata:
```

---

## 4. Kubernetes集群部署方案

### 4.1 集群规划

```
┌─────────────────────────────────────────────────┐
│                  Kubernetes Cluster               │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Master-1│  │ Master-2│  │ Master-3│  ← 控制平面│
│  │ (etcd)  │  │ (etcd)  │  │ (etcd)  │          │
│  └─────────┘  └─────────┘  └─────────┘          │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │Worker-1 │  │Worker-2 │  │Worker-3 │  ← 通用节点│
│  │ (通用)   │  │ (通用)   │  │ (通用)   │          │
│  └─────────┘  └─────────┘  └─────────┘          │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────┐     │
│  │Worker-GPU-1      │  │Worker-GPU-2      │     │
│  │ (GPU: NVIDIA T4) │  │ (GPU: NVIDIA A10)│     │
│  └──────────────────┘  └──────────────────┘     │
│                                                   │
│  ┌─────────┐  ┌─────────┐                       │
│  │Infra-1  │  │Infra-2  │  ← 基础设施节点(可选)   │
│  │(DB/MQ)  │  │(DB/MQ)  │                        │
│  └─────────┘  └─────────┘                       │
└─────────────────────────────────────────────────┘
```

### 4.2 Namespace 规划

| Namespace | 用途 |
|-----------|------|
| `mindbridge-prod` | 生产业务服务 |
| `mindbridge-staging` | 预发布环境 |
| `infra` | 基础设施（数据库、中间件） |
| `monitoring` | 监控栈 |
| `ingress` | Ingress控制器与证书管理 |
| `ai-serving` | AI模型推理服务 |

### 4.3 Helm Chart 结构

```
charts/
├── mindbridge-platform/           # 主Chart
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values-prod.yaml
│   └── templates/
│       ├── _helpers.tpl
│       ├── namespace.yaml
│       ├── configmap.yaml
│       ├── secrets.yaml
│       ├── ingress.yaml
│       ├── services/
│       │   ├── user-service.yaml
│       │   ├── assessment-service.yaml
│       │   ├── report-service.yaml
│       │   └── notification-service.yaml
│       ├── deployments/
│       │   ├── user-service.yaml
│       │   ├── assessment-service.yaml
│       │   ├── report-service.yaml
│       │   └── notification-service.yaml
│       └── hpa/
│           └── user-service.yaml
├── mindbridge-frontend/           # 前端Chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       └── ingress.yaml
├── mindbridge-ai/                 # AI服务Chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment-cpu.yaml
│       ├── deployment-gpu.yaml
│       ├── service.yaml
│       └── hpa.yaml
└── mindbridge-infra/              # 基础设施Chart
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── postgresql/
        ├── redis/
        ├── rabbitmq/
        ├── kafka/
        └── minio/
```

### 4.4 部署命令

```bash
# 1. 添加Helm仓库（如使用外部Chart）
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add elastic https://helm.elastic.co
helm repo update

# 2. 部署基础设施
helm install mindbridge-infra ./charts/mindbridge-infra \
  --namespace infra \
  --values ./charts/mindbridge-infra/values-prod.yaml \
  --create-namespace

# 3. 部署AI服务
helm install mindbridge-ai ./charts/mindbridge-ai \
  --namespace ai-serving \
  --values ./charts/mindbridge-ai/values-prod.yaml \
  --create-namespace

# 4. 部署业务服务
helm install mindbridge-platform ./charts/mindbridge-platform \
  --namespace mindbridge-prod \
  --values ./charts/mindbridge-platform/values-prod.yaml \
  --create-namespace

# 5. 部署前端
helm install mindbridge-frontend ./charts/mindbridge-frontend \
  --namespace mindbridge-prod \
  --values ./charts/mindbridge-frontend/values-prod.yaml

# 6. 升级服务
helm upgrade mindbridge-platform ./charts/mindbridge-platform \
  --namespace mindbridge-prod \
  --values ./charts/mindbridge-platform/values-prod.yaml \
  --wait --timeout 300s

# 7. 回滚
helm rollback mindbridge-platform 1 --namespace mindbridge-prod
```

### 4.5 HPA配置示例

```yaml
# HPA — 基于CPU和自定义指标自动扩缩容
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: assessment-service-hpa
  namespace: mindbridge-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: assessment-service
  minReplicas: 3
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "500"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 3
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

---

## 5. 各云平台部署指南

### 5.1 AWS 部署

#### 5.1.1 架构组件映射

| 组件 | AWS服务 | 说明 |
|-----|---------|------|
| 负载均衡 | ALB (Application Load Balancer) | L7路由，WAF集成 |
| 容器编排 | EKS (Elastic Kubernetes Service) | 托管K8s |
| 数据库 | RDS for PostgreSQL | 托管PostgreSQL，多AZ |
| 缓存 | ElastiCache for Redis | 托管Redis集群 |
| 对象存储 | S3 | 替代MinIO（推荐） |
| 消息队列 | Amazon MQ (RabbitMQ) | 托管RabbitMQ（任务队列） |
| 事件流 | MSK (Managed Kafka) | 托管Kafka（事件流） |
| 容器镜像 | ECR (Elastic Container Registry) | 私有镜像仓库 |
| DNS | Route 53 | 域名解析 |
| CDN | CloudFront | 静态资源加速 |
| 证书 | ACM | 免费SSL证书管理 |
| 监控 | CloudWatch + Managed Prometheus | 指标与日志 |
| 密钥管理 | AWS Secrets Manager | 敏感凭据管理 |

#### 5.1.2 Terraform核心配置

```hcl
# main.tf — AWS MindBridge 基础设施

terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region  # 推荐 ap-northeast-1 或 ap-southeast-1
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "mindbridge-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = false
  enable_dns_hostnames = true
}

# EKS 集群
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "mindbridge-eks"
  cluster_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    general = {
      min_size     = 3
      max_size     = 8
      desired_size = 3
      instance_types = ["m6i.4xlarge"]  # 16C64G
      disk_size    = 100
    }
    gpu = {
      min_size     = 1
      max_size     = 3
      desired_size = 1
      instance_types = ["g5.xlarge"]  # T4 GPU
      disk_size    = 200
    }
  }

  enable_irsa = true
}

# RDS PostgreSQL
module "db" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "mindbridge-postgres"
  engine     = "postgres"
  engine_version = "16"
  family     = "postgres16"

  instance_class    = "db.r6g.4xlarge"  # 16C128G
  allocated_storage = 500
  storage_type      = "io1"
  iops              = 10000

  multi_az          = true
  publicly_accessible = false

  db_name  = "mindbridge"
  username = var.db_master_user

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = module.vpc.database_subnet_group_name
}
```

#### 5.1.3 部署步骤

```bash
# 1. 初始化Terraform
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars

# 2. 配置kubectl
aws eks update-kubeconfig --name mindbridge-eks --region ap-northeast-1

# 3. 部署NVIDIA GPU Operator（GPU节点）
helm install gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator --create-namespace

# 4. 部署应用（参照第4节Helm部署）

# 5. 配置Ingress（ALB）
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=mindbridge-eks \
  --set serviceAccount.create=true
```

---

### 5.2 阿里云部署

#### 5.2.1 架构组件映射

| 组件 | 阿里云服务 | 说明 |
|-----|----------|------|
| 负载均衡 | ALB (应用型负载均衡) | L7路由 |
| 容器编排 | ACK (容器服务Kubernetes版) | 托管K8s |
| 数据库 | RDS PostgreSQL | 多可用区高可用版 |
| 缓存 | Redis (云数据库Redis版) | 集群版 |
| 对象存储 | OSS | 替代MinIO |
| 消息队列 | RabbitMQ (云消息队列) | 托管RabbitMQ（任务队列） |
| 事件流 | Kafka (云消息队列Kafka版) | 托管Kafka（事件流） |
| 容器镜像 | ACR (容器镜像服务) | 企业版 |
| DNS | 云解析DNS | 域名解析 |
| CDN | 阿里云CDN | 静态资源加速 |
| 证书 | SSL证书服务 | 免费DV证书 |
| 安全 | WAF + 云防火墙 | Web防护 |
| 监控 | ARMS + SLS (日志服务) | 全栈可观测 |

#### 5.2.2 Terraform核心配置

```hcl
# main.tf — 阿里云 MindBridge 基础设施

terraform {
  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = "~> 1.230"
    }
  }
}

provider "alicloud" {
  region = "cn-shanghai"  # 推荐华东2
}

# VPC
resource "alicloud_vpc" "mindbridge" {
  vpc_name   = "mindbridge-vpc"
  cidr_block = "10.0.0.0/16"
}

resource "alicloud_vswitch" "private" {
  count      = 3
  vpc_id     = alicloud_vpc.mindbridge.id
  cidr_block = "10.0.${count.index + 1}.0/24"
  zone_id    = data.alicloud_zones.default.zones[count.index].id
}

# ACK 集群
resource "alicloud_cs_managed_kubernetes" "mindbridge" {
  name                   = "mindbridge-ack"
  worker_vswitch_ids     = alicloud_vswitch.private[*].id
  worker_instance_types  = ["ecs.g7.4xlarge"]  # 16C64G
  worker_number          = 3
  pod_cidr               = "172.20.0.0/16"
  service_cidr           = "172.21.0.0/20"
  new_nat_gateway        = true
  is_enterprise_security_group = true
}

# RDS PostgreSQL
resource "alicloud_db_instance" "mindbridge" {
  engine          = "PostgreSQL"
  engine_version  = "16.0"
  instance_type   = "pg.n2.2xlarge.2"  # 8C64G
  instance_storage = 500
  instance_charge_type = "Postpaid"
  monitoring_period    = 60

  vswitch_id  = alicloud_vswitch.private[0].id
  security_ips = ["10.0.0.0/8"]  # VPC内网

  # 高可用
  instance_type = "HighAvailability"
}

# Redis 集群
resource "alicloud_kvstore_instance" "mindbridge" {
  engine_version     = "7.2"
  instance_class     = "redis.cluster.sharding.large.default"
  shard_number       = 3
  instance_storage   = 16
  vswitch_id         = alicloud_vswitch.private[0].id
  security_ips       = ["10.0.0.0/8"]
}
```

#### 5.2.3 部署步骤

```bash
# 1. 配置阿里云CLI
aliyun configure --mode AK
export ALICLOUD_ACCESS_KEY=<your-access-key>
export ALICLOUD_SECRET_KEY=<your-secret-key>

# 2. 部署基础设施
terraform init
terraform apply -var-file=prod-cn-shanghai.tfvars

# 3. 配置kubectl
aliyun cs DescribeClusterUserKubeconfig --ClusterId <cluster-id> \
  | base64 -d > ~/.kube/config

# 4. 部署应用
helm install mindbridge-platform ./charts/mindbridge-platform \
  --namespace mindbridge-prod --create-namespace \
  --values values-alicloud-prod.yaml
```

---

### 5.3 腾讯云部署

#### 5.3.1 架构组件映射

| 组件 | 腾讯云服务 | 说明 |
|-----|----------|------|
| 负载均衡 | CLB (应用型负载均衡) | L7路由 |
| 容器编排 | TKE (腾讯云Kubernetes) | 托管K8s |
| 数据库 | TDSQL-C PostgreSQL | 云原生数据库 |
| 缓存 | Redis (云数据库) | 集群版 |
| 对象存储 | COS | 替代MinIO |
| 消息队列 | CMQ / TDMQ (RabbitMQ) | 消息队列（任务队列） |
| 事件流 | CKafka (云Kafka) | 托管Kafka（事件流） |
| 容器镜像 | TCR (容器镜像服务) | 企业版 |
| DNS | DNSPod | 域名解析 |
| CDN | 腾讯云CDN | 静态资源加速 |
| 安全 | WAF + 云防火墙 | Web防护 |
| 监控 | 云监控 + CLS (日志服务) | 可观测性 |

#### 5.3.2 Terraform核心配置

```hcl
# main.tf — 腾讯云 MindBridge 基础设施

terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.81"
    }
  }
}

provider "tencentcloud" {
  region = "ap-shanghai"
}

# VPC
resource "tencentcloud_vpc" "mindbridge" {
  name       = "mindbridge-vpc"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_subnet" "private" {
  count      = 3
  vpc_id     = tencentcloud_vpc.mindbridge.id
  name       = "private-subnet-${count.index}"
  cidr_block = "10.0.${count.index + 1}.0/24"
  zone       = data.tencentcloud_availability_zones.default.zones[count.index].name
}

# TKE 集群
resource "tencentcloud_kubernetes_cluster" "mindbridge" {
  cluster_name       = "mindbridge-tke"
  cluster_desc       = "MindBridge Production Cluster"
  cluster_max_pod_num = 256
  cluster_level      = "L5"  # 增强版

  vpc_id      = tencentcloud_vpc.mindbridge.id
  cluster_cidr = "172.16.0.0/16"

  # 节点池 — 通用
  worker_config {
    count              = 3
    instance_type      = "SA5.4XLARGE32"  # 16C64G
    system_disk_type   = "CLOUD_SSD"
    system_disk_size   = 100
    availability_zones = ["ap-shanghai-1", "ap-shanghai-2", "ap-shanghai-3"]
  }

  # 节点池 — GPU
  worker_config {
    count              = 1
    instance_type      = "GN7.2XLARGE32"  # T4 GPU
    system_disk_type   = "CLOUD_SSD"
    system_disk_size   = 200
  }
}

# PostgreSQL
resource "tencentcloud_postgresql_instance" "mindbridge" {
  name           = "mindbridge-pg"
  availability_zone = "ap-shanghai-1"
  version        = "16.0"
  spec_code      = "pg.std.s2.large"  # 8C64G
  storage        = 500
  project_id     = 0

  vpc_id  = tencentcloud_vpc.mindbridge.id
  subnet_id = tencentcloud_subnet.private[0].id
}
```

#### 5.3.3 部署步骤

```bash
# 1. 配置腾讯云CLI
export TENCENTCLOUD_SECRET_ID=<your-secret-id>
export TENCENTCLOUD_SECRET_KEY=<your-secret-key>
export TENCENTCLOUD_REGION=ap-shanghai

# 2. 部署基础设施
terraform init
terraform apply -var-file=prod-ap-shanghai.tfvars

# 3. 配置kubectl
tencentcloud tke describe-cluster-kubeconfig \
  --cluster-id <cluster-id> --output text > ~/.kube/config

# 4. 部署应用
helm install mindbridge-platform ./charts/mindbridge-platform \
  --namespace mindbridge-prod --create-namespace \
  --values values-tencentcloud-prod.yaml
```

---

## 6. 数据库部署与配置

### 6.1 PostgreSQL 主从部署

#### 6.1.1 架构

```
┌─────────────┐         ┌─────────────┐
│  主节点 (RW) │ ──流复制──→ │  从节点 (RO)  │
│  10.0.1.10  │          │  10.0.2.10  │
│  Port: 5432 │          │  Port: 5432 │
└──────┬──────┘          └──────┬──────┘
       │                        │
       └────────┬───────────────┘
                │
         ┌──────▼──────┐
         │   PgBouncer  │  ← 连接池
         │  Port: 6432  │
         └──────┬──────┘
                │
         ┌──────▼──────┐
         │  业务服务    │
         └─────────────┘
```

#### 6.1.2 主节点配置 (postgresql.conf)

```ini
# 连接配置
listen_addresses = '*'
port = 5432
max_connections = 500
superuser_reserved_connections = 3

# WAL配置（流复制）
wal_level = replica
max_wal_senders = 10
wal_keep_size = 10GB
hot_standby = on

# 性能调优
shared_buffers = 4GB              # 内存的25%
effective_cache_size = 12GB       # 内存的75%
maintenance_work_mem = 512MB
work_mem = 16MB
random_page_cost = 1.1            # SSD优化

# 日志
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'ddl'
log_min_duration_statement = 1000  # 慢查询阈值1s

# 安全
ssl = on
ssl_cert_file = '/etc/ssl/certs/postgres.crt'
ssl_key_file = '/etc/ssl/private/postgres.key'
password_encryption = scram-sha-256
```

#### 6.1.3 从节点配置 (postgresql.conf)

```ini
# 基础配置同主节点，额外添加：
primary_conninfo = 'host=10.0.1.10 port=5432 user=replicator password=<replication_password> sslmode=require'
primary_slot_name = 'standby_1'
restore_command = 'cp /archive/%f %p'  # 归档恢复
```

#### 6.1.4 数据库初始化脚本

```sql
-- init-db/01-extensions.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- TimescaleDB 扩展（用于时序数据）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- init-db/02-users.sql
CREATE ROLE mindbridge_app WITH LOGIN PASSWORD '<app_password>';
CREATE ROLE mindbridge_readonly WITH LOGIN PASSWORD '<readonly_password>';
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<replication_password>';

-- init-db/03-databases.sql
CREATE DATABASE mindbridge OWNER mindbridge_app;

-- 在主库连接后执行
\c mindbridge

-- 业务schema
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS analytics;

-- 权限
GRANT ALL ON DATABASE mindbridge TO mindbridge_app;
GRANT CONNECT ON DATABASE mindbridge TO mindbridge_readonly;
GRANT USAGE ON SCHEMA public TO mindbridge_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mindbridge_readonly;
```

#### 6.1.5 PgBouncer 配置

```ini
; pgbouncer.ini
[databases]
mindbridge = host=10.0.1.10 port=5432 dbname=mindbridge pool_mode=transaction
mindbridge_ro = host=10.0.2.10 port=5432 dbname=mindbridge pool_mode=transaction

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
max_client_conn = 2000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 300
server_lifetime = 3600
log_connections = 1
log_disconnections = 1
stats_users = monitor
```

### 6.2 Redis 集群部署

#### 6.2.1 集群拓扑（3主3从）

```
Master-1 (10.0.1.20:6379) ←→ Slave-1 (10.0.2.20:6379)
Master-2 (10.0.1.21:6379) ←→ Slave-2 (10.0.2.21:6379)
Master-3 (10.0.1.22:6379) ←→ Slave-3 (10.0.2.22:6379)
```

#### 6.2.2 redis.conf 核心配置

```ini
# 网络
bind 0.0.0.0
port 6379
protected-mode yes
tcp-backlog 511
timeout 300

# 内存
maxmemory 4gb
maxmemory-policy allkeys-lru
maxmemory-samples 10

# 持久化
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 集群
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
cluster-announce-port 6379
cluster-announce-bus-port 16379

# 安全
requirepass <redis_password>
masterauth <redis_password>

# 日志
loglevel notice
logfile "/var/log/redis/redis-server.log"
```

### 6.3 MinIO/S3 对象存储

#### 6.3.1 MinIO 纠删码部署（4节点）

```bash
#!/bin/bash
# 每个节点执行
export MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
export MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}

# 启动MinIO（4节点集群）
minio server http://minio{1...4}.internal/data{1...4} \
  --address ":9000" \
  --console-address ":9001"
```

#### 6.3.2 Bucket策略

```bash
# 创建业务Bucket
mc alias set myminio http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
mc mb myminio/mindbridge-assessments
mc mb myminio/mindbridge-models
mc mb myminio/mindbridge-exports

# 设置策略
mc anonymous set download myminio/mindbridge-exports
mc admin policy set myminio readwrite user=mindbridge-app
```

---

## 7. 中间件部署

### 7.0 双MQ架构说明

MindBridge采用双消息队列架构，根据不同场景选择最优的中间件：

```
┌─────────────────────────────────────────────────────────────┐
│                    双MQ架构总览                                │
│                                                               │
│  ┌──────────────────────┐    ┌──────────────────────┐       │
│  │     Kafka（事件流）    │    │   RabbitMQ（任务队列）  │       │
│  │                      │    │                      │       │
│  │  • 评估完成事件       │    │  • 报告生成任务        │       │
│  │  • 用户行为事件       │    │  • 邮件/短信发送任务    │       │
│  │  • AAC交互事件        │    │  • 数据导出任务        │       │
│  │  • AI推理结果事件     │    │  • 定时提醒任务        │       │
│  │  • 审计日志事件       │    │  • 批量数据处理        │       │
│  │                      │    │                      │       │
│  │  特点：               │    │  特点：               │       │
│  │  ✓ 高吞吐量           │    │  ✓ 精确路由           │       │
│  │  ✓ 持久化存储         │    │  ✓ 任务确认机制        │       │
│  │  ✓ 事件回放           │    │  ✓ 死信队列           │       │
│  │  ✓ 分区有序           │    │  ✓ 延迟队列           │       │
│  └──────────────────────┘    └──────────────────────┘       │
│                                                               │
│  Topic设计（Kafka）：              Queue设计（RabbitMQ）：      │
│  ┌─────────────────────┐         ┌─────────────────────┐    │
│  │ assessment.events   │         │ report.generation    │    │
│  │ user.behavior       │         │ notification.email   │    │
│  │ aac.interaction     │         │ notification.sms     │    │
│  │ inference.result    │         │ data.export          │    │
│  │ audit.log           │         │ schedule.reminder    │    │
│  └─────────────────────┘         └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**选型原则：**

| 维度 | Kafka（事件流） | RabbitMQ（任务队列） |
|-----|----------------|---------------------|
| 数据模型 | 事件（不可变事实） | 任务（可执行指令） |
| 消费模式 | 发布/订阅，多消费者 | 竞争消费，单消费者处理 |
| 可靠性 | 至少一次交付 + 幂等消费 | 确认机制 + 死信重试 |
| 吞吐量 | 10万+ TPS | 1万+ TPS |
| 消息保留 | 基于时间/容量保留 | 消费确认后删除 |
| 典型场景 | 事件溯源、流处理、审计 | 任务调度、通知推送、批处理 |

### 7.1 RabbitMQ 集群部署

#### 7.1.1 集群配置

```bash
# 启用插件
rabbitmq-plugins enable rabbitmq_management
rabbitmq-plugins enable rabbitmq_peer_discovery_k8s  # K8s环境

# 节点配置 (rabbitmq.conf)
cluster_formation.peer_discovery_backend = rabbit_peer_discovery_dns
cluster_formation.dns.hostname = rabbitmq-headless.infra.svc.cluster.local
cluster_formation.node_cleanup.only_log_warning = true

# 内存阈值
vm_memory_high_watermark.relative = 0.6

# 磁盘空间阈值
disk_free_limit.absolute = 2GB
```

#### 7.1.2 虚拟主机与队列配置

```bash
# 创建虚拟主机
rabbitmqctl add_vhost mindbridge

# 创建用户
rabbitmqctl add_user mindbridge <password>
rabbitmqctl set_permissions -p mindbridge mindbridge ".*" ".*" ".*"

# 声明死信队列
rabbitmqadmin declare queue name=assessments.deadletter durable=true \
  arguments='{"x-dead-letter-exchange":"assessments.dlx"}'
```

### 7.2 Kafka 集群部署

#### 7.2.1 集群配置

```bash
# Kafka集群 — 3 Broker节点
# server.properties (Broker-1)
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9092
advertised.listeners=PLAINTEXT://kafka-1.internal:9092
zookeeper.connect=zookeeper-1:2181,zookeeper-2:2181,zookeeper-3:2181

# 日志与存储
log.dirs=/data/kafka/logs
num.partitions=6
default.replication.factor=3
min.insync.replicas=2

# 保留策略
log.retention.hours=168
log.retention.bytes=107374182400
log.segment.bytes=1073741824

# 性能调优
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
message.max.bytes=10485760

# 安全配置
security.inter.broker.protocol=SASL_PLAINTEXT
sasl.mechanism.inter.broker.protocol=PLAIN
sasl.enabled.mechanisms=PLAIN
```

#### 7.2.2 Topic管理

```bash
# 创建业务Topic
kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic assessment.events --partitions 6 --replication-factor 3 \
  --config retention.ms=604800000 --config cleanup.policy=delete

kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic user.behavior --partitions 6 --replication-factor 3

kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic aac.interaction --partitions 3 --replication-factor 3

kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic inference.result --partitions 6 --replication-factor 3

kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic audit.log --partitions 12 --replication-factor 3 \
  --config retention.ms=2592000000

# 查看Topic列表
kafka-topics.sh --bootstrap-server kafka-1:9092 --list

# 查看Topic详情
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe \
  --topic assessment.events

# 消费者组滞后检查
kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \
  --describe --all-groups
```

### 7.3 Nginx 反向代理

#### 7.3.1 Nginx 配置

```nginx
# /etc/nginx/conf.d/mindbridge.conf

upstream web_backend {
    least_conn;
    server 10.0.1.30:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.31:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.32:3000 max_fails=3 fail_timeout=30s;
}

upstream api_backend {
    least_conn;
    server 10.0.1.40:8000 max_fails=3 fail_timeout=30s;
    server 10.0.1.41:8000 max_fails=3 fail_timeout=30s;
    server 10.0.1.42:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name app.mindbridge.com api.mindbridge.com;
    return 301 https://$host$request_uri;
}

# Web前端
server {
    listen 443 ssl http2;
    server_name app.mindbridge.com;

    ssl_certificate /etc/nginx/ssl/mindbridge.crt;
    ssl_certificate_key /etc/nginx/ssl/mindbridge.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # 安全头
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # 反向代理
    location / {
        proxy_pass http://web_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # WebSocket支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        proxy_pass http://web_backend;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# API网关
server {
    listen 443 ssl http2;
    server_name api.mindbridge.com;

    ssl_certificate /etc/nginx/ssl/mindbridge.crt;
    ssl_certificate_key /etc/nginx/ssl/mindbridge.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 速率限制
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

    location / {
        limit_req zone=api_limit burst=50 nodelay;

        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时配置
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # AI推理服务需要更长超时
        location /api/v1/assessments/analyze {
            proxy_read_timeout 120s;
        }
    }

    # 健康检查端点（不限制速率）
    location /health {
        proxy_pass http://api_backend;
    }
}
```

### 7.4 Certbot SSL证书自动续期

```bash
# 安装certbot
apt install certbot python3-certbot-nginx -y

# 获取证书（Nginx模式）
certbot --nginx -d app.mindbridge.com -d api.mindbridge.com

# 配置自动续期（已自动创建systemd timer）
# 验证续期
certbot renew --dry-run

# 证书更新后重载Nginx（certbot默认自动处理）
# 手动方式（如使用其他方式获取证书）：
# certbot renew --deploy-hook "nginx -s reload"
```

---

## 8. AI/ML服务部署

### 8.1 GPU需求

| 场景 | GPU型号 | 显存 | 实例数 | 说明 |
|-----|--------|------|-------|------|
| 训练环境 | NVIDIA A10G | 24GB | 1-2 | 模型训练与微调 |
| 推理（文本/语音） | NVIDIA T4 | 16GB | 1-2 | 日常推理服务 |
| 推理（轻量/备用） | CPU | — | 2-3 | 降级模式/轻量模型 |

### 8.2 模型服务化（vLLM部署）

```dockerfile
# Dockerfile.ai-inference
FROM nvcr.io/nvidia/pytorch:24.12-py3

# 安装vLLM
RUN pip install --no-cache-dir vllm==0.6.6

# 复制模型
COPY ./models /models

# 复制服务代码
COPY ./inference-server /app
WORKDIR /app

EXPOSE 8501

# 启动命令
ENTRYPOINT ["python", "-m", "uvicorn", "main:app", \
    "--host", "0.0.0.0", "--port", "8501"]
```

```python
# inference-server/main.py — 模型推理服务
from vllm import LLM, SamplingParams
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch

app = FastAPI(title="MindBridge AI Inference Service")

# 模型配置
MODEL_PATH = "/models/emotion-classifier-v1"
BEHAVIOR_MODEL_PATH = "/models/behavior-analyzer-v1"

llm = LLM(
    model=MODEL_PATH,
    tensor_parallel_size=torch.cuda.device_count(),
    max_model_len=4096,
    gpu_memory_utilization=0.85,
    enforce_eager=False,
)

class InferenceRequest(BaseModel):
    text: str
    task: str  # "emotion" | "behavior" | "intent"
    user_id: str

class InferenceResponse(BaseModel):
    result: dict
    confidence: float
    latency_ms: float
    model_version: str

@app.post("/v1/inference")
async def infer(request: InferenceRequest) -> InferenceResponse:
    import time
    start = time.time()

    try:
        sampling_params = SamplingParams(
            temperature=0.1,
            max_tokens=256,
            top_p=0.9,
        )

        prompt = f"任务: {request.task}\n输入: {request.text}\n输出:"
        outputs = llm.generate([prompt], sampling_params)

        latency = (time.time() - start) * 1000

        return InferenceResponse(
            result={"output": outputs[0].outputs[0].text},
            confidence=0.92,
            latency_ms=latency,
            model_version="v1.0",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "gpu_available": torch.cuda.is_available()}

@app.get("/metrics")
async def metrics():
    """Prometheus指标"""
    return {"gpu_memory_used": torch.cuda.memory_allocated(),
            "gpu_memory_total": torch.cuda.get_device_properties(0).total_memory}
```

### 8.3 K8s GPU调度配置

```yaml
# GPU节点的Taint和Toleration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-inference-gpu
  namespace: ai-serving
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-inference-gpu
  template:
    metadata:
      labels:
        app: ai-inference-gpu
    spec:
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
      containers:
        - name: ai-inference
          image: registry.mindbridge.com/mindbridge/ai-inference:v1.2.0-gpu
          resources:
            limits:
              nvidia.com/gpu: 1
              memory: "16Gi"
              cpu: "8"
            requests:
              nvidia.com/gpu: 1
              memory: "16Gi"
              cpu: "4"
          ports:
            - containerPort: 8501
          env:
            - name: MODEL_PATH
              value: "/models"
            - name: VLLM_TENSOR_PARALLEL_SIZE
              value: "1"
          volumeMounts:
            - name: model-storage
              mountPath: /models
              readOnly: true
      volumes:
        - name: model-storage
          persistentVolumeClaim:
            claimName: model-pvc
      nodeSelector:
        accelerator: nvidia-tesla-t4
```

### 8.4 模型推理加速策略

| 策略 | 方法 | 预期效果 |
|-----|------|---------|
| 量化 | INT8/FP8量化 | 显存↓50%，推理↑2x |
| 批处理 | 动态批处理（vLLM PagedAttention） | 吞吐↑3-5x |
| 模型蒸馏 | 大模型→小模型蒸馏 | 显存↓70%，精度损失<2% |
| Tensor Parallel | 多GPU并行推理 | 大模型拆分推理 |
| 缓存 | 高频结果Redis缓存 | 重复查询零延迟 |

---

## 9. 网络与安全配置

### 9.1 VPC网络规划

```
VPC: 10.0.0.0/16
├── Public Subnet:    10.0.100.0/24  (ALB, NAT Gateway, Bastion)
├── Private Subnet-A: 10.0.1.0/24    (业务服务-可用区A)
├── Private Subnet-B: 10.0.2.0/24    (业务服务-可用区B)
├── Private Subnet-C: 10.0.3.0/24    (业务服务-可用区C)
├── Data Subnet-A:    10.0.10.0/24   (数据库/中间件-A)
├── Data Subnet-B:    10.0.11.0/24   (数据库/中间件-B)
└── GPU Subnet:       10.0.20.0/24   (GPU推理节点)
```

### 9.2 安全组/防火墙规则

| 规则 | 方向 | 协议 | 端口 | 源/目标 | 说明 |
|-----|------|------|------|---------|------|
| SG-Public-In | Inbound | TCP | 443 | 0.0.0.0/0 | HTTPS入站 |
| SG-Public-In | Inbound | TCP | 80 | 0.0.0.0/0 | HTTP（重定向） |
| SG-App | Inbound | TCP | 3000,8000,9001-9004 | SG-Public | 应用端口 |
| SG-App | Inbound | TCP | 8501-8502 | SG-App | AI推理内部 |
| SG-Data | Inbound | TCP | 5432 | SG-App | PostgreSQL |
| SG-Data | Inbound | TCP | 6379 | SG-App | Redis |
| SG-Data | Inbound | TCP | 5672,15672 | SG-App | RabbitMQ |
| SG-Data | Inbound | TCP | 9092 | SG-App | Kafka |
| SG-Data | Inbound | TCP | 2181 | SG-Data | Zookeeper |
| SG-Data | Inbound | TCP | 9000,9001 | SG-App | MinIO |
| SG-Internal | Inbound | TCP | 6443 | SG-App | K8s API |
| SG-Internal | Inbound | TCP | 10250 | SG-App | Kubelet |
| SG-Internal | Inbound | TCP | 2379-2380 | SG-Internal | etcd |
| SSH | Inbound | TCP | 22 | 管理员IP | 堡垒机SSH |

### 9.3 WAF配置

```yaml
# WAF规则集（参考OWASP CRS）
waf_rules:
  - name: "SQL注入防护"
    action: block
    severity: critical

  - name: "XSS防护"
    action: block
    severity: critical

  - name: "路径遍历防护"
    action: block
    severity: high

  - name: "文件包含防护"
    action: block
    severity: high

  - name: "API速率限制"
    action: throttle
    threshold: "100 requests/min per IP"

  - name: "Bot防护"
    action: challenge
    # 允许已知搜索引擎

  - name: "地理位置限制（可选）"
    action: block
    countries: []  # 按业务需要配置

  # 特殊规则：心理评估API需要宽松一些
  custom_rules:
    - name: "评估API正文大小限制"
      path: "/api/v1/assessments/*"
      max_body_size: "10MB"  # 评估数据可能较大
```

### 9.4 端到端加密

| 层级 | 加密方式 |
|-----|---------|
| 传输层 | TLS 1.2/1.3（全链路） |
| 数据库 | TDE（透明数据加密） |
| 对象存储 | SSE-KMS（服务端加密） |
| 敏感字段 | AES-256-GCM应用层加密 |
| 密钥管理 | HashiCorp Vault / 云KMS |
| 密钥轮换 | 自动90天轮换 |

---

## 10. 备份与灾备方案

### 10.1 备份策略

| 数据类型 | 备份方式 | 频率 | 保留期 | RPO | RTO |
|---------|---------|------|-------|-----|-----|
| PostgreSQL | pg_dump + WAL归档 | 全量：每日 / 增量：每5分钟 | 30天在线 + 1年离线 | 5分钟 | 1小时 |
| Redis | RDB快照 + AOF | 每日全量 | 7天 | 1小时 | 30分钟 |
| MinIO对象存储 | 跨地域复制 | 实时 | 永久 | 实时 | 30分钟 |
| 配置文件 | Git版本控制 | 每次变更 | 永久 | — | — |
| K8s资源 | Velero备份 | 每日 | 30天 | 24小时 | 2小时 |

### 10.2 PostgreSQL备份脚本

```bash
#!/bin/bash
# backup-postgres.sh
set -euo pipefail

BACKUP_DIR="/backup/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="mindbridge"
DB_USER="backup_admin"
RETENTION_DAYS=30

# 全量备份
pg_dump -h localhost -U "$DB_USER" -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose \
  --no-owner \
  --no-privileges \
  -f "$BACKUP_DIR/full_${DB_NAME}_${TIMESTAMP}.dump"

# 上传到对象存储
mc cp "$BACKUP_DIR/full_${DB_NAME}_${TIMESTAMP}.dump" \
  myminio/mindbridge-backups/postgres/

# 清理过期备份
find "$BACKUP_DIR" -name "full_${DB_NAME}_*.dump" -mtime +${RETENTION_DAYS} -delete
mc find myminio/mindbridge-backups/postgres/ \
  --name "full_${DB_NAME}_*.dump" --older-than ${RETENTION_DAYS}d \
  --exec "mc rm {}"

echo "Backup completed: full_${DB_NAME}_${TIMESTAMP}.dump"
```

### 10.3 K8s Velero备份

```bash
# 安装Velero
velero install \
  --provider aws \
  --bucket mindbridge-velero-backups \
  --backup-location-config region=ap-northeast-1,s3ForcePathStyle=true \
  --secret-file ./credentials-velero \
  --use-volume-snapshots=true \
  --use-restic

# 每日定时备份
velero schedule create mindbridge-daily \
  --schedule="0 2 * * *" \
  --include-namespaces mindbridge-prod,ai-serving \
  --ttl 720h

# 手动备份
velero backup create mindbridge-pre-upgrade-$(date +%Y%m%d) \
  --include-namespaces mindbridge-prod

# 恢复
velero restore create --from-backup mindbridge-pre-upgrade-20260507
```

### 10.4 灾备架构

```
主区域 (Region-A)                    灾备区域 (Region-B)
┌─────────────────────┐              ┌─────────────────────┐
│  生产K8s集群         │───异步复制──→ │  灾备K8s集群         │
│  PostgreSQL主库      │───流复制──→   │  PostgreSQL备库      │
│  Redis集群           │───RedisSync   │  Redis只读副本       │
│  MinIO跨区复制       │              │  MinIO只读副本       │
│                     │              │                     │
│  活跃中 ←──────────→│              │  热备待命             │
└─────────────────────┘              └─────────────────────┘

故障切换流程：
1. 检测到主区域故障（健康检查连续3次失败）
2. DNS切换（Route53加权路由/云DNS切换）
3. PostgreSQL备库提升为主库
4. K8s灾备集群激活业务服务
5. 通知团队 & 验证数据一致性
```

---

## 11. 监控与告警配置

### 11.1 监控架构

```
┌───────────────────────────────────────────────┐
│                 Grafana Dashboard              │
│         (指标可视化 + 告警面板)                   │
└───────────┬───────────────────┬───────────────┘
            │                   │
    ┌───────▼───────┐   ┌───────▼───────┐
    │   Prometheus   │   │     ELK       │
    │  (指标采集)     │   │  (日志分析)    │
    └───┬───────┬───┘   └───┬───────┬───┘
        │       │           │       │
   ┌────▼──┐ ┌──▼────┐ ┌───▼───┐ ┌▼─────┐
   │Node   │ │cAdvisor│ │Fluent │ │Filebeat│
   │Exporter│ │       │ │  Bit  │ │      │
   └───────┘ └───────┘ └───────┘ └──────┘
```

### 11.2 Prometheus配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # Kubernetes基础设施
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__

  # 业务服务
  - job_name: 'mindbridge-services'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: [mindbridge-prod, ai-serving]
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'go_.*'
        action: drop

  # AI推理服务
  - job_name: 'ai-inference'
    static_configs:
      - targets: ['ai-inference-gpu.ai-serving.svc:8501']
    metrics_path: '/metrics'

  # 数据库
  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter.infra.svc:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter.infra.svc:9121']

  # 基础设施
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter.monitoring.svc:9100']
```

### 11.3 告警规则

```yaml
# rules/alerts.yml
groups:
  - name: mindbridge-critical
    rules:
      - alert: ServiceDown
        expr: up{job="mindbridge-services"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.pod }} 已宕机"
          description: "服务 {{ $labels.job }}/{{ $labels.pod }} 不可用已超过2分钟"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "高错误率: {{ $labels.service }}"
          description: "5分钟错误率超过5% (当前: {{ $value | humanizePercentage }})"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "高延迟: {{ $labels.service }}"
          description: "P95延迟超过500ms (当前: {{ $value }}s)"

  - name: mindbridge-infrastructure
    rules:
      - alert: HighCPU
        expr: rate(node_cpu_seconds_total{mode="idle"}[5m]) < 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU使用率过高: {{ $labels.instance }}"

      - alert: HighMemory
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "内存使用率过高: {{ $labels.instance }}"

      - alert: DiskSpaceLow
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "磁盘空间不足: {{ $labels.instance }}"

      - alert: PostgreSQLReplicationLag
        expr: pg_replication_lag > 30
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL复制延迟过高"
          description: "当前延迟: {{ $value }}s"

  - name: mindbridge-ai
    rules:
      - alert: GPUOutOfMemory
        expr: DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_FREE > 0.95
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "GPU显存不足: {{ $labels.gpu }}"

      - alert: InferenceLatencyHigh
        expr: rate(ai_inference_duration_seconds_sum[5m]) / rate(ai_inference_duration_seconds_count[5m]) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI推理延迟过高"
          description: "平均推理延迟: {{ $value }}s"
```

### 11.4 告警通知渠道

```yaml
# Alertmanager配置
route:
  receiver: 'default'
  group_by: ['alertname', 'namespace']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    - match:
        severity: warning
      receiver: 'feishu-webhook'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://alertmanager-webhook:5001/alerts'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<pagerduty-integration-key>'

  - name: 'feishu-webhook'
    webhook_configs:
      - url: '<feishu-bot-webhook-url>'
        send_resolved: true
```

### 11.5 ELK日志配置

```yaml
# Fluent Bit配置 (fluent-bit.conf)
[SERVICE]
    Flush        1
    Log_Level    info
    Parsers_File parsers.conf

[INPUT]
    Name         tail
    Path         /var/log/containers/*.log
    Parser       docker
    Tag          kube.*
    Refresh_Interval 5
    Mem_Buf_Limit 5MB

[FILTER]
    Name         kubernetes
    Match        kube.*
    Kube_URL     https://kubernetes.default.svc:443
    Merge_Log    On
    K8S-Logging.Parser On

[OUTPUT]
    Name         es
    Match        *
    Host         elasticsearch-master.infra.svc
    Port         9200
    Logstash_Format On
    Logstash_Prefix mindbridge
    Replace_Dots On
    Retry_Limit  5
```

### 11.6 Grafana Dashboard

推荐导入以下Dashboard：
- **K8s集群总览:** ID 15661
- **Pod资源监控:** ID 13532
- **PostgreSQL监控:** ID 9628
- **Redis监控:** ID 763
- **RabbitMQ监控:** ID 10991
- **Kafka监控:** ID 7589
- **业务自定义Dashboard:** 自定义开发

### 11.7 业务指标监控

#### 11.7.1 核心业务指标定义

| 指标名称 | 指标标识 | 类型 | 说明 | 采集频率 | 告警阈值 |
|---------|---------|------|------|---------|---------|
| 日活跃用户 | `mindbridge_dau` | Gauge | 当日登录独立用户数 | 每小时 | 日环比下降>20% |
| 月活跃用户 | `mindbridge_mau` | Gauge | 当月登录独立用户数 | 每日 | 月环比下降>15% |
| 评估完成率 | `mindbridge_assessment_completion_rate` | Gauge | 已完成评估数/已开始评估数 | 每5分钟 | <70% |
| AAC使用频次 | `mindbridge_aac_interaction_total` | Counter | AAC辅助沟通交互次数 | 实时 | 无交互>2h |
| 报告生成数 | `mindbridge_report_generated_total` | Counter | 生成的评估报告总数 | 实时 | 生成失败率>5% |
| 协作活跃度 | `mindbridge_collaboration_active_sessions` | Gauge | 当前活跃协作会话数 | 每5分钟 | 活跃会话=0>1h |
| 评估创建数 | `mindbridge_assessment_created_total` | Counter | 新建评估总数 | 实时 | — |
| 用户注册数 | `mindbridge_user_registered_total` | Counter | 新注册用户数 | 实时 | — |
| AI推理调用数 | `mindbridge_ai_inference_total` | Counter | AI推理服务调用次数 | 实时 | — |
| AI推理成功率 | `mindbridge_ai_inference_success_rate` | Gauge | 成功推理/总推理次数 | 每5分钟 | <95% |

#### 11.7.2 业务指标采集方案

**自定义Prometheus指标（Go服务示例）：**

```go
// metrics/metrics.go — 业务指标定义
package metrics

import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    AssessmentCreated = promauto.NewCounterVec(prometheus.CounterOpts{
        Name: "mindbridge_assessment_created_total",
        Help: "Total number of assessments created",
    }, []string{"type", "status"})

    AssessmentCompletionRate = promauto.NewGaugeVec(prometheus.GaugeOpts{
        Name: "mindbridge_assessment_completion_rate",
        Help: "Assessment completion rate",
    }, []string{"type"})

    ReportGenerated = promauto.NewCounterVec(prometheus.CounterOpts{
        Name: "mindbridge_report_generated_total",
        Help: "Total number of reports generated",
    }, []string{"format", "status"})

    AACInteraction = promauto.NewCounterVec(prometheus.CounterOpts{
        Name: "mindbridge_aac_interaction_total",
        Help: "Total AAC interaction count",
    }, []string{"symbol_set", "input_method"})

    CollaborationSessions = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "mindbridge_collaboration_active_sessions",
        Help: "Current active collaboration sessions",
    })

    DailyActiveUsers = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "mindbridge_dau",
        Help: "Daily active users",
    })

    MonthlyActiveUsers = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "mindbridge_mau",
        Help: "Monthly active users",
    })

    AIInferenceTotal = promauto.NewCounterVec(prometheus.CounterOpts{
        Name: "mindbridge_ai_inference_total",
        Help: "Total AI inference requests",
    }, []string{"model", "task", "status"})

    AIInferenceDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
        Name:    "mindbridge_ai_inference_duration_seconds",
        Help:    "AI inference duration in seconds",
        Buckets: prometheus.DefBuckets,
    }, []string{"model", "task"})
)
```

**业务事件埋点方案：**

```yaml
# 事件埋点配置 — 通过Kafka事件流采集
event_tracking:
  # 评估相关事件
  assessment:
    - event: "assessment.created"
      topic: "assessment.events"
      fields: ["assessment_id", "user_id", "type", "timestamp"]
    - event: "assessment.completed"
      topic: "assessment.events"
      fields: ["assessment_id", "user_id", "type", "duration_seconds", "score"]
    - event: "assessment.abandoned"
      topic: "assessment.events"
      fields: ["assessment_id", "user_id", "type", "progress_percent"]

  # AAC交互事件
  aac:
    - event: "aac.symbol_selected"
      topic: "aac.interaction"
      fields: ["user_id", "symbol_set", "symbol_id", "input_method"]
    - event: "aac.phrase_composed"
      topic: "aac.interaction"
      fields: ["user_id", "phrase_length", "composition_time_ms"]
    - event: "aac.voice_output"
      topic: "aac.interaction"
      fields: ["user_id", "text_length", "voice_type"]

  # 报告生成事件
  report:
    - event: "report.requested"
      topic: "assessment.events"
      fields: ["report_id", "assessment_id", "format", "user_id"]
    - event: "report.generated"
      topic: "assessment.events"
      fields: ["report_id", "format", "generation_time_ms", "page_count"]
    - event: "report.failed"
      topic: "assessment.events"
      fields: ["report_id", "format", "error_code"]

  # 协作事件
  collaboration:
    - event: "collaboration.session_started"
      topic: "user.behavior"
      fields: ["session_id", "assessment_id", "participants"]
    - event: "collaboration.session_ended"
      topic: "user.behavior"
      fields: ["session_id", "duration_seconds", "actions_count"]
```

**Prometheus业务告警规则：**

```yaml
# rules/business-alerts.yml
groups:
  - name: mindbridge-business
    rules:
      - alert: AssessmentCompletionRateLow
        expr: mindbridge_assessment_completion_rate < 0.7
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "评估完成率偏低"
          description: "当前评估完成率: {{ $value | humanizePercentage }}，低于70%阈值"

      - alert: DAUDropSignificant
        expr: |
          (mindbridge_dau - mindbridge_dau offset 1d) / mindbridge_dau offset 1d < -0.2
        for: 2h
        labels:
          severity: warning
        annotations:
          summary: "日活跃用户数大幅下降"
          description: "DAU日环比下降超过20%"

      - alert: ReportGenerationFailureRate
        expr: |
          rate(mindbridge_report_generated_total{status="failed"}[30m])
          / rate(mindbridge_report_generated_total[30m]) > 0.05
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "报告生成失败率过高"
          description: "报告生成失败率: {{ $value | humanizePercentage }}"

      - alert: AACNoInteraction
        expr: |
          increase(mindbridge_aac_interaction_total[2h]) == 0
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "AAC无交互超过2小时"
          description: "过去2小时内无AAC交互记录"

      - alert: CollaborationNoActiveSessions
        expr: mindbridge_collaboration_active_sessions == 0
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "无活跃协作会话"
          description: "过去1小时内无活跃协作会话"

      - alert: AIInferenceSuccessRateLow
        expr: |
          rate(mindbridge_ai_inference_total{status="success"}[10m])
          / rate(mindbridge_ai_inference_total[10m]) < 0.95
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "AI推理成功率低于95%"
          description: "当前成功率: {{ $value | humanizePercentage }}"
```

#### 11.7.3 业务Dashboard布局建议

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MindBridge 业务监控Dashboard                       │
├─────────────────────────────┬───────────────────────────────────────┤
│                             │                                       │
│   ┌─────────────────────┐  │  ┌─────────────────────┐             │
│   │  DAU / MAU 趋势      │  │  │  评估完成率趋势      │             │
│   │  (折线图)            │  │  │  (折线图 + 阈值线)   │             │
│   │                     │  │  │                     │             │
│   └─────────────────────┘  │  └─────────────────────┘             │
│                             │                                       │
│   ┌─────────────────────┐  │  ┌─────────────────────┐             │
│   │  评估创建/完成数      │  │  │  报告生成统计        │             │
│   │  (堆叠面积图)        │  │  │  (按格式/状态柱状图)  │             │
│   │                     │  │  │                     │             │
│   └─────────────────────┘  │  └─────────────────────┘             │
│                             │                                       │
├─────────────────────────────┴───────────────────────────────────────┤
│                                                                       │
│   ┌─────────────────────┐  ┌─────────────────────┐                 │
│   │  AAC交互热力图       │  │  协作活跃度          │                 │
│   │  (按时段/符号集)     │  │  (实时会话数+历史)    │                 │
│   └─────────────────────┘  └─────────────────────┘                 │
│                                                                       │
│   ┌─────────────────────┐  ┌─────────────────────┐                 │
│   │  AI推理调用统计      │  │  用户注册趋势        │                 │
│   │  (按任务类型饼图)    │  │  (日/周注册数)       │                 │
│   └─────────────────────┘  └─────────────────────┘                 │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│  关键指标卡片:                                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │  DAU   │ │  MAU   │ │ 评估完成│ │ 报告生成│ │ AI成功率│           │
│  │ 1,234  │ │ 15,678 │ │  82%   │ │  456   │ │  98.5% │           │
│  │ ↑12%   │ │ ↑5%    │ │ ↑3%    │ │ ↑8%    │ │ ↑0.2%  │           │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘           │
└───────────────────────────────────────────────────────────────────────┘
```

**Dashboard面板配置建议：**

| 面板 | 图表类型 | 数据源 | 刷新间隔 | 说明 |
|-----|---------|-------|---------|------|
| DAU/MAU趋势 | 折线图 | Prometheus | 5分钟 | 近30天趋势，含日环比 |
| 评估完成率 | 折线图+阈值线 | Prometheus | 5分钟 | 70%阈值线标注 |
| 评估创建/完成数 | 堆叠面积图 | Prometheus | 5分钟 | 按评估类型分类 |
| 报告生成统计 | 柱状图 | Prometheus | 5分钟 | 按格式(PDF/Word)和状态分组 |
| AAC交互热力图 | 热力图 | Prometheus | 1分钟 | X轴:时段 Y轴:符号集 |
| 协作活跃度 | 实时折线图 | Prometheus | 30秒 | 当前会话数+24h趋势 |
| AI推理统计 | 饼图+折线图 | Prometheus | 5分钟 | 任务类型分布+延迟趋势 |
| 用户注册趋势 | 柱状图 | Prometheus | 1小时 | 日注册+周注册对比 |
| 关键指标卡片 | Stat面板 | Prometheus | 1分钟 | 核心KPI+环比变化 |

---

## 12. 蓝绿/金丝雀发布流程

### 12.1 蓝绿发布 (Blue-Green)

```
当前生产(Blue: v1.2.0)          新版本(Green: v1.3.0)
┌─────────────────┐            ┌─────────────────┐
│  web-blue:3 pods │            │  web-green:3 pods │
│  api-blue:3 pods │            │  api-green:3 pods │
└────────┬────────┘            └────────┬────────┘
         │                              │
    ┌────▼────┐                    ┌────▼────┐
    │  Active  │ ←── LB指向 ────── │  Idle   │
    └─────────┘                    └─────────┘

切换流程：
1. 部署Green版本（与Blue并行运行）
2. 对Green进行健康检查和冒烟测试
3. 切换LB权重：Blue→Green (100%)
4. 监控5-15分钟
5. 确认无异常 → 保留Green，下线Blue
6. 发现问题 → 秒级回切到Blue
```

#### 12.1.1 Argo Rollouts蓝绿配置

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: assessment-service
  namespace: mindbridge-prod
spec:
  replicas: 3
  strategy:
    blueGreen:
      activeService: assessment-service-active
      previewService: assessment-service-preview
      autoPromotionEnabled: false
      autoPromotionSeconds: 300  # 5分钟后自动提升
      scaleDownDelaySeconds: 600  # 保留Blue 10分钟
  selector:
    matchLabels:
      app: assessment-service
  template:
    metadata:
      labels:
        app: assessment-service
    spec:
      containers:
        - name: assessment-service
          image: registry.mindbridge.com/mindbridge/assessment-service:v1.3.0
          ports:
            - containerPort: 9002
```

### 12.2 金丝雀发布 (Canary)

```
流量分配逐步推进：

阶段    Blue (v1.2.0)    Green (v1.3.0)    持续时间    检查项
Phase 1    95%               5%            10min     错误率<1%
Phase 2    80%              20%            15min     延迟P95<500ms
Phase 3    50%              50%            20min     业务指标正常
Phase 4    20%              80%            15min     无异常告警
Phase 5     0%             100%            —         完成发布

任一阶段异常 → 立即回滚到Blue
```

#### 12.2.1 Argo Rollouts金丝雀配置

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web-frontend
  namespace: mindbridge-prod
spec:
  replicas: 3
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 10m }
        - analysis:
            templates:
              - templateName: canary-health-check
        - setWeight: 20
        - pause: { duration: 15m }
        - setWeight: 50
        - pause: { duration: 20m }
        - setWeight: 80
        - pause: { duration: 15m }
        - setWeight: 100
      analysis:
        templates:
          - templateName: canary-health-check

---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: canary-health-check
spec:
  metrics:
    - name: error-rate
      interval: 1m
      successCondition: result[0] < 0.01
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{status=~"5..",service="web-frontend"}[1m]))
            / sum(rate(http_requests_total{service="web-frontend"}[1m]))

    - name: latency-p95
      interval: 1m
      successCondition: result[0] < 0.5
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            histogram_quantile(0.95,
              sum(rate(http_request_duration_seconds_bucket{service="web-frontend"}[1m]))
              by (le))
```

---

## 13. 安全基线配置

### 13.1 操作系统安全基线

#### 13.1.1 内核参数加固

```ini
# /etc/sysctl.d/99-mindbridge-security.conf

# 网络安全
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# 文件系统保护
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1

# 内核保护
kernel.randomize_va_space = 2
kernel.exec-shield = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.unprivileged_bpf_disabled = 1

# 应用生效
# sysctl --system
```

#### 13.1.2 SELinux/AppArmor 配置

```bash
# SELinux模式（RHEL/Rocky Linux）
# /etc/selinux/config
SELINUX=enforcing
SELINUXTYPE=targeted

# 为容器运行时设置SELinux策略
semanage fcontext -a -t container_file_t "/var/lib/containerd(/.*)?"
restorecon -Rv /var/lib/containerd

# AppArmor模式（Ubuntu）
# 安装AppArmor工具
apt install apparmor apparmor-utils -y

# 为K8s容器加载AppArmor配置文件
# 创建Pod时指定: apparmor.security.beta.kubernetes.io/pod: runtime/default
```

#### 13.1.3 SSH安全配置

```ini
# /etc/ssh/sshd_config.d/99-hardening.conf

Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
PermitEmptyPasswords no
HostbasedAuthentication no
LoginGraceTime 30
Protocol 2

# 仅允许运维组用户SSH登录
AllowGroups ops-admins
```

#### 13.1.4 文件权限基线

```bash
#!/bin/bash
# 关键文件权限设置

# 系统配置文件
chmod 600 /etc/shadow
chmod 600 /etc/gshadow
chmod 644 /etc/passwd
chmod 644 /etc/group
chmod 600 /etc/ssh/sshd_config
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys

# 日志目录
chmod 755 /var/log
chmod 640 /var/log/auth.log
chmod 640 /var/log/secure

# 应用配置（含敏感信息）
chmod 600 /etc/pgbouncer/userlist.txt
chmod 600 /etc/ssl/private/*.key
chmod 700 /var/lib/postgresql/data

# CRON任务
chmod 600 /etc/crontab
chmod 700 /etc/cron.d
chmod 700 /etc/cron.daily
```

### 13.2 容器安全基线

#### 13.2.1 非root运行

```dockerfile
# 所有Dockerfile必须遵循的非root运行规范

# 创建专用用户
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# 设置文件所有权
COPY --chown=appuser:appgroup . /app

# 切换到非root用户
USER appuser

# 禁止提权
# 不使用 sudo，不安装 sudo
```

#### 13.2.2 只读文件系统

```yaml
# K8s Deployment安全上下文
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL

# 需要写入的目录通过emptyDir挂载
volumeMounts:
  - name: tmp
    mountPath: /tmp
  - name: cache
    mountPath: /app/cache
volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir:
      medium: Memory
      sizeLimit: "128Mi"
```

#### 13.2.3 资源限制

```yaml
# 所有容器必须设置资源限制
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "2000m"
    memory: "2Gi"

# Namespace级别LimitRange
apiVersion: v1
kind: LimitRange
metadata:
  name: mindbridge-limits
  namespace: mindbridge-prod
spec:
  limits:
    - type: Container
      default:
        cpu: "1"
        memory: "1Gi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "8"
        memory: "16Gi"
      min:
        cpu: "50m"
        memory: "64Mi"
```

#### 13.2.4 安全上下文完整示例

```yaml
# Pod安全标准 — Restricted级别
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod-example
  namespace: mindbridge-prod
spec:
  securityContext:
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: registry.mindbridge.com/mindbridge/user-service:v1.2.0
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
        seccompProfile:
          type: RuntimeDefault
```

### 13.3 Kubernetes安全基线

#### 13.3.1 Pod安全标准

```yaml
# Namespace Pod安全标签 — 强制Restricted级别
apiVersion: v1
kind: Namespace
metadata:
  name: mindbridge-prod
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.31
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: v1.31
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: v1.31
---
apiVersion: v1
kind: Namespace
metadata:
  name: infra
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/enforce-version: v1.31
```

#### 13.3.2 NetworkPolicy

```yaml
# 默认拒绝所有入站流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: mindbridge-prod
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
# 允许业务服务访问数据库
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-to-db
  namespace: infra
spec:
  podSelector:
    matchLabels:
      app: postgresql
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: mindbridge-prod
      ports:
        - port: 5432
          protocol: TCP
---
# 允许业务服务访问Kafka
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-to-kafka
  namespace: infra
spec:
  podSelector:
    matchLabels:
      app: kafka
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: mindbridge-prod
      ports:
        - port: 9092
          protocol: TCP
---
# 允许Prometheus抓取指标
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: mindbridge-prod
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - port: 9001
          protocol: TCP
        - port: 9002
          protocol: TCP
        - port: 9003
          protocol: TCP
        - port: 9004
          protocol: TCP
```

#### 13.3.3 RBAC最小权限

```yaml
# 业务服务只读权限（调试用）
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mindbridge-readonly
  namespace: mindbridge-prod
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
---
# 运维管理员权限
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mindbridge-ops-admin
  namespace: mindbridge-prod
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services", "configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
---
# 禁止使用cluster-admin，按需分配
# kubectl create clusterrolebinding --help
```

#### 13.3.4 Secret加密

```yaml
# EncryptionConfiguration — K8s Secret静态加密
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - kms:
          name: mindbridge-kms
          endpoint: unix:///var/run/kmsplugin/socket
          cachesize: 1000
          timeout: 3s
      - identity: {}
---
# 使用External Secrets Operator从Vault同步
# 参见 17.7 K8s Secret管理章节
```

### 13.4 数据库安全基线

#### 13.4.1 连接加密

```ini
# PostgreSQL强制SSL连接
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/ssl/certs/postgres.crt'
ssl_key_file = '/etc/ssl/private/postgres.key'
ssl_ca_file = '/etc/ssl/certs/ca.crt'
ssl_min_protocol_version = 'TLSv1.2'

# pg_hba.conf — 强制SSL
hostssl mindbridge  mindbridge_app  10.0.0.0/8  scram-sha-256
hostssl mindbridge  mindbridge_readonly  10.0.0.0/8  scram-sha-256
hostssl replication replicator  10.0.0.0/8  scram-sha-256
# 拒绝非SSL连接
hostnossl all  all  0.0.0.0/0  reject
```

#### 13.4.2 密码策略

```sql
-- 密码复杂度扩展
CREATE EXTENSION IF NOT EXISTS password_policy;

-- 设置密码策略
ALTER ROLE mindbridge_app VALID UNTIL 'infinity';
ALTER ROLE mindbridge_app SET password_encryption = 'scram-sha-256';

-- 密码轮换策略（通过应用层实现）
-- 1. 最短长度12位
-- 2. 包含大小写字母、数字、特殊字符
-- 3. 90天强制更换
-- 4. 历史密码不可重复（最近5次）
-- 5. 连续5次失败锁定30分钟
```

#### 13.4.3 审计日志

```ini
# PostgreSQL审计日志配置
# postgresql.conf
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-audit-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB

# 审计级别
log_statement = 'mod'          # 记录DDL和DML
log_connections = on            # 记录连接
log_disconnections = on         # 记录断开
log_duration = off              # 不记录所有查询耗时
log_min_duration_statement = 1000  # 慢查询阈值1s

# pgAudit扩展（更细粒度审计）
# shared_preload_libraries = 'pgaudit'
# pgaudit.log = 'ddl,role,write'
# pgaudit.log_relation = on
```

#### 13.4.4 最小权限账户

```sql
-- 应用服务账户（仅DML权限）
CREATE ROLE mindbridge_app WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE mindbridge TO mindbridge_app;
GRANT USAGE ON SCHEMA public TO mindbridge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mindbridge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mindbridge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mindbridge_app;

-- 只读账户（报表/审计）
CREATE ROLE mindbridge_readonly WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE mindbridge TO mindbridge_readonly;
GRANT USAGE ON SCHEMA public TO mindbridge_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mindbridge_readonly;

-- 迁移账户（仅DDL + DML）
CREATE ROLE mindbridge_migrate WITH LOGIN PASSWORD '<password>';
GRANT ALL ON DATABASE mindbridge TO mindbridge_migrate;
GRANT ALL ON SCHEMA public TO mindbridge_migrate;
GRANT CREATE ON SCHEMA public TO mindbridge_migrate;

-- 备份账户
CREATE ROLE backup_admin WITH LOGIN PASSWORD '<password>';
GRANT pg_read_all_data TO backup_admin;
```

### 13.5 网络安全基线

#### 13.5.1 VPC隔离

```
┌──────────────────────────────────────────────────────────┐
│                     VPC: 10.0.0.0/16                      │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │  Public Tier    │  │  Private Tier   │  │  Data Tier   │ │
│  │  10.0.100.0/24 │  │  10.0.1-3.0/24 │  │ 10.0.10-11  │ │
│  │                │  │                │  │  .0/24       │ │
│  │  • ALB/WAF     │  │  • K8s Workers │  │  • PostgreSQL│ │
│  │  • NAT GW      │  │  • AI推理节点   │  │  • Redis     │ │
│  │  • Bastion     │  │  • 业务服务     │  │  • RabbitMQ  │ │
│  └───────┬────────┘  └───────┬────────┘  │  • Kafka     │ │
│          │                   │            └──────┬──────┘ │
│          │   ┌───────────────┘                   │        │
│          │   │  仅允许Private→Data                │        │
│          ▼   ▼  禁止Public→Data直连               ▼        │
│     ┌─────────────────────────────────────────────────┐   │
│     │              安全组 / NACL 分层隔离               │   │
│     └─────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

#### 13.5.2 安全组规则

```yaml
# 安全组规则 — 最小权限原则
security_groups:
  - name: sg-public
    rules:
      - direction: inbound
        protocol: tcp
        port: 443
        source: "0.0.0.0/0"
        description: "HTTPS入站"
      - direction: inbound
        protocol: tcp
        port: 80
        source: "0.0.0.0/0"
        description: "HTTP重定向"
      - direction: outbound
        protocol: all
        destination: "0.0.0.0/0"

  - name: sg-app
    rules:
      - direction: inbound
        protocol: tcp
        port: "3000,8000,9001-9004"
        source: sg-public
        description: "应用端口（仅来自Public层）"
      - direction: outbound
        protocol: tcp
        port: 5432
        destination: sg-data
      - direction: outbound
        protocol: tcp
        port: 6379
        destination: sg-data
      - direction: outbound
        protocol: tcp
        port: 5672
        destination: sg-data
      - direction: outbound
        protocol: tcp
        port: 9092
        destination: sg-data

  - name: sg-data
    rules:
      - direction: inbound
        protocol: tcp
        port: "5432,6379,5672,9092,9000"
        source: sg-app
        description: "数据层端口（仅来自App层）"
      - direction: outbound
        protocol: all
        destination: "0.0.0.0/0"
```

#### 13.5.3 WAF规则集

```yaml
# WAF规则集 — 生产环境配置
waf_config:
  managed_rule_sets:
    - name: "OWASP-CRS"
      priority: 1
      actions:
        - rule: "SQL-Injection"
          action: block
          severity: critical
        - rule: "XSS-Attack"
          action: block
          severity: critical
        - rule: "RFI-LFI"
          action: block
          severity: high
        - rule: "Command-Injection"
          action: block
          severity: critical
        - rule: "Protocol-Anomaly"
          action: block
          severity: medium

  rate_limiting:
    - path: "/api/v1/auth/login"
      threshold: "10 requests/min per IP"
      action: block
      duration: 300s
    - path: "/api/v1/*"
      threshold: "100 requests/min per IP"
      action: throttle
    - path: "/api/v1/assessments/*"
      threshold: "30 requests/min per IP"
      action: throttle

  geo_restrictions:
    allowed_countries: []  # 按业务需求配置
    blocked_countries: []  # 按安全策略配置

  bot_protection:
    enabled: true
    challenge_action: captcha
    allowed_bots:
      - "Googlebot"
      - "Bingbot"
```

#### 13.5.4 DDoS防护

```yaml
# DDoS防护配置
ddos_protection:
  # L3/L4层防护（云厂商默认）
  network_layer:
    enabled: true
    auto_mitigation: true
    traffic_threshold_mbps: 1000

  # L7层防护
  application_layer:
    enabled: true
    rate_limiting:
      global_rps: 10000
      per_ip_rps: 100
    connection_limiting:
      max_concurrent: 5000
      per_ip_concurrent: 50
    slowloris_protection:
      enabled: true
      header_timeout: 20s
      body_timeout: 60s

  # 应急响应
  emergency:
    enable_shield: true
    contact: "security@mindbridge.com"
    escalation_time: 5m
```

### 13.6 安全基线自动化检查脚本

```bash
#!/bin/bash
# security-baseline-check.sh — 安全基线自动化检查脚本
# 用法: bash security-baseline-check.sh [--fix]
# --fix 参数将自动修复部分可修复的问题

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
FIX_MODE="${1:-}"

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); }

echo "=========================================="
echo " MindBridge 安全基线检查"
echo " 日期: $(date '+%Y-%m-%d %H:%M:%S')"
echo " 主机: $(hostname)"
echo "=========================================="
echo ""

# ===== 1. 操作系统安全检查 =====
echo "--- 操作系统安全检查 ---"

# 1.1 内核参数
check_sysctl() {
    local param=$1 expected=$2
    local actual
    actual=$(sysctl -n "$param" 2>/dev/null || echo "NOT_SET")
    if [ "$actual" = "$expected" ]; then
        log_pass "sysctl $param = $actual"
    else
        log_fail "sysctl $param = $actual (期望: $expected)"
        if [ "$FIX_MODE" = "--fix" ]; then
            sysctl -w "$param=$expected" 2>/dev/null && echo "  → 已修复"
        fi
    fi
}

check_sysctl "kernel.randomize_va_space" "2"
check_sysctl "kernel.kptr_restrict" "2"
check_sysctl "fs.suid_dumpable" "0"
check_sysctl "net.ipv4.tcp_syncookies" "1"
check_sysctl "net.ipv4.conf.all.send_redirects" "0"
check_sysctl "net.ipv4.conf.all.accept_redirects" "0"

# 1.2 SSH配置
echo ""
echo "--- SSH安全检查 ---"

check_ssh_param() {
    local param=$1 expected=$2
    local actual
    actual=$(grep -E "^${param}" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "NOT_SET")
    if [ "$actual" = "$expected" ]; then
        log_pass "SSH $param = $actual"
    else
        log_fail "SSH $param = $actual (期望: $expected)"
    fi
}

check_ssh_param "PermitRootLogin" "no"
check_ssh_param "PasswordAuthentication" "no"
check_ssh_param "X11Forwarding" "no"
check_ssh_param "MaxAuthTries" "3"

# 1.3 文件权限
echo ""
echo "--- 文件权限检查 ---"

check_perm() {
    local file=$1 expected_perm=$2
    if [ -f "$file" ]; then
        local actual_perm
        actual_perm=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null)
        if [ "$actual_perm" = "$expected_perm" ]; then
            log_pass "权限 $file = $actual_perm"
        else
            log_fail "权限 $file = $actual_perm (期望: $expected_perm)"
            if [ "$FIX_MODE" = "--fix" ]; then
                chmod "$expected_perm" "$file" && echo "  → 已修复"
            fi
        fi
    else
        log_warn "文件不存在: $file"
    fi
}

check_perm "/etc/shadow" "600"
check_perm "/etc/gshadow" "600"
check_perm "/etc/ssh/sshd_config" "600"

# ===== 2. 容器安全检查 =====
echo ""
echo "--- 容器安全检查 ---"

# 2.1 检查是否有以root运行的容器
if command -v kubectl &>/dev/null; then
    root_containers=$(kubectl get pods -n mindbridge-prod -o json 2>/dev/null | \
        grep -c '"runAsUser": 0' || true)
    if [ "$root_containers" -eq 0 ]; then
        log_pass "无以root运行的容器"
    else
        log_fail "发现 $root_containers 个以root运行的容器"
    fi

    # 2.2 检查特权容器
    privileged=$(kubectl get pods -n mindbridge-prod -o json 2>/dev/null | \
        grep -c '"privileged": true' || true)
    if [ "$privileged" -eq 0 ]; then
        log_pass "无特权容器"
    else
        log_fail "发现 $privileged 个特权容器"
    fi
else
    log_warn "kubectl未安装，跳过K8s安全检查"
fi

# ===== 3. 数据库安全检查 =====
echo ""
echo "--- 数据库安全检查 ---"

if command -v psql &>/dev/null; then
    # 3.1 SSL连接检查
    ssl_status=$(psql -h localhost -U postgres -t -c \
        "SHOW ssl" 2>/dev/null | xargs || echo "UNABLE_TO_CHECK")
    if [ "$ssl_status" = "on" ]; then
        log_pass "PostgreSQL SSL已启用"
    else
        log_fail "PostgreSQL SSL未启用 (当前: $ssl_status)"
    fi

    # 3.2 密码加密方式
    pass_enc=$(psql -h localhost -U postgres -t -c \
        "SHOW password_encryption" 2>/dev/null | xargs || echo "UNABLE_TO_CHECK")
    if [ "$pass_enc" = "scram-sha-256" ]; then
        log_pass "PostgreSQL密码加密方式: scram-sha-256"
    else
        log_fail "PostgreSQL密码加密方式: $pass_enc (期望: scram-sha-256)"
    fi

    # 3.3 连接数检查
    max_conn=$(psql -h localhost -U postgres -t -c \
        "SHOW max_connections" 2>/dev/null | xargs || echo "0")
    active_conn=$(psql -h localhost -U postgres -t -c \
        "SELECT count(*) FROM pg_stat_activity" 2>/dev/null | xargs || echo "0")
    if [ "$max_conn" -gt 0 ]; then
        usage=$((active_conn * 100 / max_conn))
        if [ "$usage" -lt 80 ]; then
            log_pass "PostgreSQL连接数使用率: ${usage}% (${active_conn}/${max_conn})"
        else
            log_warn "PostgreSQL连接数使用率偏高: ${usage}% (${active_conn}/${max_conn})"
        fi
    fi
else
    log_warn "psql未安装，跳过数据库安全检查"
fi

# ===== 4. 网络安全检查 =====
echo ""
echo "--- 网络安全检查 ---"

# 4.1 监听端口检查
echo "当前监听端口:"
ss -tlnp 2>/dev/null | head -20 || netstat -tlnp 2>/dev/null | head -20

# 4.2 检查不必要的开放端口
for port in 23 21 111 2049; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
       netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
        log_fail "不安全端口 $port 正在监听"
    else
        log_pass "不安全端口 $port 未开放"
    fi
done

# ===== 5. 证书有效期检查 =====
echo ""
echo "--- 证书有效期检查 ---"

check_cert_expiry() {
    local cert_file=$1
    if [ -f "$cert_file" ]; then
        expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
        if [ -n "$expiry_date" ]; then
            expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null)
            now_epoch=$(date +%s)
            days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
            if [ "$days_left" -gt 30 ]; then
                log_pass "证书 $cert_file 剩余 ${days_left} 天"
            elif [ "$days_left" -gt 0 ]; then
                log_warn "证书 $cert_file 即将过期，剩余 ${days_left} 天"
            else
                log_fail "证书 $cert_file 已过期"
            fi
        fi
    fi
}

for cert in /etc/ssl/certs/mindbridge.crt /etc/ssl/certs/postgres.crt; do
    check_cert_expiry "$cert"
done

# ===== 检查结果汇总 =====
echo ""
echo "=========================================="
echo " 检查结果汇总"
echo "=========================================="
echo -e " 通过: ${GREEN}${PASS}${NC}"
echo -e " 失败: ${RED}${FAIL}${NC}"
echo -e " 警告: ${YELLOW}${WARN}${NC}"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}存在安全基线不合规项，请尽快修复！${NC}"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}存在安全警告项，建议关注。${NC}"
    exit 0
else
    echo -e "${GREEN}所有安全基线检查通过！${NC}"
    exit 0
fi
```

---

## 14. 运维SOP

### 14.1 日常巡检清单

**每日巡检（自动脚本 + 人工确认）**

| 序号 | 检查项 | 检查方法 | 正常标准 |
|-----|-------|---------|---------|
| 1 | 服务可用性 | `kubectl get pods -n mindbridge-prod` | 所有Pod Running |
| 2 | 服务健康检查 | `curl https://api.mindbridge.com/health` | 200 OK |
| 3 | CPU使用率 | Grafana / Prometheus | <70% |
| 4 | 内存使用率 | Grafana / Prometheus | <80% |
| 5 | 磁盘使用率 | `df -h` / 监控面板 | <85% |
| 6 | PostgreSQL连接数 | `SELECT count(*) FROM pg_stat_activity` | <max_connections的80% |
| 7 | PostgreSQL复制状态 | `SELECT * FROM pg_stat_replication` | streaming状态 |
| 8 | Redis集群状态 | `redis-cli --cluster check` | 所有slot覆盖 |
| 9 | RabbitMQ队列深度 | 管理面板 / API | <10000 |
| 10 | Kafka消费者组滞后 | `kafka-consumer-groups.sh --describe` | Lag < 1000 |
| 11 | AI推理延迟 | Prometheus指标 | P95 <3s |
| 12 | SSL证书有效期 | `certbot certificates` | >30天 |
| 13 | 备份完成状态 | 检查备份文件时间戳 | 最近24h内有备份 |
| 14 | 安全告警 | 安全面板 / WAF日志 | 无异常 |
| 15 | 错误日志 | ELK搜索5xx错误 | <1% |

### 14.2 故障处理SOP

#### 14.2.1 服务宕机

```bash
# Step 1: 确认故障范围
kubectl get pods -n mindbridge-prod | grep -v Running

# Step 2: 查看故障Pod日志
kubectl logs -n mindbridge-prod <pod-name> --tail=200

# Step 3: 查看事件
kubectl describe pod -n mindbridge-prod <pod-name>

# Step 4: 临时修复（重启）
kubectl rollout restart deployment/<service-name> -n mindbridge-prod

# Step 5: 如果重启无效，回滚到上一版本
kubectl rollout undo deployment/<service-name> -n mindbridge-prod

# Step 6: 升级响应（如果影响面大）
# 通知值班负责人 → 启动应急预案 → 必要时切换灾备
```

#### 14.2.2 数据库故障

```bash
# PostgreSQL主节点不可用
# Step 1: 确认从节点状态
ssh <standby-node>
pg_isready -h localhost -p 5432

# Step 2: 提升从节点为主节点
ssh <standby-node>
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/data

# Step 3: 更新连接配置
# 修改PgBouncer指向新主节点
kubectl edit configmap pgbouncer-config -n infra

# Step 4: 重启PgBouncer使配置生效
kubectl rollout restart deployment/pgbouncer -n infra

# Step 5: 验证新主节点可写
psql -h <new-primary> -U mindbridge_app -d mindbridge -c "SELECT 1"
```

#### 14.2.3 AI推理服务故障

```bash
# GPU OOM或推理超时
# Step 1: 检查GPU状态
nvidia-smi

# Step 2: 检查推理服务日志
kubectl logs -n ai-serving deployment/ai-inference-gpu --tail=100

# Step 3: 临时降级到CPU推理
kubectl scale deployment ai-inference-gpu --replicas=0 -n ai-serving
kubectl scale deployment ai-inference-cpu --replicas=3 -n ai-serving

# Step 4: 更新API路由指向CPU推理
kubectl edit configmap ai-routing -n ai-serving
# 修改 INFERENCE_ENDPOINT 指向CPU服务

# Step 5: 分析OOM原因并修复
```

### 14.3 扩容缩容SOP

#### 14.3.1 水平扩容（业务服务）

```bash
# 手动扩容
kubectl scale deployment/assessment-service \
  --replicas=6 -n mindbridge-prod

# 修改HPA上限
kubectl patch hpa assessment-service-hpa \
  -n mindbridge-prod \
  -p '{"spec":{"maxReplicas":20}}'

# 添加节点（云厂商控制台或Terraform）
# 更新集群规模 → 等待节点就绪 → 验证Pod调度
```

#### 14.3.2 缩容

```bash
# 缩容前检查
kubectl top nodes          # 确认资源利用率
kubectl top pods -n mindbridge-prod  # 确认Pod资源

# 缩容节点（确保Pod已迁移）
kubectl cordon <node-name>
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# 从集群移除节点（云厂商操作）
```

### 14.4 应急响应流程

```
发现异常
    │
    ▼
┌──────────────┐
│ P1: 服务中断  │ ──→ 5分钟内响应，30分钟内恢复
│ P2: 功能降级  │ ──→ 15分钟内响应，2小时内恢复
│ P3: 一般问题  │ ──→ 1小时内响应，下一个发布窗口修复
│ P4: 优化建议  │ ──→ 排入迭代计划
└──────────────┘
    │
    ▼
应急响应步骤：
1. 确认故障等级
2. 通知相关人员（飞书/电话）
3. 执行故障处理SOP
4. 监控恢复情况
5. 撰写事故报告（Post-mortem）
6. 改进措施跟进
```

---

## 15. 多云部署一致性保障

### 15.1 多云抽象层设计

#### 15.1.1 Terraform模块化

```
terraform/
├── modules/                          # 可复用基础模块
│   ├── vpc/                          # VPC网络模块
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── kubernetes/                   # K8s集群模块
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── database/                     # 数据库模块
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cache/                        # 缓存模块
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── messaging/                    # 消息队列模块
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── storage/                      # 对象存储模块
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/                     # 环境配置
│   ├── production/
│   │   ├── aws/                      # AWS生产环境
│   │   │   ├── main.tf
│   │   │   ├── backend.tf
│   │   │   └── terraform.tfvars
│   │   ├── alicloud/                 # 阿里云生产环境
│   │   │   ├── main.tf
│   │   │   ├── backend.tf
│   │   │   └── terraform.tfvars
│   │   └── tencentcloud/             # 腾讯云生产环境
│   │       ├── main.tf
│   │       ├── backend.tf
│   │       └── terraform.tfvars
│   └── staging/
│       └── ...
└── shared/                           # 共享配置
    ├── providers.tf
    └── locals.tf
```

```hcl
# environments/production/aws/main.tf — AWS生产环境示例

terraform {
  backend "s3" {
    bucket = "mindbridge-terraform-state"
    key    = "production/aws/terraform.tfstate"
    region = "ap-northeast-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "../../../modules/vpc"
  providers = { aws = aws }

  vpc_cidr       = "10.0.0.0/16"
  environment    = "production"
  cloud_provider = "aws"
}

module "kubernetes" {
  source = "../../../modules/kubernetes"
  providers = { aws = aws }

  cluster_name   = "mindbridge-prod"
  cluster_version = "1.31"
  node_groups    = var.node_groups
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
}

module "database" {
  source = "../../../modules/database"
  providers = { aws = aws }

  engine_version = "16"
  instance_class = "db.r6g.4xlarge"
  multi_az       = true
  vpc_id         = module.vpc.vpc_id
}
```

#### 15.1.2 Helm Values分层

```
helm-values/
├── base.yaml                         # 基础配置（所有环境通用）
├── environments/
│   ├── production.yaml               # 生产环境覆盖
│   ├── staging.yaml                  # 预发布环境覆盖
│   └── development.yaml              # 开发环境覆盖
├── clouds/
│   ├── aws.yaml                      # AWS特有配置
│   ├── alicloud.yaml                 # 阿里云特有配置
│   └── tencentcloud.yaml             # 腾讯云特有配置
└── overrides/
    └── region/                       # 区域级覆盖
        ├── ap-northeast-1.yaml
        ├── cn-shanghai.yaml
        └── ap-shanghai.yaml
```

```yaml
# helm-values/base.yaml — 通用基础配置
global:
  environment: production
  registry: registry.mindbridge.com
  imagePullSecrets:
    - name: registry-creds

  # 统一中间件连接配置模板
  database:
    port: 5432
    sslMode: require
    maxConnections: 50

  redis:
    port: 6379
    maxConnections: 20

  rabbitmq:
    port: 5672
    managementPort: 15672

  kafka:
    port: 9092

  # 统一监控配置
  monitoring:
    enabled: true
    prometheus:
      scrapeInterval: 15s

  # 统一安全配置
  security:
    runAsNonRoot: true
    readOnlyRootFilesystem: true
    allowPrivilegeEscalation: false
```

```yaml
# helm-values/clouds/aws.yaml — AWS特有配置
global:
  storage:
    type: s3
    bucket: mindbridge-prod
    region: ap-northeast-1

  database:
    host: mindbridge-postgres.xxxxxx.ap-northeast-1.rds.amazonaws.com
    class: db.r6g.4xlarge

  redis:
    host: mindbridge-redis.xxxxxx.aps1.cache.amazonaws.com

  messaging:
    rabbitmq:
      type: amazon-mq
      host: b-xxxxxx.mq.ap-northeast-1.amazonaws.com
    kafka:
      type: msk
      brokers: "b1.mindbridge.kafka.ap-northeast-1.amazonaws.com:9092,b2.mindbridge.kafka.ap-northeast-1.amazonaws.com:9092,b3.mindbridge.kafka.ap-northeast-1.amazonaws.com:9092"

  loadBalancer:
    type: alb
    scheme: internet-facing
```

#### 15.1.3 配置管理统一

```yaml
# config-sync.yaml — 跨云配置同步策略
sync_policy:
  # 核心配置必须跨云一致
  mandatory_sync:
    - path: "global.security"
      description: "安全策略必须跨云一致"
    - path: "global.monitoring"
      description: "监控配置必须跨云一致"
    - path: "global.database.sslMode"
      description: "数据库SSL模式必须一致"
    - path: "global.rabbitmq.port"
      description: "消息队列端口必须一致"
    - path: "global.kafka.port"
      description: "Kafka端口必须一致"

  # 云特有配置允许差异
  cloud_specific:
    - path: "global.storage"
      description: "存储服务各云不同"
    - path: "global.database.host"
      description: "数据库主机各云不同"
    - path: "global.loadBalancer"
      description: "负载均衡各云不同"

  # 配置同步验证
  validation:
    enabled: true
    schedule: "0 */6 * * *"
    alert_on_drift: true
```

### 15.2 云服务映射对照表

| 服务类别 | AWS | 阿里云 | 腾讯云 | 统一抽象接口 |
|---------|-----|-------|-------|------------|
| **计算 — K8s** | EKS (1.31) | ACK (1.31) | TKE (1.31) | kubectl / Helm |
| **计算 — GPU** | g5.xlarge (T4) | ecs.gn7i-c16g1.4xlarge (T4) | GN7.2XLARGE32 (T4) | NVIDIA GPU Operator |
| **存储 — 对象** | S3 | OSS | COS | S3兼容API / MinIO SDK |
| **存储 — 块** | EBS (gp3) | ESSD (PL1) | CBS (SSD) | CSI Driver |
| **网络 — VPC** | VPC | VPC | VPC | Terraform vpc module |
| **网络 — LB** | ALB | ALB | CLB | Ingress Controller |
| **网络 — CDN** | CloudFront | 阿里云CDN | 腾讯云CDN | 自定义域名 + CNAME |
| **网络 — DNS** | Route 53 | 云解析DNS | DNSPod | External-DNS |
| **数据库** | RDS PostgreSQL 16 | RDS PostgreSQL 16 | TDSQL-C PostgreSQL 16 | PgBouncer + 标准SQL |
| **缓存** | ElastiCache Redis 7.2 | 云Redis 7.2 | 云Redis 7.2 | Redis协议兼容 |
| **消息队列** | Amazon MQ (RabbitMQ) | 云消息队列RabbitMQ | TDMQ RabbitMQ | AMQP协议兼容 |
| **事件流** | MSK (Kafka) | 云Kafka版 | CKafka | Kafka协议兼容 |
| **AI服务** | SageMaker / Bedrock | PAI / 通义千问 | TI / 混元 | vLLM统一推理层 |
| **密钥管理** | Secrets Manager | KMS | SSMS | Vault / ESO |
| **监控** | CloudWatch + AMP | ARMS + SLS | 云监控 + CLS | Prometheus + Grafana |
| **日志** | CloudWatch Logs | SLS | CLS | Fluent Bit → ELK |
| **WAF** | AWS WAF | 云WAF | 云WAF | OWASP CRS规则集 |
| **容器镜像** | ECR | ACR | TCR | OCI标准 / Harbor |

### 15.3 环境一致性验证清单

| 序号 | 验证项 | 验证方法 | 一致性标准 | 检查频率 |
|-----|-------|---------|-----------|---------|
| 1 | K8s集群版本 | `kubectl version --short` | 三云均为1.31.x | 部署时 |
| 2 | PostgreSQL版本 | `SELECT version()` | 三云均为16.x | 部署时 |
| 3 | Redis版本 | `INFO server` | 三云均为7.2+ | 部署时 |
| 4 | Helm Chart版本 | `helm list -A` | 三云使用同一Chart版本 | 部署时 |
| 5 | 镜像版本 | `kubectl get pods -o jsonpath=..image` | 三云镜像tag一致 | 部署时 |
| 6 | 安全策略 | 对比securityContext配置 | 三云安全上下文一致 | 每周 |
| 7 | NetworkPolicy | `kubectl get networkpolicy` | 三云网络策略一致 | 每周 |
| 8 | HPA配置 | `kubectl get hpa` | 扩缩容策略一致 | 每周 |
| 9 | 告警规则 | 对比Prometheus rules | 三云告警规则一致 | 每周 |
| 10 | 备份策略 | 对比CronJob配置 | 备份频率和保留期一致 | 每月 |
| 11 | SSL证书 | `openssl s_client` | 证书链和有效期一致 | 每月 |
| 12 | 环境变量 | 对比ConfigMap/Secret | 非云特有变量一致 | 部署时 |
| 13 | 资源配额 | `kubectl describe limitrange` | LimitRange配置一致 | 每周 |
| 14 | RBAC策略 | `kubectl get role,rolebinding` | 权限模型一致 | 每月 |
| 15 | DNS解析 | `dig / nslookup` | 内部服务解析一致 | 每日 |

### 15.4 配置漂移检测与修复流程

```
┌─────────────────────────────────────────────────────────────┐
│                  配置漂移检测与修复流程                         │
│                                                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Git仓库   │    │ 实际状态   │    │ 基线快照   │              │
│  │ (期望状态) │    │ (运行时)   │    │ (上次合规) │              │
│  └─────┬────┘    └─────┬────┘    └─────┬────┘              │
│        │               │               │                     │
│        └───────┬───────┘───────────────┘                     │
│                │                                             │
│         ┌──────▼──────┐                                     │
│         │  漂移检测引擎  │  ← Terraform Plan / driftctl       │
│         └──────┬──────┘                                     │
│                │                                             │
│         ┌──────▼──────┐                                     │
│         │  差异分析     │                                     │
│         └──────┬──────┘                                     │
│                │                                             │
│        ┌───────┼───────┐                                    │
│        │       │       │                                     │
│   ┌────▼──┐ ┌─▼────┐ ┌▼─────┐                             │
│   │ 无漂移  │ │可自动修│ │需人工 │                             │
│   │ (合规) │ │复漂移  │ │审核   │                             │
│   └───────┘ └──┬───┘ └──┬───┘                             │
│                │        │                                    │
│         ┌──────▼──┐  ┌──▼──────┐                           │
│         │自动修复   │  │创建工单  │                           │
│         │(Terraform│  │(飞书/JIRA│                           │
│         │ apply)  │  │)       │                            │
│         └──────┬──┘  └──┬──────┘                           │
│                │        │                                    │
│                └───┬────┘                                   │
│              ┌─────▼─────┐                                  │
│              │ 验证修复结果 │                                  │
│              │ 更新基线快照 │                                  │
│              └───────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

**漂移检测工具链：**

| 工具 | 用途 | 检测频率 |
|-----|------|---------|
| Terraform Plan | IaC漂移检测 | 每日自动 |
| driftctl | 基础设施漂移检测 | 每日自动 |
| kubectl diff | K8s资源漂移检测 | 每日自动 |
| Helm diff | Chart配置漂移检测 | 每日自动 |
| OPA/Gatekeeper | 运行时策略合规 | 实时 |

```bash
#!/bin/bash
# drift-detection.sh — 配置漂移检测脚本

set -euo pipefail

CLOUDS=("aws" "alicloud" "tencentcloud")
DRIFT_REPORT="/tmp/drift-report-$(date +%Y%m%d).txt"

echo "===== 配置漂移检测报告 =====" > "$DRIFT_REPORT"
echo "日期: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DRIFT_REPORT"
echo "" >> "$DRIFT_REPORT"

for cloud in "${CLOUDS[@]}"; do
    echo "--- 检测 ${cloud} 漂移 ---" >> "$DRIFT_REPORT"

    cd "terraform/environments/production/${cloud}" || continue

    terraform init -backend=false -input=false > /dev/null 2>&1
    DRIFT_OUTPUT=$(terraform plan -detailed-exitcode 2>&1) || true

    if echo "$DRIFT_OUTPUT" | grep -q "No changes"; then
        echo "[合规] ${cloud}: 无配置漂移" >> "$DRIFT_REPORT"
    else
        echo "[漂移] ${cloud}: 检测到配置漂移" >> "$DRIFT_REPORT"
        echo "$DRIFT_OUTPUT" >> "$DRIFT_REPORT"

        echo "⚠️ ${cloud} 存在配置漂移，请检查"
    fi

    echo "" >> "$DRIFT_REPORT"
done

echo "漂移检测完成，报告: $DRIFT_REPORT"
```

### 15.5 云间灾备切换SOP

#### 15.5.1 多云灾备架构

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   主云 (AWS)          │     │   备云 (阿里云)        │     │   备云 (腾讯云)        │
│                      │     │                      │     │                      │
│  ┌────────────────┐  │     │  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ EKS集群(活跃)   │  │     │  │ ACK集群(热备)   │  │     │  │ TKE集群(冷备)   │  │
│  └────────────────┘  │     │  └────────────────┘  │     │  └────────────────┘  │
│  ┌────────────────┐  │     │  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ RDS PG(主)      │──┼─流复制→│ RDS PG(从)      │  │     │  │ TDSQL-C(从)    │  │
│  └────────────────┘  │     │  └────────────────┘  │     │  └────────────────┘  │
│  ┌────────────────┐  │     │  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ ElastiCache     │──┼─同步──→│ 云Redis         │  │     │  │ 云Redis        │  │
│  └────────────────┘  │     │  └────────────────┘  │     │  └────────────────┘  │
│  ┌────────────────┐  │     │  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ S3              │──┼─跨区复制→│ OSS             │  │     │  │ COS            │  │
│  └────────────────┘  │     │  └────────────────┘  │     │  └────────────────┘  │
│                      │     │                      │     │                      │
│  流量: 100%          │     │  流量: 0%            │     │  流量: 0%            │
└──────────┬───────────┘     └──────────┬───────────┘     └──────────┬───────────┘
           │                            │                            │
           └────────────────────────────┼────────────────────────────┘
                                        │
                                 ┌──────▼──────┐
                                 │  全局DNS/CDN  │
                                 │  流量调度      │
                                 └─────────────┘
```

#### 15.5.2 灾备切换SOP

**P0级 — 主云完全不可用（自动切换）**

| 步骤 | 操作 | 负责人 | 时限 |
|-----|------|-------|------|
| 1 | 健康检查连续3次失败触发告警 | 自动 | 1分钟 |
| 2 | 自动提升备云数据库为主库 | 自动 | 2分钟 |
| 3 | DNS权重切换（主云→备云） | 自动 | 3分钟 |
| 4 | 备云K8s集群扩容至生产规模 | 自动 | 5分钟 |
| 5 | 验证核心API可用性 | 自动 | 2分钟 |
| 6 | 通知运维团队 | 自动 | 即时 |
| 7 | 人工验证业务功能 | 运维 | 15分钟 |
| 8 | 撰写事故报告 | 运维负责人 | 24小时 |

**P1级 — 主云部分降级（人工决策）**

| 步骤 | 操作 | 负责人 | 时限 |
|-----|------|-------|------|
| 1 | 确认降级范围和影响 | 运维 | 5分钟 |
| 2 | 评估是否需要切换 | 运维负责人 | 10分钟 |
| 3 | 备云数据库提升为主库 | DBA | 5分钟 |
| 4 | DNS流量按比例切换 | 运维 | 5分钟 |
| 5 | 监控备云服务稳定性 | 运维 | 持续 |
| 6 | 主云恢复后回切 | 运维 | 视情况 |

**P2级 — 计划内切换（维护窗口）**

| 步骤 | 操作 | 负责人 |
|-----|------|-------|
| 1 | 提前24小时通知所有相关方 | 运维负责人 |
| 2 | 确认备云环境就绪 | 运维 |
| 3 | 数据同步验证 | DBA |
| 4 | 低峰期执行DNS切换 | 运维 |
| 5 | 监控30分钟确认稳定 | 运维 |
| 6 | 完成维护后回切 | 运维 |

#### 15.5.3 DNS切换脚本

```bash
#!/bin/bash
# cloud-failover.sh — 云间灾备切换脚本
# 用法: bash cloud-failover.sh <target-cloud> [--dry-run]

set -euo pipefail

TARGET_CLOUD="${1:-}"
DRY_RUN="${2:-}"

if [ -z "$TARGET_CLOUD" ]; then
    echo "用法: $0 <aws|alicloud|tencentcloud> [--dry-run]"
    exit 1
fi

echo "===== 云间灾备切换 ====="
echo "目标云: $TARGET_CLOUD"
echo "模式: ${DRY_RUN:-execute}"
echo ""

CLOUD_ENDPOINTS={
    "aws": "app-aws.mindbridge.com",
    "alicloud": "app-alicloud.mindbridge.com",
    "tencentcloud": "app-tencentcloud.mindbridge.com"
}

TARGET_ENDPOINT=${CLOUD_ENDPOINTS[$TARGET_CLOUD]}

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "[DRY-RUN] 将切换DNS指向: $TARGET_ENDPOINT"
    echo "[DRY-RUN] 将更新Route53/云DNS记录"
    echo "[DRY-RUN] 将等待DNS传播（预计1-5分钟）"
    exit 0
fi

echo "[Step 1] 验证目标云健康状态..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://${TARGET_ENDPOINT}/health" || echo "000")
if [ "$HEALTH_STATUS" != "200" ]; then
    echo "❌ 目标云健康检查失败: HTTP $HEALTH_STATUS"
    echo "中止切换！"
    exit 1
fi
echo "✅ 目标云健康检查通过"

echo "[Step 2] 提升目标云数据库为主库..."
echo "  执行: pg_ctl promote (目标云备库)"
echo "  ⚠️ 此操作需要DBA确认"

echo "[Step 3] 切换DNS记录..."
echo "  更新 app.mindbridge.com → $TARGET_ENDPOINT"
echo "  TTL设置为60秒以加速传播"

echo "[Step 4] 扩容目标云K8s集群..."
echo "  调整节点池到生产规模"

echo "[Step 5] 验证核心API..."
API_PATHS=("/api/v1/health" "/api/v1/auth/status" "/api/v1/assessments")
for path in "${API_PATHS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://app.mindbridge.com${path}" || echo "000")
    if [ "$STATUS" = "200" ]; then
        echo "  ✅ $path → $STATUS"
    else
        echo "  ❌ $path → $STATUS"
    fi
done

echo ""
echo "===== 切换完成 ====="
echo "请持续监控30分钟确认稳定"
```

---

## 16. 部署检查清单

### 16.1 部署前检查

#### 基础设施

- [ ] K8s集群健康（`kubectl get nodes` → 所有Ready）
- [ ] 存储卷充足（PV/PVC状态正常）
- [ ] 网络策略已配置（Security Group/NetworkPolicy）
- [ ] DNS解析正确（`dig app.mindbridge.com`）
- [ ] SSL证书有效且未临近过期
- [ ] NTP同步正常（节点间时间差≤1s）
- [ ] GPU节点驱动就绪（`nvidia-smi`）

#### 依赖服务

- [ ] PostgreSQL主从复制正常（`pg_stat_replication`）
- [ ] Redis集群所有slot覆盖
- [ ] RabbitMQ队列无积压
- [ ] Kafka Topic已创建且消费者组正常
- [ ] MinIO所有节点在线
- [ ] Keycloak服务正常
- [ ] 消息队列连接测试通过

#### 应用配置

- [ ] 镜像版本正确（与发布tag一致）
- [ ] 环境变量已更新（ConfigMap/Secret）
- [ ] 数据库迁移脚本已执行
- [ ] 功能开关配置正确
- [ ] 限流/熔断配置正确

#### 安全合规

- [ ] SAST扫描通过（无阻断级问题）
- [ ] 容器镜像扫描通过（无高危漏洞）
- [ ] 渗透测试通过（发布前）
- [ ] 敏感信息已加密（Vault/Secrets）
- [ ] 审计日志已启用

#### 监控告警

- [ ] Prometheus抓取正常
- [ ] Grafana Dashboard可用
- [ ] 告警规则已加载
- [ ] 通知渠道已配置并测试
- [ ] 日志收集正常（ELK）

### 16.2 部署后检查

- [ ] 所有Pod Running且Ready
- [ ] 健康检查端点返回200
- [ ] API关键路径冒烟测试通过
- [ ] 错误率<0.1%（5分钟内）
- [ ] 延迟P95<500ms
- [ ] 数据库连接池正常
- [ ] 缓存命中率正常
- [ ] 消息队列消费正常
- [ ] AI推理服务响应正常
- [ ] 监控指标采集正常
- [ ] 备份任务正常执行

### 16.3 回滚检查

- [ ] 回滚决策已确认（由PM/Tech Lead批准）
- [ ] 回滚前数据已备份
- [ ] 回滚命令执行成功
- [ ] 回滚后服务验证通过
- [ ] 回滚原因已记录

---

## 17. 环境变量配置参考

### 17.1 通用环境变量

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `NODE_ENV` | 运行环境 | `production` | ✅ |
| `LOG_LEVEL` | 日志级别 | `info` / `debug` / `warn` / `error` | ✅ |
| `TZ` | 时区 | `Asia/Shanghai` | ✅ |

### 17.2 数据库配置

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `DB_HOST` | 数据库主机 | `10.0.1.10` | ✅ |
| `DB_PORT` | 数据库端口 | `5432` | ✅ |
| `DB_NAME` | 数据库名 | `mindbridge` | ✅ |
| `DB_USER` | 数据库用户 | `mindbridge_app` | ✅ |
| `DB_PASSWORD` | 数据库密码 | `<from Vault>` | ✅ |
| `DB_MAX_CONNECTIONS` | 最大连接数 | `50` | |
| `DB_SSL_MODE` | SSL模式 | `require` / `verify-full` | |
| `REDIS_URL` | Redis连接串 | `redis://:password@10.0.1.20:6379/0` | ✅ |
| `REDIS_MAX_CONNECTIONS` | 最大连接数 | `20` | |

### 17.3 AI服务配置

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `AI_INFERENCE_URL` | AI推理服务地址 | `http://ai-inference:8501` | ✅ |
| `AI_MODEL_VERSION` | 模型版本 | `v1.2.0` | ✅ |
| `AI_TIMEOUT_MS` | 推理超时时间 | `5000` | |
| `AI_MAX_BATCH_SIZE` | 最大批处理大小 | `32` | |
| `AI_CACHE_ENABLED` | 是否启用推理缓存 | `true` | |
| `AI_FALLBACK_TO_CPU` | GPU故障时降级CPU | `true` | |

### 17.4 认证与密钥

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `KEYCLOAK_URL` | Keycloak地址 | `https://auth.mindbridge.com` | ✅ |
| `KEYCLOAK_REALM` | Keycloak Realm | `mindbridge` | ✅ |
| `KEYCLOAK_CLIENT_ID` | OAuth客户端ID | `mindbridge-app` | ✅ |
| `KEYCLOAK_CLIENT_SECRET` | OAuth客户端密钥 | `<from Vault>` | ✅ |
| `JWT_SECRET` | JWT签名密钥 | `<from Vault>` | ✅ |
| `JWT_EXPIRATION` | JWT过期时间 | `3600` | |
| `ENCRYPTION_KEY` | 数据加密密钥 | `<from Vault>` | ✅ |

### 17.5 通知服务配置

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `SMTP_HOST` | SMTP服务器 | `smtp.example.com` | ✅ |
| `SMTP_PORT` | SMTP端口 | `587` | ✅ |
| `SMTP_USER` | SMTP用户 | `noreply@mindbridge.com` | ✅ |
| `SMTP_PASSWORD` | SMTP密码 | `<from Vault>` | ✅ |
| `SMS_PROVIDER` | 短信服务商 | `aliyun` / `tencent` | |
| `SMS_ACCESS_KEY` | 短信AccessKey | `<from Vault>` | |
| `SMS_SECRET_KEY` | 短信SecretKey | `<from Vault>` | |
| `PUSH_ENABLED` | Push通知开关 | `true` | |

### 17.6 对象存储配置

| 变量名 | 说明 | 示例值 | 必填 |
|-------|------|-------|------|
| `MINIO_ENDPOINT` | MinIO端点 | `minio.infra.svc:9000` | ✅ |
| `MINIO_ACCESS_KEY` | MinIO AccessKey | `<from Vault>` | ✅ |
| `MINIO_SECRET_KEY` | MinIO SecretKey | `<from Vault>` | ✅ |
| `MINIO_BUCKET` | 默认Bucket | `mindbridge-assessments` | |
| `MINIO_USE_SSL` | 是否使用SSL | `true` | |
| `AWS_REGION` | AWS区域 | `ap-northeast-1` | ☁️ |
| `AWS_S3_BUCKET` | S3 Bucket名称 | `mindbridge-prod` | ☁️ |

### 17.7 K8s Secret管理（推荐方案）

```yaml
# 使用External Secrets Operator + Vault/云KMS
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: mindbridge-secrets
  namespace: mindbridge-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: SecretStore
  target:
    name: mindbridge-secrets
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: mindbridge/prod/database
        property: password
    - secretKey: JWT_SECRET
      remoteRef:
        key: mindbridge/prod/jwt
        property: secret
    - secretKey: ENCRYPTION_KEY
      remoteRef:
        key: mindbridge/prod/encryption
        property: key
    - secretKey: KEYCLOAK_CLIENT_SECRET
      remoteRef:
        key: mindbridge/prod/keycloak
        property: client-secret
```

### 17.8 完整环境变量模板

```bash
# .env.production — 完整参考模板
# ============================================
# 通用
# ============================================
NODE_ENV=production
LOG_LEVEL=info
TZ=Asia/Shanghai

# ============================================
# 数据库
# ============================================
DB_HOST=10.0.1.10
DB_PORT=5432
DB_NAME=mindbridge
DB_USER=mindbridge_app
DB_PASSWORD=<vault:mindbridge/prod/database/password>
DB_MAX_CONNECTIONS=50
DB_SSL_MODE=require
REDIS_URL=redis://:password@10.0.1.20:6379/0
REDIS_MAX_CONNECTIONS=20

# ============================================
# AI服务
# ============================================
AI_INFERENCE_URL=http://ai-inference.ai-serving.svc:8501
AI_MODEL_VERSION=v1.2.0
AI_TIMEOUT_MS=5000
AI_MAX_BATCH_SIZE=32
AI_CACHE_ENABLED=true
AI_FALLBACK_TO_CPU=true

# ============================================
# 认证
# ============================================
KEYCLOAK_URL=https://auth.mindbridge.com
KEYCLOAK_REALM=mindbridge
KEYCLOAK_CLIENT_ID=mindbridge-app
KEYCLOAK_CLIENT_SECRET=<vault:mindbridge/prod/keycloak/client-secret>
JWT_SECRET=<vault:mindbridge/prod/jwt/secret>
JWT_EXPIRATION=3600
ENCRYPTION_KEY=<vault:mindbridge/prod/encryption/key>

# ============================================
# 对象存储
# ============================================
STORAGE_TYPE=minio  # minio | s3 | oss | cos
MINIO_ENDPOINT=minio.infra.svc:9000
MINIO_ACCESS_KEY=<vault:mindbridge/prod/minio/access-key>
MINIO_SECRET_KEY=<vault:mindbridge/prod/minio/secret-key>
MINIO_BUCKET=mindbridge-assessments
MINIO_USE_SSL=true

# ============================================
# 通知
# ============================================
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@mindbridge.com
SMTP_PASSWORD=<vault:mindbridge/prod/smtp/password>
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY=<vault:mindbridge/prod/sms/access-key>
SMS_SECRET_KEY=<vault:mindbridge/prod/sms/secret-key>

# ============================================
# 监控
# ============================================
OTEL_SERVICE_NAME=mindbridge
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.monitoring.svc:4317
METRICS_ENABLED=true
```

---

## 附录

### A. 常用运维命令速查

```bash
# K8s基础
kubectl get pods -n mindbridge-prod -o wide
kubectl get svc -n mindbridge-prod
kubectl get ingress -n mindbridge-prod
kubectl describe pod <pod> -n mindbridge-prod
kubectl logs -f <pod> -n mindbridge-prod --tail=100
kubectl exec -it <pod> -n mindbridge-prod -- sh
kubectl top nodes
kubectl top pods -n mindbridge-prod

# 滚动更新
kubectl set image deployment/<name> <container>=<new-image> -n mindbridge-prod
kubectl rollout status deployment/<name> -n mindbridge-prod
kubectl rollout undo deployment/<name> -n mindbridge-prod
kubectl rollout history deployment/<name> -n mindbridge-prod

# Helm
helm list -A
helm status <release> -n <namespace>
helm upgrade <release> ./chart -n <namespace> -f values.yaml
helm rollback <release> <revision> -n <namespace>

# 数据库
pg_dump -h <host> -U <user> -d mindbridge --format=custom -f backup.dump
pg_restore -h <host> -U <user> -d mindbridge --clean backup.dump

# Redis
redis-cli -h <host> -a <password> --cluster check <host>:6379
redis-cli -h <host> -a <password> INFO replication

# 证书
openssl x509 -in /etc/nginx/ssl/mindbridge.crt -text -noout
certbot renew --dry-run
```

### B. 端口速查表

| 服务 | 端口 | 协议 | 说明 |
|-----|------|------|------|
| Nginx HTTP | 80 | TCP | 重定向HTTPS |
| Nginx HTTPS | 443 | TCP | Web/API入口 |
| Next.js | 3000 | TCP | Web前端 |
| Kong/APISIX | 8000 | TCP | API网关 |
| Keycloak | 8080 | TCP | 认证服务 |
| PostgreSQL | 5432 | TCP | 数据库 |
| PgBouncer | 6432 | TCP | 连接池 |
| Redis | 6379 | TCP | 缓存 |
| Redis Cluster Bus | 16379 | TCP | 集群总线 |
| RabbitMQ AMQP | 5672 | TCP | 消息队列 |
| RabbitMQ Management | 15672 | TCP | 管理界面 |
| Kafka Broker | 9092 | TCP | 事件流消息队列 |
| Zookeeper | 2181 | TCP | Kafka协调服务 |
| MinIO API | 9000 | TCP | 对象存储 |
| MinIO Console | 9001 | TCP | 管理界面 |
| AI Inference CPU | 8501 | TCP | CPU推理 |
| AI Inference GPU | 8502 | TCP | GPU推理 |
| Prometheus | 9090 | TCP | 指标采集 |
| Grafana | 3000 | TCP | 可视化面板 |
| Elasticsearch | 9200 | TCP | 搜索引擎 |
| Kibana | 5601 | TCP | 日志可视化 |
| Jaeger UI | 16686 | TCP | 追踪可视化 |

### C. 缩略语表

| 缩略语 | 全称 | 中文 |
|-------|------|------|
| VPC | Virtual Private Cloud | 虚拟私有云 |
| ALB | Application Load Balancer | 应用型负载均衡 |
| EKS | Elastic Kubernetes Service | AWS托管K8s |
| ACK | Container Service for Kubernetes | 阿里云K8s |
| TKE | Tencent Kubernetes Engine | 腾讯云K8s |
| IaC | Infrastructure as Code | 基础设施即代码 |
| HPA | Horizontal Pod Autoscaler | 水平自动扩缩容 |
| PVC/PV | Persistent Volume Claim / Persistent Volume | 持久化卷 |
| WAF | Web Application Firewall | Web应用防火墙 |
| RPO | Recovery Point Objective | 恢复点目标 |
| RTO | Recovery Time Objective | 恢复时间目标 |
| SOP | Standard Operating Procedure | 标准操作规程 |
| OTEL | OpenTelemetry | 可观测性框架 |
| SLO | Service Level Objective | 服务级别目标 |

---

*文档结束 — MindBridge-Assist 平台部署手册 V2.0*
