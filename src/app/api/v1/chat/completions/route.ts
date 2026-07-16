import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyConfig, getApiKeyByModel, getApiKeyById, logApiCall } from '@/lib/api-utils';
import { validateGatewayKey, updateGatewayKeyStats } from '@/lib/gateway-utils';
import {
	getProviderAdapter,
	countMessageTokens,
	type OpenAIRequest,
	type OpenAIMessage,
} from '@/lib/provider-adapters';

// 支持的提供商及其默认模型
const PROVIDER_MODELS: Record<string, { models: string[]; baseUrl: string }> = {
	openai: {
		models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
		baseUrl: 'https://api.openai.com/v1',
	},
	anthropic: {
		models: ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
		baseUrl: 'https://api.anthropic.com',
	},
	deepseek: {
		models: ['deepseek-chat', 'deepseek-coder'],
		baseUrl: 'https://api.deepseek.com/v1',
	},
	zhipu: {
		models: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-4v', 'glm-3-turbo'],
		baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
	},
	yi: {
		models: ['yi-large', 'yi-large-rag', 'yi-medium', 'yi-medium-200k', 'yi-spark'],
		baseUrl: 'https://api.lingyiwanwu.com/v1',
	},
	mistral: {
		models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
		baseUrl: 'https://api.mistral.ai/v1',
	},
	groq: {
		models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
		baseUrl: 'https://api.groq.com/openai/v1',
	},
	moonshot: {
		models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
		baseUrl: 'https://api.moonshot.cn/v1',
	},
	ali: {
		models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext', 'qwen-coder-turbo'],
		baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
	},
};

/**
 * 从模型名推断提供商
 */
function inferProvider(model: string): string | null {
	const lowerModel = model.toLowerCase();
	
	// 直接前缀匹配
	if (lowerModel.startsWith('gpt-') || lowerModel.startsWith('o1-')) return 'openai';
	if (lowerModel.startsWith('claude-')) return 'anthropic';
	if (lowerModel.startsWith('deepseek-')) return 'deepseek';
	if (lowerModel.startsWith('glm-')) return 'zhipu';
	if (lowerModel.startsWith('yi-')) return 'yi';
	if (lowerModel.startsWith('mistral-') || lowerModel.startsWith('codestral-')) return 'mistral';
	if (lowerModel.startsWith('llama-') || lowerModel.startsWith('mixtral-') || lowerModel.startsWith('gemma')) return 'groq';
	if (lowerModel.startsWith('moonshot-')) return 'moonshot';
	if (lowerModel.startsWith('qwen-')) return 'ali';
	
	// 模糊匹配
	for (const [provider, config] of Object.entries(PROVIDER_MODELS)) {
		for (const m of config.models) {
			if (lowerModel.includes(m.toLowerCase()) || m.toLowerCase().includes(lowerModel)) {
				return provider;
			}
		}
	}
	
	return null;
}

/**
 * 获取客户端 IP
 */
function getClientIP(req: NextRequest): string {
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	const realIP = req.headers.get('x-real-ip');
	if (realIP) {
		return realIP;
	}
	return '127.0.0.1';
}

/**
 * 主聊天完成接口
 * 接收 OpenAI 格式的请求，自动适配到各服务商
 */
