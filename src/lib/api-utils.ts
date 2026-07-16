import { getDatabase } from '@/storage/database/sqlite-client';
import { apiKeys, apiCallLogs, modelRoutes } from '@/storage/database/shared/schema';
import { eq, and, asc, desc, gte, lte, sql } from 'drizzle-orm';

/**
 * 获取默认或指定 provider 的 API Key
 */
export async function getApiKeyConfig(provider?: string) {
	const db = getDatabase();
	
	if (provider) {
		const results = await db
			.select()
			.from(apiKeys)
			.where(and(
				eq(apiKeys.is_active, true),
				eq(apiKeys.provider, provider)
			))
			.orderBy(desc(apiKeys.is_default))
			.limit(1);
		
		return results[0] || null;
	}
	
	const results = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.is_active, true))
		.orderBy(desc(apiKeys.is_default))
		.limit(1);
	
	return results[0] || null;
}

/**
 * 根据 ID 精确获取 API Key 配置（仅返回启用的）
 */
export async function getApiKeyById(id: string) {
	const db = getDatabase();

	const results = await db
		.select()
		.from(apiKeys)
		.where(and(
			eq(apiKeys.id, id),
			eq(apiKeys.is_active, true)
		))
		.limit(1);

	return results[0] || null;
}

/**
 * 将模型名称规范化，用于大小写无关的路由与统计匹配。
 */
function normalizeModelName(model: string): string {
	return model.trim().toLowerCase();
}

/**
 * 同步某个上游 Key 的模型路由。保留已有模型的手工优先级，
 * 新增模型自动排在该模型现有路由的末尾。
 */
export async function syncModelRoutesForApiKey(apiKeyId: string, models: string[]): Promise<void> {
	const db = getDatabase();
	const normalizedModels = new Map<string, string>();
	for (const value of models) {
		if (typeof value !== 'string' || !value.trim()) continue;
		const model = value.trim();
		normalizedModels.set(normalizeModelName(model), model);
	}

	const existingRoutes = await db
		.select()
		.from(modelRoutes)
		.where(eq(modelRoutes.api_key_id, apiKeyId));
	const affectedModelKeys = new Set<string>();

	for (const route of existingRoutes) {
		const model = normalizedModels.get(route.model_key);
		if (!model) {
			affectedModelKeys.add(route.model_key);
			await db.delete(modelRoutes).where(eq(modelRoutes.id, route.id));
			continue;
		}
		if (route.model !== model) {
			await db
				.update(modelRoutes)
				.set({ model, updated_at: new Date() })
				.where(eq(modelRoutes.id, route.id));
		}
	}

	const existingModelKeys = new Set(
		existingRoutes
			.filter(route => normalizedModels.has(route.model_key))
			.map(route => route.model_key)
	);
	for (const [modelKey, model] of normalizedModels) {
		if (existingModelKeys.has(modelKey)) continue;
		const maxResult = await db
			.select({ maxPriority: sql<number>`COALESCE(MAX(${modelRoutes.priority}), 0)` })
			.from(modelRoutes)
			.where(eq(modelRoutes.model_key, modelKey));
		const priority = Number(maxResult[0]?.maxPriority ?? 0) + 1;
		await db.insert(modelRoutes).values({
			id: crypto.randomUUID(),
			model,
			model_key: modelKey,
			api_key_id: apiKeyId,
			priority,
			is_active: true,
			created_at: new Date(),
		});
		affectedModelKeys.add(modelKey);
	}

	for (const modelKey of affectedModelKeys) {
		const routes = await db
			.select()
			.from(modelRoutes)
			.where(eq(modelRoutes.model_key, modelKey))
			.orderBy(asc(modelRoutes.priority), asc(modelRoutes.created_at));
		for (const [index, route] of routes.entries()) {
			const priority = index + 1;
			if (route.priority !== priority) {
				await db
					.update(modelRoutes)
					.set({ priority, updated_at: new Date() })
					.where(eq(modelRoutes.id, route.id));
			}
		}
	}
}

