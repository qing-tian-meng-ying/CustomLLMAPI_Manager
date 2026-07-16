import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/storage/database/sqlite-client';
import { modelRoutes } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { getModelRoutingStats, updateModelRoutePriority } from '@/lib/api-utils';

/** 获取模型路由配置与调用统计。 */
export async function GET() {
	try {
		return NextResponse.json({ data: await getModelRoutingStats() });
	} catch (error) {
		console.error('❌ 获取模型路由失败:', error);
		return NextResponse.json({ error: { message: error instanceof Error ? error.message : '获取失败' } }, { status: 500 });
	}
}

/** 更新模型路由优先级或启用状态。 */
export async function PUT(req: NextRequest) {
	try {
		const { id, priority, is_active } = await req.json();
		if (!id || (priority === undefined && is_active === undefined)) {
			return NextResponse.json({ error: { message: '缺少路由 ID 或更新字段' } }, { status: 400 });
		}
		if (priority !== undefined) {
			if (!Number.isInteger(priority) || priority < 1) {
				return NextResponse.json({ error: { message: '优先级必须是大于等于 1 的整数' } }, { status: 400 });
			}
			await updateModelRoutePriority(id, priority);
		}
		if (is_active !== undefined) {
			const db = getDatabase();
			await db.update(modelRoutes).set({ is_active: Boolean(is_active), updated_at: new Date() }).where(eq(modelRoutes.id, id));
		}
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('❌ 更新模型路由失败:', error);
		return NextResponse.json({ error: { message: error instanceof Error ? error.message : '更新失败' } }, { status: 500 });
	}
}
