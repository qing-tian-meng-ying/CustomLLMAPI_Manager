import { NextRequest, NextResponse } from 'next/server';
import { getApiStats } from '@/lib/api-utils';

// 获取统计信息
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		
		const params = {
			startDate: searchParams.get('startDate') || undefined,
			endDate: searchParams.get('endDate') || undefined,
		};
		
		const data = await getApiStats(params);
		
		return NextResponse.json({ data });
	} catch (error) {
		console.error('获取统计数据失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}
