import { NextRequest, NextResponse } from 'next/server';
import { getApiCallLogs, getLogFilterOptions, deleteApiCallLog } from '@/lib/api-utils';

/**
 * 获取 API 调用日志列表
 */
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		
		// 如果请求筛选选项
		if (searchParams.get('action') === 'filters') {
			const filters = await getLogFilterOptions();
			return NextResponse.json(filters);
		}
		
		const params = {
			page: parseInt(searchParams.get('page') || '1'),
			pageSize: parseInt(searchParams.get('pageSize') || '20'),
			provider: searchParams.get('provider') || undefined,
			model: searchParams.get('model') || undefined,
			startDate: searchParams.get('startDate') || undefined,
			endDate: searchParams.get('endDate') || undefined,
		};
		
		const result = await getApiCallLogs(params);
		
		return NextResponse.json({
			data: result.items,
			total: result.total,
			page: result.page,
			pageSize: result.pageSize,
		});
	} catch (error) {
		console.error('获取日志失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}

/**
 * 删除指定日志
 * 通过查询参数 ?id=xxx 指定要删除的日志 ID
 */
export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少 id 参数' } },
				{ status: 400 }
			);
		}

		await deleteApiCallLog(id);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('❌ 删除日志失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '删除失败' } },
			{ status: 500 }
		);
	}
}
