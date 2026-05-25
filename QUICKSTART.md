# 快速开始指南

5 分钟快速上手 AI API Gateway！

## 📋 前置要求

- Node.js 22+
- pnpm 9+
- Windows 10/11

## 🚀 快速开始

### 1️⃣ 克隆或下载项目

```powershell
cd E:\project\API
```

### 2️⃣ 安装依赖

```powershell
pnpm install
```

⏱️ 预计耗时：1-2 分钟

### 3️⃣ 初始化数据库

```powershell
pnpm tsx scripts/init-db.ts
```

✅ 这将创建：
- `data/api-gateway.db` - SQLite 数据库文件
- 数据库表和索引
- 2 个示例 API Key（未激活）

### 4️⃣ 启动开发服务器

```powershell
pnpm run dev
```

🎉 服务器启动在：http://localhost:5000

## 🎯 第一次使用

### 步骤 1：添加你的第一个 API Key

1. 访问：http://localhost:5000/keys
2. 点击"添加 API Key"按钮
3. 填写信息：

```
名称：我的 OpenAI Key
服务商：openai
Base URL：https://api.openai.com/v1
API Key：sk-your-actual-api-key-here
默认模型：gpt-4o-mini
```

4. 勾选"启用"和"设为默认"
5. 点击"保存"

### 步骤 2：测试 API

1. 访问：http://localhost:5000/test
2. 选择刚才添加的 API Key
3. 输入测试消息："Hello, how are you?"
4. 点击"发送"

✅ 如果看到 AI 的回复，说明配置成功！

### 步骤 3：查看调用日志

1. 访问：http://localhost:5000/logs
2. 查看刚才的测试调用记录
3. 点击记录可以查看详细信息

### 步骤 4：查看统计数据

1. 访问：http://localhost:5000
2. 查看调用次数、Token 使用量等统计

## 🔌 使用统一 API

现在你可以使用统一的 API 端点调用任何配置的 AI 服务：

```bash
curl -X POST http://localhost:5000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 🎨 支持的 AI 服务商

### OpenAI
```
Base URL: https://api.openai.com/v1
模型: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-preview, o1-mini
```

### Anthropic (Claude)
```
Base URL: https://api.anthropic.com
模型: claude-3-5-sonnet-20241022, claude-3-opus-20240229
```

### DeepSeek
```
Base URL: https://api.deepseek.com
模型: deepseek-chat, deepseek-coder
```

### Zhipu AI (智谱)
```
Base URL: https://open.bigmodel.cn/api/paas/v4
模型: glm-4, glm-4-flash, glm-4-plus
```

### 零一万物 (Yi)
```
Base URL: https://api.lingyiwanwu.com/v1
模型: yi-large, yi-medium, yi-spark
```

### Moonshot (月之暗面)
```
Base URL: https://api.moonshot.cn/v1
模型: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
```

### 阿里云 (通义千问)
```
Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
模型: qwen-turbo, qwen-plus, qwen-max
```

## 📚 常用命令

```powershell
# 开发模式
pnpm run dev

# 构建项目
pnpm run build

# 生产模式
pnpm run start

# 类型检查
pnpm run ts-check

# 代码检查
pnpm run lint

# 重新初始化数据库（会清空数据）
Remove-Item data/api-gateway.db
pnpm tsx scripts/init-db.ts
```

## 🔧 常见问题

### Q: 端口 5000 被占用怎么办？

A: 脚本会自动尝试关闭占用的进程。如果失败，手动关闭：

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### Q: 数据库文件在哪里？

A: `data/api-gateway.db`

### Q: 如何备份数据？

A: 直接复制数据库文件：

```powershell
Copy-Item data/api-gateway.db data/api-gateway.backup.db
```

### Q: 如何查看数据库内容？

A: 使用 SQLite 客户端工具：
- [DB Browser for SQLite](https://sqlitebrowser.org/) - 推荐
- [DBeaver](https://dbeaver.io/)
- [DataGrip](https://www.jetbrains.com/datagrip/)

### Q: API Key 存储安全吗？

A: API Key 存储在本地数据库中，请：
- 不要将 `data/` 目录提交到 Git
- 定期备份数据库文件
- 在生产环境使用 HTTPS
- 考虑添加访问认证

### Q: 如何添加更多 AI 服务商？

A: 只要服务商提供 OpenAI 兼容的 API，就可以直接添加：

1. 访问 `/keys` 页面
2. 添加新的 API Key
3. 填写服务商的 Base URL 和 API Key
4. 选择或输入模型名称

## 📖 更多文档

- [README.md](./README.md) - 完整文档
- [MIGRATION.md](./MIGRATION.md) - 迁移指南
- [README-WINDOWS.md](./README-WINDOWS.md) - Windows 配置
- [CHANGELOG.md](./CHANGELOG.md) - 更新日志

## 🎉 完成！

现在你已经成功配置了 AI API Gateway！

**下一步：**
- 添加更多 AI 服务商的 API Key
- 在你的应用中使用统一的 API 端点
- 查看调用日志和统计数据
- 探索更多功能

**需要帮助？**
- 查看文档
- 提交 Issue
- 查看示例代码

祝使用愉快！🚀
