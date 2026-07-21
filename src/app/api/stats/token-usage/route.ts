import { NextRequest, NextResponse } from 'next/server';
import { getTokenUsageTimeSeries, TokenUsageGranularity } from '@/lib/api-utils';

const VALID_GRANULARITIES: TokenUsageGranularity[] = ['month', 'week', 'day', 'hour', 'minute'];

// 各粒度的桶数上限（安全上限），防止长跨度 + 细粒度返回海量数据点。
const MAX_BUCKETS: Record<TokenUsageGranularity, number> = {
	minute: 720, // 12 小时
	hour: 720, // 30 天
	day: 365, // 1 年
	week: 260, // 5 年
	month: 120, // 10 年
};

// 获取按时间粒度聚合的 token 使用情况
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const granularityParam = (searchParams.get('granularity') || 'day') as TokenUsageGranularity;
		const granularity = VALID_GRANULARITIES.includes(granularityParam) ? granularityParam : 'day';

		// 客户端可请求更小的 limit；服务端上限兜底防止数据点爆炸。
		const cap = MAX_BUCKETS[granularity];
		const requestedLimit = Number(searchParams.get('limit'));
		const limit =
			Number.isFinite(requestedLimit) && requestedLimit > 0
				? Math.min(Math.floor(requestedLimit), cap)
				: cap;

		const data = await getTokenUsageTimeSeries({
			granularity,
			startDate: searchParams.get('startDate') || undefined,
			endDate: searchParams.get('endDate') || undefined,
			limit,
		});

		return NextResponse.json({ data });
	} catch (error) {
		console.error('获取 token 使用统计失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}