export async function POST(req: NextRequest) {
	const startTime = Date.now();
	let logId = '';
	let requestBody: OpenAIRequest | null = null;
	let gatewayKeyRecord: any = null;
	
	try {
		// 可选：验证网关 API Key
		const authHeader = req.headers.get('authorization');
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const gatewayKey = authHeader.replace('Bearer ', '');
			try {
				gatewayKeyRecord = await validateGatewayKey(gatewayKey);
				console.log(`🔑 使用网关 Key: ${gatewayKeyRecord.name}`);
			} catch (error) {
				console.log(`⚠️  网关 Key 验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
				// 注意：这里不返回错误，允许无 Key 访问（向后兼容）
				// 如果要强制使用网关 Key，取消下面的注释：
				// return NextResponse.json(
				// 	{ error: { message: error instanceof Error ? error.message : '认证失败' } },
				// 	{ status: 401 }
				// );
			}
		}
		
		// 解析请求体
		requestBody = await req.json() as OpenAIRequest;
		const { model, messages, provider, api_key_id, ...otherParams } = requestBody;
		
		// 验证必填字段
		if (!model) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: model' } },
				{ status: 400 }
			);
		}
		
		if (!messages || !Array.isArray(messages) || messages.length === 0) {
			return NextResponse.json(
				{ error: { message: '缺少必填字段: messages' } },
				{ status: 400 }
			);
		}
		
		// 获取 API Key 配置
		// 优先级：1. 明确指定 api_key_id（精确路由）-> 2. 指定 provider -> 3. 根据模型名匹配
		let apiKeyConfig;
		if (api_key_id) {
			// 精确路由到指定的 Key（测试页面选定某个 Key 时使用）
			apiKeyConfig = await getApiKeyById(api_key_id as string);
			if (!apiKeyConfig) {
				return NextResponse.json(
					{
						error: {
							message: `未找到可用的 API Key 配置 (api_key_id: ${api_key_id})，可能已被删除或禁用`,
							code: 'no_api_key',
						},
					},
					{ status: 400 }
				);
			}
		} else if (provider) {
			// 如果明确指定了 provider，使用旧逻辑
			apiKeyConfig = await getApiKeyConfig(provider as string);
			if (!apiKeyConfig) {
				return NextResponse.json(
					{
						error: {
							message: `未找到可用的 API Key 配置 (provider: ${provider})`,
							code: 'no_api_key',
						},
					},
					{ status: 400 }
				);
			}
		} else {
			// 否则根据模型名直接匹配
			apiKeyConfig = await getApiKeyByModel(model);
			if (!apiKeyConfig) {
				return NextResponse.json(
					{
						error: {
							message: `未找到可用的 API Key 配置 (model: ${model})`,
							code: 'no_api_key',
						},
					},
					{ status: 400 }
				);
			}
		}
		
		const { base_url, api_key, models: configModels, provider: actualProvider, id: apiKeyId } = apiKeyConfig;
		const targetModel = model;
		
		console.log(`🔀 路由请求: ${targetModel} -> ${actualProvider} (${base_url})`);
		
		// 验证模型是否在配置的 models 列表中
		const modelList = JSON.parse(configModels) as string[];
		console.log(`📋 配置支持的模型: ${modelList.join(', ')}`);
		
		// 获取适配器
		const adapter = getProviderAdapter(actualProvider, base_url, api_key);
		
		// 构建请求（确保 stream 参数明确设置）
		const adaptedRequest: OpenAIRequest = {
			model: targetModel,
			messages: messages as OpenAIMessage[],
			stream: false, // 默认不使用流式
			...otherParams,
		};
		
		// 转换请求格式
		const { url, headers, body } = adapter.transformRequest(adaptedRequest);
		
		// 计算请求 tokens
		const requestTokens = countMessageTokens(messages as OpenAIMessage[]);
		
		console.log(`📤 发送请求到: ${url}`);
		
		// 发送请求到目标 API
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
		});
		
		const duration_ms = Date.now() - startTime;
		
		// 检查是否是流式响应
		const contentType = response.headers.get('content-type') || '';
		const isStreamResponse = contentType.includes('text/event-stream') || contentType.includes('text/plain');
		
		let responseData: any;
		let openaiResponse: any;
		let tokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
		
		// 如果是流式响应且客户端需要流式，拦截并收集完整内容
		if (isStreamResponse && adaptedRequest.stream) {
			console.log(`📥 收到流式响应: ${response.status} (${duration_ms}ms)`);
			
			// 创建一个可读流来拦截和收集数据
			const reader = response.body?.getReader();
			const encoder = new TextEncoder();
			const decoder = new TextDecoder();
			
			// 用于收集完整响应
			let collectedChunks: any[] = [];
			let collectedContent = '';
			let lastCompleteData: any = null;
			
			// 创建转换流
			const stream = new ReadableStream({
				async start(controller) {
					if (!reader) {
						controller.close();
						return;
					}
					
					try {
						while (true) {
							const { done, value } = await reader.read();
							
							if (done) {
								controller.close();
								break;
							}
							
							// 转发给客户端
							controller.enqueue(value);
							
							// 同时收集数据用于日志
							const text = decoder.decode(value, { stream: true });
							const lines = text.split('\n');
							
							for (const line of lines) {
								const trimmedLine = line.trim();
								if (trimmedLine.startsWith('data:') && !trimmedLine.includes('[DONE]')) {
									try {
										const jsonStr = trimmedLine.substring(5).trim();
										const data = JSON.parse(jsonStr);
										collectedChunks.push(data);
										
										// 合并内容
										if (data.choices && data.choices[0]) {
											const delta = data.choices[0].delta || data.choices[0].message;
											if (delta && delta.content) {
												collectedContent += delta.content;
											}
										}
										
										lastCompleteData = data;
									} catch (e) {
										// 忽略解析错误
									}
								}
							}
						}
						
						// 流结束后记录完整日志
						console.log(`✅ 流式响应完成，收集了 ${collectedChunks.length} 个数据块，内容长度: ${collectedContent.length} 字符`);
						
						// 构建完整的响应对象
						const completeResponse = lastCompleteData ? {
							...lastCompleteData,
							choices: [
								{
									index: 0,
									message: {
										role: 'assistant',
										content: collectedContent,
									},
									finish_reason: lastCompleteData.choices?.[0]?.finish_reason || 'stop',
								},
							],
						} : { stream: true, content: collectedContent };
						
						// 计算 tokens
						const completionTokens = lastCompleteData?.usage?.completion_tokens || Math.ceil(collectedContent.length / 4);
						const totalTokens = lastCompleteData?.usage?.total_tokens || (requestTokens + completionTokens);
						
						// 异步记录完整日志
						logApiCall({
							gateway_key_id: gatewayKeyRecord?.id,
							provider: actualProvider,
							model: targetModel,
							api_key_id: apiKeyId,
							endpoint: url,
							request_method: 'POST',
							request_headers: headers,
							request_body: body,
							request_tokens: requestTokens,
							response_status: response.status,
							response_body: completeResponse,
							response_tokens: completionTokens,
							total_tokens: totalTokens,
							duration_ms: Date.now() - startTime,
							error_message: response.ok ? undefined : '流式响应错误',
							ip_address: getClientIP(req),
							user_agent: req.headers.get('user-agent') || undefined,
						}).then((logEntry) => {
							console.log(`📝 流式完整日志已记录: ${logEntry.id}`);
							
							// 更新网关 Key 统计
							if (gatewayKeyRecord && totalTokens) {
								updateGatewayKeyStats(gatewayKeyRecord.id, totalTokens).catch(console.error);
							}
						}).catch((error) => {
							console.error('❌ 记录流式完整日志失败:', error);
						});
						
					} catch (error) {
						console.error('❌ 流式处理错误:', error);
						controller.error(error);
					}
				},
			});
			
			// 返回流式响应
			return new Response(stream, {
				status: response.status,
				headers: {
					'Content-Type': contentType,
					'X-Provider': actualProvider,
					'X-Model': targetModel,
				},
			});
		}
		
		const responseText = await response.text();
		console.log(`📥 收到响应: ${response.status} (${duration_ms}ms)`);
		
		try {
			// 尝试解析为 JSON
			responseData = JSON.parse(responseText);
			
			// 如果响应成功，转换为 OpenAI 格式
			if (response.ok) {
				openaiResponse = adapter.transformResponse(responseData, adaptedRequest);
				tokens = adapter.extractTokens(responseData);
			} else {
				// 错误响应，保持原样
				openaiResponse = responseData;
			}
		} catch (parseError) {
			// 如果解析失败，检查是否是 SSE 格式
			if (responseText.startsWith('data:') || responseText.includes('\ndata:')) {
				console.log('⚠️  收到 SSE 格式响应，尝试合并流式内容');
				
				// 从 SSE 中提取并合并所有消息
				const lines = responseText.split('\n');
				const chunks: any[] = [];
				let mergedContent = '';
				let lastCompleteData: any = null;
				
				console.log(`📋 解析 ${lines.length} 行 SSE 数据...`);
				
				for (const line of lines) {
					// 更宽松的匹配：去除首尾空格后检查
					const trimmedLine = line.trim();
					if (trimmedLine.startsWith('data:') && !trimmedLine.includes('[DONE]')) {
						try {
							// 提取 JSON 部分（去除 "data:" 前缀和空格）
							const jsonStr = trimmedLine.substring(5).trim();
							const data = JSON.parse(jsonStr);
							chunks.push(data);
							
							// 合并内容
							if (data.choices && data.choices[0]) {
								const delta = data.choices[0].delta || data.choices[0].message;
								if (delta && delta.content) {
									mergedContent += delta.content;
								}
							}
							
							// 保存最后一条完整数据（用于提取 token 等信息）
							lastCompleteData = data;
						} catch (e) {
							console.log(`⚠️  解析 SSE 行失败: ${trimmedLine.substring(0, 100)}`);
						}
					}
				}
				
				if (chunks.length > 0 && lastCompleteData) {
					console.log(`✅ 成功合并 ${chunks.length} 个流式数据块，总内容长度: ${mergedContent.length} 字符`);
					
					// 构建完整的响应对象
					responseData = {
						...lastCompleteData,
						choices: [
							{
								index: 0,
								message: {
									role: 'assistant',
									content: mergedContent,
								},
								finish_reason: lastCompleteData.choices?.[0]?.finish_reason || 'stop',
							},
						],
					};
					
					openaiResponse = adapter.transformResponse(responseData, adaptedRequest);
					tokens = adapter.extractTokens(responseData);
					
					// 如果没有 token 信息，估算一下
					if (!tokens.total_tokens && mergedContent) {
						tokens.completion_tokens = Math.ceil(mergedContent.length / 4);
						tokens.total_tokens = requestTokens + tokens.completion_tokens;
						tokens.prompt_tokens = requestTokens;
					}
				} else {
					// 无法提取有效数据
					console.log(`❌ 合并失败: chunks=${chunks.length}, lastCompleteData=${lastCompleteData ? 'exists' : 'null'}`);
					responseData = { raw: responseText.substring(0, 1000) };
					openaiResponse = {
						error: {
							message: '服务器返回了流式响应，但无法解析。请在请求中设置 stream: true',
							type: 'invalid_response_format',
							raw: responseText.substring(0, 500),
						},
					};
				}
			} else {
				console.error('❌ 解析响应失败:', parseError);
				responseData = { raw: responseText };
				openaiResponse = {
					error: {
						message: '解析响应失败',
						type: 'parse_error',
						raw: responseText.substring(0, 500),
					},
				};
			}
		}
		
		// 记录日志
		try {
			const logEntry = await logApiCall({
				gateway_key_id: gatewayKeyRecord?.id,
				provider: actualProvider,
				model: targetModel,
				api_key_id: apiKeyId,
				endpoint: url,
				request_method: 'POST',
				request_headers: headers,
				request_body: body,
				request_tokens: tokens.prompt_tokens || requestTokens,
				response_status: response.status,
				response_body: responseData,
				response_tokens: tokens.completion_tokens,
				total_tokens: tokens.total_tokens,
				duration_ms,
				error_message: response.ok ? undefined : JSON.stringify(responseData),
				ip_address: getClientIP(req),
				user_agent: req.headers.get('user-agent') || undefined,
			});
			logId = logEntry.id;
			console.log(`📝 日志已记录: ${logId}`);
		} catch (logError) {
			console.error('❌ 记录日志失败:', logError);
		}
		
		// 更新网关 Key 统计
		if (gatewayKeyRecord && tokens.total_tokens) {
			try {
				await updateGatewayKeyStats(gatewayKeyRecord.id, tokens.total_tokens);
			} catch (statsError) {
				console.error('❌ 更新统计失败:', statsError);
			}
		}
		
		// 返回响应
		return new Response(JSON.stringify(openaiResponse), {
			status: response.status,
			headers: {
				'Content-Type': 'application/json',
				'X-Log-Id': logId,
				'X-Provider': actualProvider,
				'X-Model': targetModel,
			},
		});
	} catch (error) {
		const duration_ms = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		
		console.error('❌ 请求处理失败:', error);
		
		// 记录错误日志
		try {
			await logApiCall({
				provider: 'unknown',
				model: requestBody?.model || 'unknown',
				endpoint: '/chat/completions',
				request_method: 'POST',
				request_body: requestBody || {},
				duration_ms,
				error_message: errorMessage,
				ip_address: getClientIP(req),
				user_agent: req.headers.get('user-agent') || undefined,
			});
		} catch (logError) {
			console.error('❌ 记录错误日志失败:', logError);
		}
		
		return NextResponse.json(
			{
				error: {
					message: errorMessage,
					type: 'internal_error',
				},
			},
			{ status: 500 }
		);
	}
}

/**
 * 获取支持的提供商列表
 */
export async function GET() {
	return NextResponse.json({
		providers: Object.entries(PROVIDER_MODELS).map(([name, config]) => ({
			name,
			models: config.models,
			baseUrl: config.baseUrl,
		})),
	});
}