/**
 * 根据模型名获取路由优先级最高的可用上游 Key。
 * 模型路由优先级为 1、2、3…，数值越小越优先。
 */
export async function getApiKeyByModel(model: string) {
	const db = getDatabase();
	const modelKey = normalizeModelName(model);

	const prioritizedRoutes = await db
		.select({ key: apiKeys, priority: modelRoutes.priority })
		.from(modelRoutes)
		.innerJoin(apiKeys, eq(modelRoutes.api_key_id, apiKeys.id))
		.where(and(
			eq(modelRoutes.model_key, modelKey),
			eq(modelRoutes.is_active, true),
			eq(apiKeys.is_active, true),
		))
		.orderBy(asc(modelRoutes.priority), desc(apiKeys.is_default), asc(apiKeys.created_at));

	if (prioritizedRoutes.length > 0) {
		const selected = prioritizedRoutes[0];
		console.log(`✅ 模型路由命中: ${model} -> ${selected.key.name}（优先级 ${selected.priority}）`);
		return selected.key;
	}

	// 如果该模型已有路由配置但全部被禁用或对应 Key 不可用，
	// 必须明确失败，不能绕过手工配置回退到其它 Key。
	const configuredRouteCount = await db
		.select({ count: sql<number>`COUNT(*)` })
		.from(modelRoutes)
		.where(eq(modelRoutes.model_key, modelKey));
	if (Number(configuredRouteCount[0]?.count ?? 0) > 0) {
		console.log(`⚠️ 模型 ${model} 的所有路由均不可用`);
		return null;
	}

	// 兼容尚未同步到 model_routes 的历史数据，且不再随机选择。
	const allConfigs = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.is_active, true))
		.orderBy(desc(apiKeys.priority), desc(apiKeys.is_default), asc(apiKeys.created_at));
	if (allConfigs.length === 0) return null;

	const configsWithModels = allConfigs.map(config => {
		try {
			return { ...config, modelList: JSON.parse(config.models) as string[] };
		} catch {
			return { ...config, modelList: [] as string[] };
		}
	});
	const exactMatch = configsWithModels.find(config =>
		config.modelList.some(configModel => normalizeModelName(configModel) === modelKey)
	);
	if (exactMatch) {
		console.log(`⚠️ 使用尚未迁移的模型配置: ${model} -> ${exactMatch.name}`);
		return exactMatch;
	}

	const fuzzyMatch = configsWithModels.find(config =>
		config.modelList.some(configModel => {
			const normalized = normalizeModelName(configModel);
			return normalized.includes(modelKey) || modelKey.includes(normalized);
		})
	);
	if (fuzzyMatch) {
		console.log(`⚠️ 模糊匹配模型: ${model} -> ${fuzzyMatch.name}`);
		return fuzzyMatch;
	}

	const defaultConfig = allConfigs.find(config => config.is_default);
	if (defaultConfig) {
		console.log(`⚠️ 未匹配模型 ${model}，使用默认配置: ${defaultConfig.name}`);
		return defaultConfig;
	}
	console.log(`⚠️ 未匹配模型 ${model}，使用首个可用配置: ${allConfigs[0].name}`);
	return allConfigs[0];
}

/**
 * 调整模型路由顺序。priority 从 1 开始并在同模型内连续、唯一。
 */
