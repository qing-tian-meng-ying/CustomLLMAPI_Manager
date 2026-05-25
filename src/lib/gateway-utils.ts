/**
 * 网关 API Key 管理工具函数
 */

import { getDatabase } from '@/storage/database/sqlite-client';
import { gatewayApiKeys } from '@/storage/database/shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * 生成网关 API Key
 */
export function generateGatewayKey(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const keyLength = 48;
	let key = 'sk-';
	
	for (let i = 0; i < keyLength; i++) {
		key += chars[Math.floor(Math.random() * chars.length)];
	}
	
	return key;
}

/**
 * 验证网关 API Key
 */
export async function validateGatewayKey(key: string | null) {
	if (!key) {
		throw new Error('未提供 API Key');
	}
	
	const db = getDatabase();
	
	const results = await db
		.select()
		.from(gatewayApiKeys)
		.where(and(
			eq(gatewayApiKeys.key, key),
			eq(gatewayApiKeys.is_active, true)
		))
		.limit(1);
	
	if (!results[0]) {
		throw new Error('无效的 API Key');
	}
	
	return results[0];
}

/**
 * 更新网关 Key 使用统计
 */
export async function updateGatewayKeyStats(
	keyId: string,
	tokens: number
) {
	const db = getDatabase();
	
	// 先获取当前值
	const current = await db
		.select()
		.from(gatewayApiKeys)
		.where(eq(gatewayApiKeys.id, keyId))
		.limit(1);
	
	if (!current[0]) return;
	
	// 更新统计
	await db
		.update(gatewayApiKeys)
		.set({
			total_requests: (current[0].total_requests || 0) + 1,
			total_tokens: (current[0].total_tokens || 0) + tokens,
			last_used_at: new Date(),
			updated_at: new Date(),
		})
		.where(eq(gatewayApiKeys.id, keyId));
}

/**
 * 获取所有网关 Key
 */
export async function getGatewayKeys() {
	const db = getDatabase();
	
	const results = await db
		.select()
		.from(gatewayApiKeys)
		.orderBy(desc(gatewayApiKeys.created_at));
	
	// 返回完整的 Key（用户需要看到）
	return results;
}

/**
 * 创建网关 Key
 */
export async function createGatewayKey(data: {
	name: string;
	rate_limit?: number;
}) {
	const db = getDatabase();
	const key = generateGatewayKey();
	
	const result = await db
		.insert(gatewayApiKeys)
		.values({
			id: crypto.randomUUID(),
			name: data.name,
			key: key,
			is_active: true,
			rate_limit: data.rate_limit || null,
			total_requests: 0,
			total_tokens: 0,
			created_at: new Date(),
		})
		.returning();
	
	return {
		...result[0],
		key_full: key, // 返回完整 Key（仅此一次）
	};
}

/**
 * 更新网关 Key
 */
export async function updateGatewayKey(
	id: string,
	data: {
		name?: string;
		is_active?: boolean;
		rate_limit?: number;
	}
) {
	const db = getDatabase();
	
	await db
		.update(gatewayApiKeys)
		.set({
			...data,
			updated_at: new Date(),
		})
		.where(eq(gatewayApiKeys.id, id));
	
	return true;
}

/**
 * 删除网关 Key
 */
export async function deleteGatewayKey(id: string) {
	const db = getDatabase();
	
	await db
		.delete(gatewayApiKeys)
		.where(eq(gatewayApiKeys.id, id));
	
	return true;
}

/**
 * 重新生成网关 Key
 */
export async function regenerateGatewayKey(id: string) {
	const db = getDatabase();
	const newKey = generateGatewayKey();
	
	await db
		.update(gatewayApiKeys)
		.set({
			key: newKey,
			updated_at: new Date(),
		})
		.where(eq(gatewayApiKeys.id, id));
	
	return {
		id,
		key: newKey,
	};
}

/**
 * 获取网关 Key 统计信息
 */
export async function getGatewayKeyStats(keyId: string) {
	const db = getDatabase();
	
	// 获取 Key 基本信息
	const keyResults = await db
		.select()
		.from(gatewayApiKeys)
		.where(eq(gatewayApiKeys.id, keyId))
		.limit(1);
	
	if (!keyResults[0]) {
		throw new Error('Key 不存在');
	}
	
	// TODO: 从 api_call_logs 表聚合统计数据
	// 这里需要等 api_call_logs 表添加 gateway_key_id 字段后实现
	
	return {
		...keyResults[0],
		key: maskApiKey(keyResults[0].key),
	};
}

/**
 * 隐藏 API Key 的部分内容
 */
function maskApiKey(key: string): string {
	if (key.length <= 12) return key;
	return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
}

/**
 * 检查限流
 * TODO: 实现滑动窗口限流算法
 */
export async function checkRateLimit(keyId: string, rateLimit: number | null): Promise<boolean> {
	if (!rateLimit) return true;
	
	// TODO: 实现限流逻辑
	// 1. 从 Redis 或内存中获取最近 1 分钟的请求数
	// 2. 如果超过限制，返回 false
	// 3. 否则记录本次请求并返回 true
	
	return true;
}
