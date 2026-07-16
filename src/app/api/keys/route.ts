import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/storage/database/sqlite-client';
import { apiKeys, apiCallLogs } from '@/storage/database/shared/schema';
import { eq, and, desc } from 'drizzle-orm';

// 获取所有 API Keys
export async function GET(req: NextRequest) {
	try {
		const db = getDatabase();
		const { searchParams } = new URL(req.url);
		const provider = searchParams.get('provider');
		
		let results;
		
		if (provider) {
			results = await db
				.select()
				.from(apiKeys)
				.where(eq(apiKeys.provider, provider))
				.orderBy(desc(apiKeys.created_at));
		} else {
			results = await db
				.select()
				.from(apiKeys)
				.orderBy(desc(apiKeys.created_at));
		}
		
		// 脱敏处理，隐藏 API Key 的中间部分，解析 models 字段
		const sanitizedData = results.map((item) => ({
			...item,
			models: JSON.parse(item.models), // 解析为数组
			api_key: item.api_key ? `${item.api_key.substring(0, 8)}...${item.api_key.substring(item.api_key.length - 4)}` : null,
		}));
		
		return NextResponse.json({ data: sanitizedData });
	} catch (error) {
		console.error('获取 API Keys 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}

// 创建新的 API Key
export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { name, provider, base_url, api_key, models, is_default = false } = body;
		
		// 验证必填字段
		if (!name || !provider || !base_url || !api_key || !models) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: name, provider, base_url, api_key, models' } },
				{ status: 400 }
			);
		}
		
		// 验证 models 是数组
		if (!Array.isArray(models) || models.length === 0) {
			return NextResponse.json(
				{ error: { message: 'models 必须是非空数组' } },
				{ status: 400 }
			);
		}
		
		const db = getDatabase();
		
		// 如果设置为默认，先取消其他默认
		if (is_default) {
			await db
				.update(apiKeys)
				.set({ is_default: false })
				.where(eq(apiKeys.provider, provider));
		}
		
		const id = crypto.randomUUID();
		
		await db.insert(apiKeys).values({
			id,
			name,
			provider,
			base_url,
			api_key,
			models: JSON.stringify(models), // 存储为 JSON 字符串
			is_active: true,
			is_default: is_default || false,
			created_at: new Date(),
		});
		
		const result = await db
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.id, id))
			.limit(1);
		
		const data = result[0];
		
		return NextResponse.json({
			data: {
				...data,
				models: JSON.parse(data.models), // 返回时解析为数组
				api_key: `${api_key.substring(0, 8)}...${api_key.substring(api_key.length - 4)}`,
			},
		});
	} catch (error) {
		console.error('创建 API Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '创建失败' } },
			{ status: 500 }
		);
	}
}

// 更新 API Key
export async function PUT(req: NextRequest) {
	try {
		const body = await req.json();
		const { id, name, base_url, api_key, models, is_active, is_default } = body;
		
		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少 ID' } },
				{ status: 400 }
			);
		}
		
		// 如果提供了 models，验证是数组
		if (models !== undefined && (!Array.isArray(models) || models.length === 0)) {
			return NextResponse.json(
				{ error: { message: 'models 必须是非空数组' } },
				{ status: 400 }
			);
		}
		
		const db = getDatabase();
		
		// 如果设置为默认，先取消其他默认
		if (is_default) {
			const current = await db
				.select()
				.from(apiKeys)
				.where(eq(apiKeys.id, id))
				.limit(1);
			
			if (current[0]) {
				await db
					.update(apiKeys)
					.set({ is_default: false })
					.where(eq(apiKeys.provider, current[0].provider));
			}
		}
		
		const updateData: Record<string, unknown> = {};
		if (name !== undefined) updateData.name = name;
		if (base_url !== undefined) updateData.base_url = base_url;
		if (api_key !== undefined) updateData.api_key = api_key;
		if (models !== undefined) updateData.models = JSON.stringify(models); // 存储为 JSON 字符串
		if (is_active !== undefined) updateData.is_active = is_active;
		if (is_default !== undefined) updateData.is_default = is_default;
		updateData.updated_at = new Date();
		
		await db
			.update(apiKeys)
			.set(updateData)
			.where(eq(apiKeys.id, id));
		
		const result = await db
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.id, id))
			.limit(1);
		
		const data = result[0];
		
		return NextResponse.json({
			data: {
				...data,
				models: JSON.parse(data.models), // 返回时解析为数组
				api_key: data.api_key ? `${data.api_key.substring(0, 8)}...${data.api_key.substring(data.api_key.length - 4)}` : null,
			},
		});
	} catch (error) {
		console.error('更新 API Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '更新失败' } },
			{ status: 500 }
		);
	}
}

// 删除 API Key
export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');
		
		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少 ID' } },
				{ status: 400 }
			);
		}
		
		const db = getDatabase();
		
		// 先解除调用日志对该 Key 的外键引用（保留历史日志，避免 FOREIGN KEY constraint failed）
		await db
			.update(apiCallLogs)
			.set({ api_key_id: null })
			.where(eq(apiCallLogs.api_key_id, id));
		
		// 再删除 Key
		await db
			.delete(apiKeys)
			.where(eq(apiKeys.id, id));
		
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('删除 API Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '删除失败' } },
			{ status: 500 }
		);
	}
}
