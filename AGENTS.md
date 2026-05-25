# AI API Gateway - 项目规范

## 项目概览

统一大模型 API 分发与调用记录系统，支持多渠道 AI 服务商（OpenAI、Claude、DeepSeek、Zhipu 等）的 API 统一管理、路由分发和完整调用日志记录。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)

## 目录结构

```
src/
├── app/                    # 页面路由
│   ├── api/               # API 路由
│   │   ├── v1/chat/completions/  # 统一聊天完成接口
│   │   ├── keys/          # API Key 管理接口
│   │   ├── logs/          # 调用日志接口
│   │   └── stats/         # 统计数据接口
│   ├── keys/              # Key 管理页面
│   ├── logs/              # 日志查看页面
│   ├── test/              # API 测试页面
│   └── page.tsx           # 首页仪表盘
├── storage/database/       # 数据库配置
└── components/ui/         # UI 组件库
```

## 核心 API

### 1. 聊天完成接口
- **POST** `/api/v1/chat/completions`
- 支持 OpenAI 兼容格式的聊天完成请求
- 自动路由到配置的 AI 服务商
- 完整记录请求/响应

### 2. API Key 管理
- **GET** `/api/keys` - 获取所有 Key
- **POST** `/api/keys` - 创建新 Key
- **PUT** `/api/keys` - 更新 Key
- **DELETE** `/api/keys?id=xxx` - 删除 Key

### 3. 调用日志
- **GET** `/api/logs` - 获取日志列表（支持分页、筛选）
- **GET** `/api/logs/[id]` - 获取单条日志详情

### 4. 统计
- **GET** `/api/stats` - 获取调用统计数据

## 数据库表

### api_keys
| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | UUID 主键 |
| name | varchar(100) | Key 名称 |
| provider | varchar(50) | 服务商 |
| base_url | varchar(500) | API 地址 |
| api_key | text | API Key |
| model | varchar(100) | 默认模型 |
| is_active | boolean | 是否启用 |
| is_default | boolean | 是否默认 |
| created_at | timestamp | 创建时间 |

### api_call_logs
| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | UUID 主键 |
| provider | varchar(50) | 服务商 |
| model | varchar(100) | 模型 |
| request_body | jsonb | 完整请求体 |
| response_body | jsonb | 完整响应体 |
| request_tokens | integer | 请求 tokens |
| response_tokens | integer | 响应 tokens |
| total_tokens | integer | 总 tokens |
| duration_ms | integer | 耗时 |
| error_message | text | 错误信息 |
| created_at | timestamp | 创建时间 |

## 常用命令

- 安装依赖: `pnpm install`
- 开发模式: `pnpm dev` (端口 5000)
- 类型检查: `pnpm ts-check`
- 代码检查: `pnpm lint`

## 支持的服务商

- OpenAI (https://api.openai.com/v1)
- Anthropic/Claude (https://api.anthropic.com)
- DeepSeek (https://api.deepseek.com)
- Zhipu AI (https://open.bigmodel.cn/api/paas/v4)
- 自定义 (用户配置)

## 使用方式

### 1. 添加 API Key
访问 `/keys` 页面，配置各服务商的 API Key

### 2. 测试 API
访问 `/test` 页面，选择 Key 并发送测试请求

### 3. 查看日志
访问 `/logs` 页面，查看所有调用记录及详情

### 4. 调用统一接口
```bash
curl -X POST http://localhost:5000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY_ID" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```
