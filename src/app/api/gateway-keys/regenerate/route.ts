import { NextRequest, NextResponse } from 'next/server';
import { regenerateGatewayKey } from '@/lib/gateway-utils';

/**
 * 重新生成网关 API Key
 */
export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { id } = body;
		
		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: id' } },
				{ status: 400 }
			);
		}
		
		const result = await regenerateGatewayKey(id);
		
		return NextResponse.json({
			data: result,
			message: '网关 Key 重新生成成功',
		});
	} catch (error) {
		console.error('重新生成网关 Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '重新生成失败' } },
			{ status: 500 }
		);
	}
}
