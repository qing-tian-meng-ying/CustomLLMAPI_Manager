import { NextRequest, NextResponse } from 'next/server';
import { getApiCallLogById } from '@/lib/api-utils';

/**
 * 获取单条日志详情（含完整 request/response body）。
 * 列表接口已瘦身，详情按需加载，避免大 payload 拖慢列表页。
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;
		const log = await getApiCallLogById(id);
		return NextResponse.json({ data: log });
	} catch (error) {
		const message = error instanceof Error ? error.message : '获取失败';
		return NextResponse.json(
			{ error: { message } },
			{ status: message === '日志不存在' ? 404 : 500 }
		);
	}
}
