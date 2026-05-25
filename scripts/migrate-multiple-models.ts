/**
 * 迁移脚本：支持一个 API Key 配置多个模型
 * 
 * 变更：
 * 1. 将 api_keys.model 字段改为 models（JSON 数组）
 * 2. 迁移现有数据
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const dbPath = join(projectRoot, 'data', 'api-gateway.db');

console.log('📦 开始迁移：支持多模型配置\n');
console.log('=' .repeat(80));

const db = new Database(dbPath);

try {
	// 禁用外键约束
	db.exec('PRAGMA foreign_keys = OFF');
	
	// 开始事务
	db.exec('BEGIN TRANSACTION');
	
	console.log('\n1️⃣ 检查当前表结构...');
	
	// 检查是否已经有 models 字段
	const tableInfo = db.prepare("PRAGMA table_info(api_keys)").all() as any[];
	const hasModelsField = tableInfo.some((col: any) => col.name === 'models');
	
	if (hasModelsField) {
		console.log('✅ models 字段已存在，跳过迁移');
		db.exec('ROLLBACK');
		db.close();
		process.exit(0);
	}
	
	console.log('✅ 当前表结构检查完成');
	
	console.log('\n2️⃣ 获取现有数据...');
	
	// 获取所有现有的 API Key 配置
	const existingKeys = db.prepare(`
		SELECT id, name, provider, base_url, api_key, model, is_active, is_default, priority, created_at, updated_at
		FROM api_keys
	`).all();
	
	console.log(`✅ 找到 ${existingKeys.length} 条现有配置`);
	
	console.log('\n3️⃣ 创建新表结构...');
	
	// 创建新表（带 models 字段）
	db.exec(`
		CREATE TABLE api_keys_new (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			base_url TEXT NOT NULL,
			api_key TEXT NOT NULL,
			models TEXT NOT NULL,  -- JSON 数组，如 ["gpt-4o", "gpt-4o-mini"]
			is_active INTEGER DEFAULT 1 NOT NULL,
			is_default INTEGER DEFAULT 0 NOT NULL,
			priority INTEGER DEFAULT 0 NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER
		)
	`);
	
	console.log('✅ 新表创建完成');
	
	console.log('\n4️⃣ 迁移数据...');
	
	// 迁移数据：将单个 model 转换为 models 数组
	const insertStmt = db.prepare(`
		INSERT INTO api_keys_new (id, name, provider, base_url, api_key, models, is_active, is_default, priority, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	
	for (const key of existingKeys as any[]) {
		// 将单个 model 转换为数组
		const models = JSON.stringify([key.model]);
		
		insertStmt.run(
			key.id,
			key.name,
			key.provider,
			key.base_url,
			key.api_key,
			models,
			key.is_active,
			key.is_default,
			key.priority,
			key.created_at,
			key.updated_at
		);
		
		console.log(`   ✅ ${key.name}: "${key.model}" -> ${models}`);
	}
	
	console.log(`✅ ${existingKeys.length} 条数据迁移完成`);
	
	console.log('\n5️⃣ 替换旧表...');
	
	// 删除旧表
	db.exec('DROP TABLE api_keys');
	
	// 重命名新表
	db.exec('ALTER TABLE api_keys_new RENAME TO api_keys');
	
	console.log('✅ 表替换完成');
	
	console.log('\n6️⃣ 重建索引...');
	
	// 重建索引
	db.exec(`
		CREATE INDEX api_keys_provider_idx ON api_keys(provider);
		CREATE INDEX api_keys_is_active_idx ON api_keys(is_active);
		CREATE INDEX api_keys_is_default_idx ON api_keys(is_default);
		CREATE INDEX api_keys_priority_idx ON api_keys(priority);
	`);
	
	console.log('✅ 索引重建完成');
	
	// 提交事务
	db.exec('COMMIT');
	
	// 重新启用外键约束
	db.exec('PRAGMA foreign_keys = ON');
	
	console.log('\n' + '=' .repeat(80));
	console.log('✅ 迁移成功完成！\n');
	
	// 显示迁移后的数据
	console.log('📋 迁移后的配置:\n');
	const newKeys = db.prepare(`
		SELECT id, name, provider, models, is_active, is_default, priority
		FROM api_keys
		ORDER BY priority DESC, is_default DESC, created_at ASC
	`).all();
	
	newKeys.forEach((key: any, index: number) => {
		const models = JSON.parse(key.models);
		const badges = [];
		if (key.is_default) badges.push('默认');
		if (key.priority > 0) badges.push(`优先级: ${key.priority}`);
		
		console.log(`${index + 1}. ${key.name}${badges.length > 0 ? ` [${badges.join(', ')}]` : ''}`);
		console.log(`   Provider: ${key.provider}`);
		console.log(`   Models: ${models.join(', ')}`);
		console.log('');
	});
	
	console.log('💡 提示：');
	console.log('  - 现在可以为每个配置添加多个模型');
	console.log('  - 在管理页面编辑配置时，可以添加/删除模型');
	console.log('  - 模型匹配逻辑会自动适配多模型配置');
	
} catch (error) {
	console.error('\n❌ 迁移失败:', error);
	db.exec('ROLLBACK');
	process.exit(1);
} finally {
	db.close();
}
