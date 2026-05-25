import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './shared/schema';
import path from 'path';
import fs from 'fs';

let db: BetterSQLite3Database<typeof schema> | null = null;

/**
 * 获取 SQLite 数据库实例
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
	if (db) {
		return db;
	}

	// 确定数据库文件路径
	const dbDir = path.join(process.cwd(), 'data');
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
	}

	const dbPath = path.join(dbDir, 'api-gateway.db');
	console.log(`📦 使用 SQLite 数据库: ${dbPath}`);

	// 创建 SQLite 连接
	const sqlite = new Database(dbPath);
	
	// 启用 WAL 模式以提高并发性能
	sqlite.pragma('journal_mode = WAL');
	
	// 创建 Drizzle 实例
	db = drizzle(sqlite, { schema });

	// 初始化数据库表
	initDatabase(sqlite);

	return db;
}

/**
 * 初始化数据库表结构
 */
function initDatabase(sqlite: Database.Database) {
	// 创建 api_keys 表
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS api_keys (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			base_url TEXT NOT NULL,
			api_key TEXT NOT NULL,
			model TEXT NOT NULL,
			is_active INTEGER DEFAULT 1 NOT NULL,
			is_default INTEGER DEFAULT 0 NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER
		);
	`);

	// 创建 api_keys 索引
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS api_keys_provider_idx ON api_keys(provider);
		CREATE INDEX IF NOT EXISTS api_keys_is_active_idx ON api_keys(is_active);
		CREATE INDEX IF NOT EXISTS api_keys_is_default_idx ON api_keys(is_default);
	`);

	// 创建 api_call_logs 表
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS api_call_logs (
			id TEXT PRIMARY KEY,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			api_key_id TEXT,
			endpoint TEXT NOT NULL,
			request_method TEXT NOT NULL,
			request_headers TEXT,
			request_body TEXT,
			request_tokens INTEGER,
			response_status INTEGER,
			response_body TEXT,
			response_tokens INTEGER,
			total_tokens INTEGER,
			duration_ms INTEGER,
			error_message TEXT,
			ip_address TEXT,
			user_agent TEXT,
			created_at INTEGER NOT NULL,
			FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
		);
	`);

	// 创建 api_call_logs 索引
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS api_call_logs_provider_idx ON api_call_logs(provider);
		CREATE INDEX IF NOT EXISTS api_call_logs_model_idx ON api_call_logs(model);
		CREATE INDEX IF NOT EXISTS api_call_logs_created_at_idx ON api_call_logs(created_at);
		CREATE INDEX IF NOT EXISTS api_call_logs_api_key_id_idx ON api_call_logs(api_key_id);
	`);

	console.log('✅ 数据库表初始化完成');
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
	if (db) {
		// better-sqlite3 会自动关闭
		db = null;
		console.log('🔒 数据库连接已关闭');
	}
}
