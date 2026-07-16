import { getDatabase } from '@/storage/database/sqlite-client';
import { apiKeys, apiCallLogs } from '@/storage/database/shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';

/**
 * 获取默认或指定 provider 的 API Key
 */
export async function getApiKeyConfig(provider?: string) {
	const db = getDatabase();
	
	let query = db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.is_active, true));
	
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
 * 根据模型名直接匹配 API Key 配置
 * 如果多个配置支持同一个模型，随机选择一个
 */
export async function getApiKeyByModel(model: string) {
	const db = getDatabase();
	
	// 获取所有活跃的配置
	const allConfigs = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.is_active, true))
		.orderBy(desc(apiKeys.priority), desc(apiKeys.is_default));
	
	if (allConfigs.length === 0) {
		return null;
	}
	
	// 解析 models 字段（JSON 数组）
	const configsWithModels = allConfigs.map(config => ({
		...config,
		modelList: JSON.parse(config.models) as string[],
	}));
	
	const requestModel = model.toLowerCase();
	
	// 精确匹配：配置的 models 数组中有与请求的 model 完全一致的
	const exactMatches = configsWithModels.filter(config => 
		config.modelList.some(m => m.toLowerCase() === requestModel)
	);
	
	if (exactMatches.length > 0) {
		// 如果有多个匹配，随机选择一个
		const randomIndex = Math.floor(Math.random() * exactMatches.length);
		console.log(`✅ 精确匹配到 ${exactMatches.length} 个配置，随机选择: ${exactMatches[randomIndex].name}`);
		return exactMatches[randomIndex];
	}
	
	// 模糊匹配：配置的 models 数组中有包含请求的 model，或反之
	const fuzzyMatches = configsWithModels.filter(config => 
		config.modelList.some(m => {
			const configModel = m.toLowerCase();
			return configModel.includes(requestModel) || requestModel.includes(configModel);
		})
	);
	
	if (fuzzyMatches.length > 0) {
		// 如果有多个匹配，随机选择一个
		const randomIndex = Math.floor(Math.random() * fuzzyMatches.length);
		console.log(`✅ 模糊匹配到 ${fuzzyMatches.length} 个配置，随机选择: ${fuzzyMatches[randomIndex].name}`);
		return fuzzyMatches[randomIndex];
	}
	
	// 如果没有匹配，返回默认配置或第一个配置
	const defaultConfig = allConfigs.find(config => config.is_default);
	if (defaultConfig) {
		console.log(`⚠️  未匹配到模型 ${model}，使用默认配置: ${defaultConfig.name}`);
		return defaultConfig;
	}
	
	console.log(`⚠️  未匹配到模型 ${model}，使用第一个配置: ${allConfigs[0].name}`);
	return allConfigs[0];
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
