# 更新日志

## [2.0.0] - 2025-05-08

### 🎉 重大变更

#### 从 Supabase 迁移到 SQLite

项目已从云端 Supabase 数据库迁移到本地 SQLite 数据库，实现完全本地化部署。

### ✨ 新增功能

- **本地 SQLite 数据库** - 使用 better-sqlite3 驱动
- **Drizzle ORM** - 类型安全的数据库查询
- **自动初始化** - 首次启动自动创建数据库表
- **数据库管理脚本** - 提供初始化和管理工具
- **Windows 原生支持** - 所有脚本改为 PowerShell

### 🔄 变更内容

#### 依赖变更

**移除：**
- `@supabase/supabase-js` - Supabase 客户端
- `pg` - PostgreSQL 驱动
- `@types/pg` - PostgreSQL 类型

**新增：**
- `better-sqlite3@11.10.0` - SQLite 驱动
- `@types/better-sqlite3@7.6.13` - SQLite 类型定义

#### 文件变更

**新建：**
- `src/storage/database/sqlite-client.ts` - SQLite 数据库客户端
- `scripts/init-db.ts` - 数据库初始化脚本
- `scripts/init-db.ps1` - Windows 初始化脚本
- `scripts/dev.ps1` - Windows 开发脚本
- `scripts/build.ps1` - Windows 构建脚本
- `scripts/start.ps1` - Windows 启动脚本
- `drizzle.config.ts` - Drizzle ORM 配置
- `MIGRATION.md` - 迁移指南
- `README-WINDOWS.md` - Windows 使用指南

**修改：**
- `src/storage/database/shared/schema.ts` - 从 PostgreSQL 改为 SQLite schema
- `src/lib/api-utils.ts` - 使用 Drizzle ORM 查询
- `src/app/api/keys/route.ts` - 使用新的数据库客户端
- `src/app/api/logs/route.ts` - 使用新的数据库客户端
- `package.json` - 更新依赖和脚本
- `.gitignore` - 添加数据库文件忽略规则
- `README.md` - 更新文档

**删除：**
- `src/storage/database/supabase-client.ts` - 不再需要

### 📊 数据库变更

#### Schema 变更

| 表名 | 变更 | 说明 |
|------|------|------|
| `api_keys` | 类型调整 | UUID 使用 TEXT，布尔值使用 INTEGER |
| `api_call_logs` | 类型调整 | JSON 字段改为 TEXT 存储 |

#### 索引保持不变

所有索引都已迁移到 SQLite：
- `api_keys_provider_idx`
- `api_keys_is_active_idx`
- `api_keys_is_default_idx`
- `api_call_logs_provider_idx`
- `api_call_logs_model_idx`
- `api_call_logs_created_at_idx`
- `api_call_logs_api_key_id_idx`

### 🚀 性能优化

- **WAL 模式** - 启用 Write-Ahead Logging 提高并发性能
- **本地访问** - 无网络延迟，查询速度更快
- **自动索引** - 所有关键字段都有索引

### 🔧 开发体验改进

- **零配置** - 无需配置环境变量或连接字符串
- **快速启动** - 首次启动自动创建数据库
- **简单备份** - 直接复制数据库文件即可
- **Windows 友好** - 所有脚本使用 PowerShell

### 📝 文档更新

- 新增 `MIGRATION.md` - 详细的迁移指南
- 新增 `README-WINDOWS.md` - Windows 环境配置
- 更新 `README.md` - 完整的使用文档
- 新增 `CHANGELOG.md` - 更新日志

### ⚠️ 破坏性变更

1. **环境变量**
   - 移除：`COZE_SUPABASE_URL`
   - 移除：`COZE_SUPABASE_ANON_KEY`
   - 移除：`COZE_SUPABASE_SERVICE_ROLE_KEY`
   - 新增（可选）：`DATABASE_PATH`

2. **数据库位置**
   - 之前：Supabase 云端
   - 现在：`data/api-gateway.db` 本地文件

3. **部署方式**
   - 之前：需要 Supabase 账号和配置
   - 现在：直接运行，无需外部服务

### 🔄 迁移步骤

如果你从旧版本升级：

1. 安装依赖：`pnpm install`
2. 初始化数据库：`pnpm tsx scripts/init-db.ts`
3. 启动服务器：`pnpm run dev`
4. 重新配置 API Keys

详细迁移指南请查看 [MIGRATION.md](./MIGRATION.md)

### 🐛 修复问题

- 修复 Windows 环境下 esbuild 平台不匹配问题
- 修复 PowerShell 脚本编码问题
- 修复数据库连接池问题

### 📦 依赖版本

- Node.js: >= 22.0.0
- pnpm: >= 9.0.0
- Next.js: 16.1.1
- React: 19.2.3
- TypeScript: 5.9.3
- Drizzle ORM: 0.45.1
- better-sqlite3: 11.10.0

### 🎯 下一步计划

- [ ] 添加数据库备份功能
- [ ] 添加日志自动清理功能
- [ ] 添加数据导入/导出工具
- [ ] 添加 API 认证功能
- [ ] 添加请求限流功能
- [ ] 添加更多 AI 服务商支持

---

## [1.0.0] - 2025-05-07

### 初始版本

- 基于 Supabase 的 API Gateway
- 支持多个 AI 服务商
- API Key 管理
- 调用日志记录
- 统计分析功能