export async function updateModelRoutePriority(routeId: string, requestedPriority: number): Promise<void> {
	const db = getDatabase();
	const target = await db
		.select()
		.from(modelRoutes)
		.where(eq(modelRoutes.id, routeId))
		.limit(1);
	if (!target[0]) throw new Error('模型路由不存在');

	const routes = await db
		.select()
		.from(modelRoutes)
		.where(eq(modelRoutes.model_key, target[0].model_key))
		.orderBy(asc(modelRoutes.priority), asc(modelRoutes.created_at));
	const currentIndex = routes.findIndex(route => route.id === routeId);
	const [movingRoute] = routes.splice(currentIndex, 1);
	const targetIndex = Math.max(0, Math.min(Math.floor(requestedPriority) - 1, routes.length));
	routes.splice(targetIndex, 0, movingRoute);

	for (const [index, route] of routes.entries()) {
		const priority = index + 1;
		if (route.priority !== priority) {
			await db
				.update(modelRoutes)
				.set({ priority, updated_at: new Date() })
				.where(eq(modelRoutes.id, route.id));
		}
	}
}

/**
 * 删除某个上游 Key 的模型路由，并将同模型剩余路由重新编号为 1、2、3…
 */
export async function deleteModelRoutesForApiKey(apiKeyId: string): Promise<void> {
	const db = getDatabase();
	const routes = await db
		.select({ model_key: modelRoutes.model_key })
		.from(modelRoutes)
		.where(eq(modelRoutes.api_key_id, apiKeyId));
	const affectedModelKeys = [...new Set(routes.map(route => route.model_key))];
	await db.delete(modelRoutes).where(eq(modelRoutes.api_key_id, apiKeyId));

	for (const modelKey of affectedModelKeys) {
		const remainingRoutes = await db
			.select()
			.from(modelRoutes)
			.where(eq(modelRoutes.model_key, modelKey))
			.orderBy(asc(modelRoutes.priority), asc(modelRoutes.created_at));
		for (const [index, route] of remainingRoutes.entries()) {
			const priority = index + 1;
			if (route.priority !== priority) {
				await db
					.update(modelRoutes)
					.set({ priority, updated_at: new Date() })
					.where(eq(modelRoutes.id, route.id));
			}
		}
	}
}

/**
 * 获取按模型聚合的路由配置和用量统计。
 */
export async function getModelRoutingStats() {
	const db = getDatabase();
	const rows = await db
		.select({
			route_id: modelRoutes.id,
			model: modelRoutes.model,
			model_key: modelRoutes.model_key,
			priority: modelRoutes.priority,
			route_active: modelRoutes.is_active,
			api_key_id: apiKeys.id,
			key_name: apiKeys.name,
			provider: apiKeys.provider,
			key_active: apiKeys.is_active,
			call_count: sql<number>`COUNT(${apiCallLogs.id})`,
			total_tokens: sql<number>`COALESCE(SUM(${apiCallLogs.total_tokens}), 0)`,
			duration_sum: sql<number>`COALESCE(SUM(${apiCallLogs.duration_ms}), 0)`,
			error_count: sql<number>`COALESCE(SUM(CASE WHEN ${apiCallLogs.error_message} IS NOT NULL OR ${apiCallLogs.response_status} >= 400 THEN 1 ELSE 0 END), 0)`,
			// created_at 在数据库中以“秒”存储（drizzle timestamp 模式），这里 ×1000 统一转换为毫秒，
			// 避免绕过 drizzle 自动转换后前端 new Date() 把秒当成毫秒解析导致日期偏差。
			last_called_at: sql<number | null>`MAX(${apiCallLogs.created_at}) * 1000`,
		})
		.from(modelRoutes)
		.innerJoin(apiKeys, eq(modelRoutes.api_key_id, apiKeys.id))
		.leftJoin(apiCallLogs, and(
			eq(apiCallLogs.api_key_id, modelRoutes.api_key_id),
			sql`LOWER(${apiCallLogs.model}) = ${modelRoutes.model_key}`,
		))
		.groupBy(
			modelRoutes.id,
			modelRoutes.model,
			modelRoutes.model_key,
			modelRoutes.priority,
			modelRoutes.is_active,
			apiKeys.id,
			apiKeys.name,
			apiKeys.provider,
			apiKeys.is_active,
		)
		.orderBy(asc(modelRoutes.model_key), asc(modelRoutes.priority));

	const models = new Map<string, {
		model: string;
		model_key: string;
		call_count: number;
		total_tokens: number;
		duration_sum: number;
		error_count: number;
		last_called_at: number | null;
		routes: Array<typeof rows[number]>;
	}>();
	for (const row of rows) {
		const entry = models.get(row.model_key) ?? {
			model: row.model,
			model_key: row.model_key,
			call_count: 0,
			total_tokens: 0,
			duration_sum: 0,
			error_count: 0,
			last_called_at: null,
			routes: [],
		};
		entry.call_count += Number(row.call_count ?? 0);
		entry.total_tokens += Number(row.total_tokens ?? 0);
		entry.duration_sum += Number(row.duration_sum ?? 0);
		entry.error_count += Number(row.error_count ?? 0);
		const lastCalledAt = row.last_called_at ? Number(row.last_called_at) : null;
		if (lastCalledAt && (!entry.last_called_at || lastCalledAt > entry.last_called_at)) entry.last_called_at = lastCalledAt;
		entry.routes.push(row);
		models.set(row.model_key, entry);
	}

	return Array.from(models.values()).map(({ duration_sum, ...item }) => ({
		...item,
		avg_duration_ms: item.call_count > 0 ? Math.round(duration_sum / item.call_count) : 0,
		error_rate: item.call_count > 0 ? Number((item.error_count / item.call_count * 100).toFixed(1)) : 0,
	}));
}

