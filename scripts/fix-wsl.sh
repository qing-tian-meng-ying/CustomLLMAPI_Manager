#!/bin/bash
# 修复 WSL 环境下的 esbuild 平台问题

echo "🔧 修复 WSL 环境下的依赖问题..."
echo ""

# 删除 node_modules 和锁文件
echo "📦 清理现有依赖..."
rm -rf node_modules
rm -f pnpm-lock.yaml

# 在 WSL 环境中重新安装
echo "📥 在 WSL 环境中重新安装依赖..."
pnpm install

echo ""
echo "✅ 修复完成！现在可以运行 pnpm run dev"
