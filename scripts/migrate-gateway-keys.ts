/**
 * 数据库迁移脚本：添加网关 API Key 功能
 * 
 * 新增功能：
 * 1. gateway_api_keys 表 - 网关自己的 API Key
 * 2. api_keys 表添加 priority 字段
 * 3. api_call_logs 表添加 gateway_key_id 字段
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

const dbPath = join(process.cwd(), 'data', 'api-gateway.db');

if (!existsSync(dbPath)) {
	console.error('❌ 数据库文件不存在:', dbPath);
	console.log('💡 请先运行: pnpm tsx scripts/init-db.ts');
	process.exit(1);
}

const db = new Database(dbPath);

console.log('🔄 开始数据库迁移...\n');

try {
	// 开启事务
	db.exec('BEGIN TRANSACTION');
	
	// 1. 创建网关 API Key 表
	console.log('📋 创建 gateway_api_keys 表...');
	db.exec(`
		CREATE TABLE IF NOT EXISTS gateway_api_keys (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			key TEXT NOT NULL UNIQUE,
			is_active INTEGER NOT NULL DEFAULT 1,
			rate_limit INTEGER,
			total_requests INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			last_used_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER
		)
	`);
	
	db.exec(`CREATE INDEX IF NOT EXISTS gateway_api_keys_key_idx ON gateway_api_keys(key)`);
	db.exec(`CREATE INDEX IF NOT EXISTS gateway_api_keys_is_active_idx ON gateway_api_keys(is_active)`);
	console.log('✅ gateway_api_keys 表创建成功');
	
	// 2. 检查 api_keys 表是否有 priority 字段
	const apiKeysInfo = db.prepare("PRAGMA table_info(api_keys)").all() as any[];
	const hasPriority = apiKeysInfo.some((col: any) => col.name === 'priority');
	
	if (!hasPriority) {
		console.log('\n📋 为 api_keys 表添加 priority 字段...');
		db.exec(`ALTER TABLE api_keys ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`);
		db.exec(`CREATE INDEX IF NOT EXISTS api_keys_priority_idx ON api_keys(priority)`);
		console.log('✅ priority 字段添加成功');
	} else {
		console.log('\n✅ api_keys 表已有 priority 字段');
	}
	
	// 3. 检查 api_call_logs 表是否有 gateway_key_id 字段
	const logsInfo = db.prepare("PRAGMA table_info(api_call_logs)").all() as any[];
	const hasGatewayKeyId = logsInfo.some((col: any) => col.name === 'gateway_key_id');
	
	if (!hasGatewayKeyId) {
		console.log('\n📋 为 api_call_logs 表添加 gateway_key_id 字段...');
		db.exec(`ALTER TABLE api_call_logs ADD COLUMN gateway_key_id TEXT REFERENCES gateway_api_keys(id)`);
		db.exec(`CREATE INDEX IF NOT EXISTS api_call_logs_gateway_key_id_idx ON api_call_logs(gateway_key_id)`);
		console.log('✅ gateway_key_id 字段添加成功');
	} else {
		console.log('\n✅ api_call_logs 表已有 gateway_key_id 字段');
	}
	
	// 4. 创建一个默认的网关 API Key
	console.log('\n📋 创建默认网关 API Key...');
	const defaultKey = 'sk-' + Array.from({ length: 48 }, () => 
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
	).join('');
	
	const existingKeys = db.prepare('SELECT COUNT(*) as count FROM gateway_api_keys').get() as { count: number };
	
	if (existingKeys.count === 0) {
		const now = Math.floor(Date.now() / 1000);
		db.prepare(`
			INSERT INTO gateway_api_keys (id, name, key, is_active, total_requests, total_tokens, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			crypto.randomUUID(),
			'默认网关 Key',
			defaultKey,
			1,
			0,
			0,
			now
		);
		
		console.log('✅ 默认网关 Key 创建成功');
		console.log('\n🔑 网关 API Key:');
		console.log('   ' + defaultKey);
		console.log('\n💡 请妥善保管此 Key，用于调用网关 API');
	} else {
		console.log('✅ 已存在网关 Key，跳过创建');
	}
	
	// 提交事务
	db.exec('COMMIT');
	
	console.log('\n🎉 数据库迁移完成！');
	console.log('\n📊 当前数据库状态:');
	
	const tables = db.prepare(`
		SELECT name FROM sqlite_master 
		WHERE type='table' AND name NOT LIKE 'sqlite_%'
		ORDER BY name
	`).all() as { name: string }[];
	
	console.log('   表列表:');
	tables.forEach(t => console.log(`   - ${t.name}`));
	
	const gatewayKeys = db.prepare('SELECT COUNT(*) as count FROM gateway_api_keys').get() as { count: number };
	const upstreamKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
	const logs = db.prepare('SELECT COUNT(*) as count FROM api_call_logs').get() as { count: number };
	
	console.log('\n   数据统计:');
	console.log(`   - 网关 API Keys: ${gatewayKeys.count}`);
	console.log(`   - 上游 API Keys: ${upstreamKeys.count}`);
	console.log(`   - 调用日志: ${logs.count}`);
	
} catch (error) {
	// 回滚事务
	db.exec('ROLLBACK');
	console.error('\n❌ 迁移失败:', error);
	process.exit(1);
} finally {
	db.close();
}
