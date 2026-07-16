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
	
	// 启用 WAL 模式以提高并发性能，并强制执行外键约束
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	
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
			models TEXT NOT NULL,
			is_active INTEGER DEFAULT 1 NOT NULL,
			is_default INTEGER DEFAULT 0 NOT NULL,
			priority INTEGER DEFAULT 0 NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER
		);
	`);

	// 创建 api_keys 索引
	sqlite.exec(`
		CREATE INDEX IF NOT EXISTS api_keys_provider_idx ON api_keys(provider);
		CREATE INDEX IF NOT EXISTS api_keys_is_active_idx ON api_keys(is_active);
		CREATE INDEX IF NOT EXISTS api_keys_is_default_idx ON api_keys(is_default);
		CREATE INDEX IF NOT EXISTS api_keys_priority_idx ON api_keys(priority);
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

	// 创建模型路由表：同一模型可配置多个上游 Key，priority 数字越小越优先
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS model_routes (
			id TEXT PRIMARY KEY,
			model TEXT NOT NULL,
			model_key TEXT NOT NULL,
			api_key_id TEXT NOT NULL,
			priority INTEGER DEFAULT 1 NOT NULL,
			is_active INTEGER DEFAULT 1 NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER,
			FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS model_routes_model_key_idx ON model_routes(model_key);
		CREATE INDEX IF NOT EXISTS model_routes_api_key_id_idx ON model_routes(api_key_id);
		CREATE INDEX IF NOT EXISTS model_routes_model_priority_idx ON model_routes(model_key, priority);
	`);

	backfillModelRoutes(sqlite);

	console.log('✅ 数据库表初始化完成');
}

/**
 * 将已有 Key 中的模型补录为模型路由，保留已手工设置的优先级。
 */
function backfillModelRoutes(sqlite: Database.Database) {
	const tableInfo = sqlite.prepare('PRAGMA table_info(api_keys)').all() as Array<{ name: string }>;
	if (!tableInfo.some(column => column.name === 'models')) return;

	// 迁移初始顺序沿用原有 Key 的全局优先级和默认标记，随后可在模型管理页单独调整。
	const keys = sqlite.prepare(`
		SELECT id, models FROM api_keys
		ORDER BY priority DESC, is_default DESC, created_at ASC
	`).all() as Array<{ id: string; models: string }>;
	const routeExists = sqlite.prepare(
		'SELECT 1 FROM model_routes WHERE api_key_id = ? AND model_key = ? LIMIT 1'
	);
	const nextPriority = sqlite.prepare(
		'SELECT COALESCE(MAX(priority), 0) + 1 AS priority FROM model_routes WHERE model_key = ?'
	);
	const insertRoute = sqlite.prepare(`
		INSERT INTO model_routes (id, model, model_key, api_key_id, priority, is_active, created_at)
		VALUES (?, ?, ?, ?, ?, 1, ?)
	`);
	// drizzle 的 timestamp 模式以“秒”存储（读取时会 ×1000），这里必须写入秒级时间戳
	const nowInSeconds = Math.floor(Date.now() / 1000);

	for (const key of keys) {
		try {
			const models = JSON.parse(key.models) as unknown;
			if (!Array.isArray(models)) continue;
			for (const item of models) {
				if (typeof item !== 'string' || !item.trim()) continue;
				const model = item.trim();
				const modelKey = model.toLowerCase();
				if (routeExists.get(key.id, modelKey)) continue;
				const priority = (nextPriority.get(modelKey) as { priority: number }).priority;
				insertRoute.run(crypto.randomUUID(), model, modelKey, key.id, priority, nowInSeconds);
			}
		} catch {
			console.warn(`⚠️ 跳过无法解析模型配置的 Key: ${key.id}`);
		}
	}
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
