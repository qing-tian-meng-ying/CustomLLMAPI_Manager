import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/storage/database/sqlite-client';
import { apiKeys } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

/**
 * 按需返回完整 API Key。
 * 列表接口保持脱敏（只显示首尾），仅当用户在 Key 页面点击"复制"时才通过本接口取完整值。
 */
export async function GET(req: NextRequest) {
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
		const results = await db
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.id, id))
			.limit(1);

		const key = results[0];
		if (!key) {
			return NextResponse.json(
				{ error: { message: 'Key 不存在' } },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			data: {
				id: key.id,
				api_key: key.api_key,
			},
		});
	} catch (error) {
		console.error('获取 API Key 完整值失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}