/**
 * 记录 API 调用日志
 */
export async function logApiCall(logData: {
	gateway_key_id?: string;
	provider: string;
	model: string;
	api_key_id?: string;
	endpoint: string;
	request_method: string;
	request_headers?: Record<string, string>;
	request_body?: Record<string, unknown>;
	request_tokens?: number;
	response_status?: number;
	response_body?: Record<string, unknown>;
	response_tokens?: number;
	total_tokens?: number;
	duration_ms?: number;
	error_message?: string;
	ip_address?: string;
	user_agent?: string;
}) {
	const db = getDatabase();
	
	const id = crypto.randomUUID();
	
	await db.insert(apiCallLogs).values({
		id,
		gateway_key_id: logData.gateway_key_id || null,
		provider: logData.provider,
		model: logData.model,
		api_key_id: logData.api_key_id,
		endpoint: logData.endpoint,
		request_method: logData.request_method,
		request_headers: logData.request_headers ? JSON.stringify(logData.request_headers) : null,
		request_body: logData.request_body ? JSON.stringify(logData.request_body) : null,
		request_tokens: logData.request_tokens,
		response_status: logData.response_status,
		response_body: logData.response_body ? JSON.stringify(logData.response_body) : null,
		response_tokens: logData.response_tokens,
		total_tokens: logData.total_tokens,
		duration_ms: logData.duration_ms,
		error_message: logData.error_message,
		ip_address: logData.ip_address,
		user_agent: logData.user_agent,
		created_at: new Date(),
	});
	
	const result = await db
		.select()
		.from(apiCallLogs)
		.where(eq(apiCallLogs.id, id))
		.limit(1);
	
	return result[0];
}

/**
 * 获取 API 调用日志列表（含总数）
 */
