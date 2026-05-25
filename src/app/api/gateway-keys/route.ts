import { NextRequest, NextResponse } from 'next/server';
import {
	getGatewayKeys,
	createGatewayKey,
	updateGatewayKey,
	deleteGatewayKey,
	regenerateGatewayKey,
} from '@/lib/gateway-utils';

/**
 * 获取所有网关 API Key
 */
export async function GET() {
	try {
		const keys = await getGatewayKeys();
		
		return NextResponse.json({
			data: keys.map(k => ({
				...k,
				key_full: undefined, // 不返回完整 Key
			})),
		});
	} catch (error) {
		console.error('获取网关 Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '获取失败' } },
			{ status: 500 }
		);
	}
}

/**
 * 创建新的网关 API Key
 */
export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { name, rate_limit } = body;
		
		if (!name) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: name' } },
				{ status: 400 }
			);
		}
		
		const result = await createGatewayKey({
			name,
			rate_limit: rate_limit ? parseInt(rate_limit) : undefined,
		});
		
		return NextResponse.json({
			data: result,
			message: '网关 Key 创建成功',
		});
	} catch (error) {
		console.error('创建网关 Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '创建失败' } },
			{ status: 500 }
		);
	}
}

/**
 * 更新网关 API Key
 */
export async function PUT(req: NextRequest) {
	try {
		const body = await req.json();
		const { id, name, is_active, rate_limit } = body;
		
		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: id' } },
				{ status: 400 }
			);
		}
		
		await updateGatewayKey(id, {
			name,
			is_active,
			rate_limit: rate_limit ? parseInt(rate_limit) : undefined,
		});
		
		return NextResponse.json({
			message: '网关 Key 更新成功',
		});
	} catch (error) {
		console.error('更新网关 Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '更新失败' } },
			{ status: 500 }
		);
	}
}

/**
 * 删除网关 API Key
 */
export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');
		
		if (!id) {
			return NextResponse.json(
				{ error: { message: '缺少必填参数: id' } },
				{ status: 400 }
			);
		}
		
		await deleteGatewayKey(id);
		
		return NextResponse.json({
			message: '网关 Key 删除成功',
		});
	} catch (error) {
		console.error('删除网关 Key 失败:', error);
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : '删除失败' } },
			{ status: 500 }
		);
	}
}
