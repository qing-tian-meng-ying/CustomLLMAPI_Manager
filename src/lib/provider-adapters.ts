/**
 * AI 服务商适配器
 * 用于将 OpenAI 格式的请求转换为各服务商的原生格式
 */

// OpenAI 格式的消息类型
export interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
	name?: string;
}

// OpenAI 格式的请求
export interface OpenAIRequest {
	model: string;
	messages: OpenAIMessage[];
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	stream?: boolean;
	[key: string]: unknown;
}

// OpenAI 格式的响应
export interface OpenAIResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

// 适配器接口
export interface ProviderAdapter {
	// 转换请求格式
	transformRequest(request: OpenAIRequest): {
		url: string;
		headers: Record<string, string>;
		body: Record<string, unknown>;
	};
	
	// 转换响应格式为 OpenAI 格式
	transformResponse(response: unknown, originalRequest: OpenAIRequest): OpenAIResponse;
	
	// 提取 token 使用信息
	extractTokens(response: unknown): {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * Anthropic (Claude) 适配器
 */
export class AnthropicAdapter implements ProviderAdapter {
	constructor(
		private baseUrl: string,
		private apiKey: string
	) {}
	
	transformRequest(request: OpenAIRequest) {
		// 提取 system 消息
		let systemMessage = '';
		const messages = request.messages.filter(msg => {
			if (msg.role === 'system') {
				systemMessage = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				return false;
			}
			return true;
		});
		
		// 转换消息格式
		const claudeMessages = messages.map(msg => ({
			role: msg.role === 'assistant' ? 'assistant' : 'user',
			content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
		}));
		
		const body: Record<string, unknown> = {
			model: request.model,
			messages: claudeMessages,
			max_tokens: request.max_tokens || 4096,
			stream: false, // 明确设置为非流式
		};
		
		if (systemMessage) {
			body.system = systemMessage;
		}
		
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}
		
		if (request.top_p !== undefined) {
			body.top_p = request.top_p;
		}
		
		// 如果用户明确要求流式，则设置为 true
		if (request.stream === true) {
			body.stream = true;
		}
		
		return {
			url: `${this.baseUrl}/v1/messages`,
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body,
		};
	}
	
	transformResponse(response: any, originalRequest: OpenAIRequest): OpenAIResponse {
		// Claude 响应格式转 OpenAI 格式
		return {
			id: response.id || `chatcmpl-${Date.now()}`,
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: response.model || originalRequest.model,
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: response.content?.[0]?.text || '',
					},
					finish_reason: response.stop_reason || 'stop',
				},
			],
			usage: {
				prompt_tokens: response.usage?.input_tokens || 0,
				completion_tokens: response.usage?.output_tokens || 0,
				total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
			},
		};
	}
	
	extractTokens(response: any) {
		return {
			prompt_tokens: response.usage?.input_tokens || 0,
			completion_tokens: response.usage?.output_tokens || 0,
			total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
		};
	}
}

/**
 * 智谱 AI (GLM) 适配器
 * 注意：智谱 AI 已支持 OpenAI 格式，但有些细微差异
 */
export class ZhipuAdapter implements ProviderAdapter {
	constructor(
		private baseUrl: string,
		private apiKey: string
	) {}
	
	transformRequest(request: OpenAIRequest) {
		// 智谱 AI 基本兼容 OpenAI 格式
		const body: Record<string, unknown> = {
			model: request.model,
			messages: request.messages,
			stream: false, // 明确设置为非流式
		};
		
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}
		
		if (request.max_tokens !== undefined) {
			body.max_tokens = request.max_tokens;
		}
		
		if (request.top_p !== undefined) {
			body.top_p = request.top_p;
		}
		
		// 如果用户明确要求流式，则设置为 true
		if (request.stream === true) {
			body.stream = true;
		}
		
		return {
			url: `${this.baseUrl}/chat/completions`,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			body,
		};
	}
	
	transformResponse(response: any, originalRequest: OpenAIRequest): OpenAIResponse {
		// 智谱 AI 返回格式已经是 OpenAI 格式
		return response as OpenAIResponse;
	}
	
	extractTokens(response: any) {
		return {
			prompt_tokens: response.usage?.prompt_tokens || 0,
			completion_tokens: response.usage?.completion_tokens || 0,
			total_tokens: response.usage?.total_tokens || 0,
		};
	}
}

/**
 * OpenAI 兼容适配器（默认）
 * 用于 OpenAI, DeepSeek, Yi, Mistral, Groq, Moonshot, 阿里云等
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
	constructor(
		private baseUrl: string,
		private apiKey: string,
		private authHeader: string = 'Authorization'
	) {}
	
	transformRequest(request: OpenAIRequest) {
		const body: Record<string, unknown> = {
			model: request.model,
			messages: request.messages,
			stream: false, // 明确设置为非流式
		};
		
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}
		
		if (request.max_tokens !== undefined) {
			body.max_tokens = request.max_tokens;
		}
		
		if (request.top_p !== undefined) {
			body.top_p = request.top_p;
		}
		
		// 如果用户明确要求流式，则设置为 true
		if (request.stream === true) {
			body.stream = true;
		}
		
		// 复制其他参数
		for (const [key, value] of Object.entries(request)) {
			if (!['model', 'messages', 'temperature', 'max_tokens', 'top_p', 'stream'].includes(key)) {
				body[key] = value;
			}
		}
		
		return {
			url: `${this.baseUrl}/chat/completions`,
			headers: {
				'Content-Type': 'application/json',
				[this.authHeader]: `Bearer ${this.apiKey}`,
			},
			body,
		};
	}
	
	transformResponse(response: any, originalRequest: OpenAIRequest): OpenAIResponse {
		return response as OpenAIResponse;
	}
	
	extractTokens(response: any) {
		return {
			prompt_tokens: response.usage?.prompt_tokens || 0,
			completion_tokens: response.usage?.completion_tokens || 0,
			total_tokens: response.usage?.total_tokens || 0,
		};
	}
}

/**
 * 获取服务商适配器
 */
export function getProviderAdapter(
	provider: string,
	baseUrl: string,
	apiKey: string
): ProviderAdapter {
	switch (provider.toLowerCase()) {
		case 'anthropic':
		case 'claude':
			return new AnthropicAdapter(baseUrl, apiKey);
		
		case 'zhipu':
		case 'glm':
			return new ZhipuAdapter(baseUrl, apiKey);
		
		case 'openai':
		case 'deepseek':
		case 'yi':
		case 'mistral':
		case 'groq':
		case 'moonshot':
		case 'ali':
		case 'qwen':
		default:
			return new OpenAICompatibleAdapter(baseUrl, apiKey);
	}
}

/**
 * 估算 token 数量
 */
export function estimateTokens(text: string): number {
	// 中文字符约 2 tokens，英文约 0.25 tokens
	const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	const otherChars = text.length - chineseChars;
	return Math.ceil(chineseChars * 2 + otherChars * 0.25);
}

/**
 * 计算消息中的 tokens
 */
export function countMessageTokens(messages: OpenAIMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		if (typeof msg.content === 'string') {
			total += estimateTokens(msg.content);
		} else if (Array.isArray(msg.content)) {
			for (const part of msg.content) {
				if (part.text) {
					total += estimateTokens(part.text);
				}
			}
		}
		// 每条消息的基础 overhead
		total += 4;
	}
	return total;
}