export async function getApiCallLogs(params: {
	page?: number;
	pageSize?: number;
	provider?: string;
	model?: string;
	startDate?: string;
	endDate?: string;
}) {
	const db = getDatabase();
	const { page = 1, pageSize = 20, provider, model, startDate, endDate } = params;
	const offset = (page - 1) * pageSize;
	
	// 构建查询条件
	const conditions = [];
	
	if (provider) {
		conditions.push(eq(apiCallLogs.provider, provider));
	}
	if (model) {
		conditions.push(eq(apiCallLogs.model, model));
	}
	if (startDate) {
		conditions.push(gte(apiCallLogs.created_at, new Date(startDate)));
	}
	if (endDate) {
		conditions.push(lte(apiCallLogs.created_at, new Date(endDate)));
	}
	
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	
	// 查询总数
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(apiCallLogs)
		.where(whereClause);
	
	const total = countResult[0]?.count || 0;
	
	// 查询数据
	const results = await db
		.select()
		.from(apiCallLogs)
		.where(whereClause)
		.orderBy(desc(apiCallLogs.created_at))
		.limit(pageSize)
		.offset(offset);
	
	// 解析 JSON 字段
	const items = results.map(log => ({
		...log,
		request_headers: log.request_headers ? JSON.parse(log.request_headers) : null,
		request_body: log.request_body ? JSON.parse(log.request_body) : null,
		response_body: log.response_body ? JSON.parse(log.response_body) : null,
	}));
	
	return { items, total, page, pageSize };
}

/**
 * 获取日志中所有出现过的 provider 和 model（用于筛选下拉）
 */
export async function getLogFilterOptions() {
	const db = getDatabase();
	
	const providers = await db
		.selectDistinct({ provider: apiCallLogs.provider })
		.from(apiCallLogs);
	
	const models = await db
		.selectDistinct({ model: apiCallLogs.model })
		.from(apiCallLogs);
	
	return {
		providers: providers.map(p => p.provider),
		models: models.map(m => m.model),
	};
}

/**
 * 获取单条日志详情
 */
export async function getApiCallLogById(id: string) {
	const db = getDatabase();
	
	const results = await db
		.select()
		.from(apiCallLogs)
		.where(eq(apiCallLogs.id, id))
		.limit(1);
	
	if (!results[0]) {
		throw new Error('日志不存在');
	}
	
	const log = results[0];
	
	return {
		...log,
		request_headers: log.request_headers ? JSON.parse(log.request_headers) : null,
		request_body: log.request_body ? JSON.parse(log.request_body) : null,
		response_body: log.response_body ? JSON.parse(log.response_body) : null,
	};
}

/**
 * 删除日志
 */
export async function deleteApiCallLog(id: string) {
	const db = getDatabase();
	
	await db
		.delete(apiCallLogs)
		.where(eq(apiCallLogs.id, id));
	
	return true;
}

/**
 * 获取统计信息
 */
export async function getApiStats(params: {
	startDate?: string;
	endDate?: string;
}) {
	const db = getDatabase();
	const { startDate, endDate } = params;
	
	// 构建查询条件
	const conditions = [];
	
	if (startDate) {
		conditions.push(gte(apiCallLogs.created_at, new Date(startDate)));
	}
	if (endDate) {
		conditions.push(lte(apiCallLogs.created_at, new Date(endDate)));
	}
	
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	
	const results = await db
		.select({
			provider: apiCallLogs.provider,
			model: apiCallLogs.model,
			total_tokens: apiCallLogs.total_tokens,
			duration_ms: apiCallLogs.duration_ms,
		})
		.from(apiCallLogs)
		.where(whereClause);
	
	// 按 provider 聚合
	const stats: Record<string, {
		call_count: number;
		total_tokens: number;
		avg_duration_ms: number;
		models: Set<string>;
	}> = {};
	
	for (const log of results) {
		const key = log.provider;
		if (!stats[key]) {
			stats[key] = {
				call_count: 0,
				total_tokens: 0,
				avg_duration_ms: 0,
				models: new Set(),
			};
		}
		stats[key].call_count++;
		stats[key].total_tokens += log.total_tokens || 0;
		stats[key].avg_duration_ms += log.duration_ms || 0;
		stats[key].models.add(log.model);
	}
	
	// 计算平均值并转换为数组
	return Object.entries(stats).map(([provider, stat]) => ({
		provider,
		call_count: stat.call_count,
		total_tokens: stat.total_tokens,
		avg_duration_ms: stat.call_count > 0 ? Math.round(stat.avg_duration_ms / stat.call_count) : 0,
		models: Array.from(stat.models),
	}));
}
