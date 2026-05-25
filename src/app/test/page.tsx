'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
	Play,
	Trash2,
	Loader2,
	Cpu,
	Clock,
	Copy,
	Download,
	Plus,
	User,
	Bot,
	Settings
} from 'lucide-react';
import { toast } from 'sonner';

interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface ApiKey {
	id: string;
	name: string;
	provider: string;
	model: string;
	is_active: boolean;
}

interface ApiKeyOption {
	value: string;
	label: string;
	provider: string;
	model: string;
}

interface StreamChunk {
	id: string;
	delta: string;
	done: boolean;
}

export default function TestPage() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [systemPrompt, setSystemPrompt] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [streamOutput, setStreamOutput] = useState('');
	const [loading, setLoading] = useState(false);
	const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
	const [selectedKey, setSelectedKey] = useState<string>('');
	const [model, setModel] = useState('');
	const [temperature, setTemperature] = useState(0.7);
	const [maxTokens, setMaxTokens] = useState(2048);
	const [streamEnabled, setStreamEnabled] = useState(true);
	const [stats, setStats] = useState<{ tokens: number; duration: number } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const outputRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		fetchApiKeys();
	}, []);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	useEffect(() => {
		if (outputRef.current) {
			outputRef.current.scrollTop = outputRef.current.scrollHeight;
		}
	}, [streamOutput]);

	const fetchApiKeys = async () => {
		try {
			const res = await fetch('/api/keys');
			if (res.ok) {
				const data = await res.json();
				const keys = (data.data || []).filter((k: ApiKey) => k.is_active) as ApiKey[];
				const options: ApiKeyOption[] = keys.map((k) => ({
					value: k.id,
					label: `${k.name} (${k.model})`,
					provider: k.provider,
					model: k.model,
				}));
				setApiKeys(options);
				if (options.length > 0 && !selectedKey) {
					setSelectedKey(options[0].value);
					setModel(options[0].model);
				}
			}
		} catch (error) {
			console.error('获取 API Keys 失败:', error);
		}
	};

	const handleKeyChange = (keyId: string) => {
		setSelectedKey(keyId);
		const key = apiKeys.find((k) => k.value === keyId);
		if (key) {
			setModel(key.model);
		}
	};

	const handleSend = async () => {
		if (!input.trim()) return;
		if (apiKeys.length === 0) {
			toast.error('请先添加 API Key');
			return;
		}

		const userMessage: Message = { role: 'user', content: input };
		setMessages((prev) => [...prev, userMessage]);
		setInput('');
		setError(null);
		setStats(null);

		const allMessages = [
			...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
			...messages,
			userMessage,
		];

		const startTime = Date.now();

		if (streamEnabled) {
			setStreaming(true);
			setStreamOutput('');
			await handleStreamRequest(allMessages, startTime);
		} else {
			setLoading(true);
			await handleNormalRequest(allMessages, startTime);
		}
	};

	const handleStreamRequest = async (allMessages: Message[], startTime: number) => {
		try {
			const selectedKeyData = apiKeys.find((k) => k.value === selectedKey);
			
			const res = await fetch('/api/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: model,
					messages: allMessages,
					stream: true,
					temperature,
					max_tokens: maxTokens,
					provider: selectedKeyData?.provider,
				}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error?.message || '请求失败');
			}

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let fullContent = '';
			let requestTokens = 0;

			if (!reader) throw new Error('无法获取响应流');

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const content = parsed.choices?.[0]?.delta?.content || '';
							if (content) {
								fullContent += content;
								setStreamOutput((prev) => prev + content);
							}
							if (parsed.usage) {
								requestTokens = parsed.usage.prompt_tokens || 0;
							}
						} catch {
							// 忽略解析错误
						}
					}
				}
			}

			const duration = Date.now() - startTime;
			setStats({
				tokens: requestTokens + fullContent.length / 4,
				duration,
			});

			if (fullContent) {
				setMessages((prev) => [...prev, { role: 'assistant', content: fullContent }]);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : '请求失败';
			setError(errorMessage);
			toast.error(errorMessage);
		} finally {
			setStreaming(false);
		}
	};

	const handleNormalRequest = async (allMessages: Message[], startTime: number) => {
		try {
			const selectedKeyData = apiKeys.find((k) => k.value === selectedKey);
			
			const res = await fetch('/api/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: model,
					messages: allMessages,
					stream: false,
					temperature,
					max_tokens: maxTokens,
					provider: selectedKeyData?.provider,
				}),
			});

			const duration = Date.now() - startTime;
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error?.message || '请求失败');
			}

			const content = data.choices?.[0]?.message?.content || '';
			const usage = data.usage || {};

			setStats({
				tokens: usage.total_tokens || content.length / 4,
				duration,
			});

			if (content) {
				setMessages((prev) => [...prev, { role: 'assistant', content }]);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : '请求失败';
			setError(errorMessage);
			toast.error(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const clearMessages = () => {
		setMessages([]);
		setStreamOutput('');
		setError(null);
		setStats(null);
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success('已复制到剪贴板');
	};

	const downloadConversation = () => {
		const content = messages
			.map((m) => `${m.role.toUpperCase()}:\n${m.content}\n`)
			.join('\n---\n\n');
		
		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `conversation-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const addSystemPrompt = () => {
		setSystemPrompt('你是一个有帮助的AI助手。');
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
							<Play className="w-6 h-6 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-white">
								测试接口
							</h1>
							<p className="text-sm text-slate-500 dark:text-slate-400">
								在线测试 AI API 调用
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={downloadConversation} disabled={messages.length === 0}>
							<Download className="w-4 h-4 mr-2" />
							导出对话
						</Button>
						<Button variant="outline" onClick={clearMessages} disabled={messages.length === 0}>
							<Trash2 className="w-4 h-4 mr-2" />
							清空
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
					{/* Settings Panel */}
					<div className="lg:col-span-1">
						<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg sticky top-6">
							<CardHeader className="pb-4">
								<CardTitle className="text-lg">参数设置</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label>API Key</Label>
									<Select value={selectedKey} onValueChange={handleKeyChange}>
										<SelectTrigger>
											<SelectValue placeholder="选择 API Key" />
										</SelectTrigger>
										<SelectContent>
											{apiKeys.length === 0 ? (
												<div className="p-2 text-sm text-slate-500">暂无 API Key</div>
											) : (
												apiKeys.map((k) => (
													<SelectItem key={k.value} value={k.value}>
														<div className="flex flex-col">
															<span>{k.label}</span>
															<span className="text-xs text-slate-400">{k.provider}</span>
														</div>
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>模型</Label>
									<Input
										value={model}
										onChange={(e) => setModel(e.target.value)}
										placeholder="gpt-4o"
									/>
								</div>

								<div className="space-y-2">
									<Label>Temperature: {temperature}</Label>
									<Input
										type="range"
										min="0"
										max="2"
										step="0.1"
										value={temperature}
										onChange={(e) => setTemperature(parseFloat(e.target.value))}
										className="w-full"
									/>
								</div>

								<div className="space-y-2">
									<Label>Max Tokens: {maxTokens}</Label>
									<Input
										type="range"
										min="100"
										max="8192"
										step="100"
										value={maxTokens}
										onChange={(e) => setMaxTokens(parseInt(e.target.value))}
										className="w-full"
									/>
								</div>

								<div className="flex items-center justify-between">
									<Label htmlFor="stream">流式输出</Label>
									<Switch
										id="stream"
										checked={streamEnabled}
										onCheckedChange={setStreamEnabled}
									/>
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label>System Prompt</Label>
										<Button variant="ghost" size="sm" onClick={addSystemPrompt}>
											<Plus className="w-4 h-4" />
										</Button>
									</div>
									<Textarea
										value={systemPrompt}
										onChange={(e) => setSystemPrompt(e.target.value)}
										placeholder="可选的系统提示词..."
										rows={4}
									/>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Chat Panel */}
					<div className="lg:col-span-3">
						<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg h-[calc(100vh-200px)] flex flex-col">
							{/* Messages */}
							<div className="flex-1 overflow-y-auto p-4 space-y-4">
								{messages.length === 0 && !streaming && (
									<div className="h-full flex flex-col items-center justify-center text-slate-400">
										<Bot className="w-16 h-16 mb-4" />
										<p className="text-lg mb-2">开始对话</p>
										<p className="text-sm">输入消息开始测试 API</p>
									</div>
								)}

								{messages.map((msg, idx) => (
									<div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
										<div className={`w-8 h-8 rounded-full flex items-center justify-center ${
											msg.role === 'user'
												? 'bg-blue-500 text-white'
												: msg.role === 'system'
												? 'bg-purple-500 text-white'
												: 'bg-green-500 text-white'
										}`}>
											{msg.role === 'user' ? (
												<User className="w-4 h-4" />
											) : msg.role === 'system' ? (
												<Settings className="w-4 h-4" />
											) : (
												<Bot className="w-4 h-4" />
											)}
										</div>
										<div className={`max-w-[80%] rounded-lg p-4 ${
											msg.role === 'user'
												? 'bg-blue-100 dark:bg-blue-900/30'
												: 'bg-slate-100 dark:bg-slate-700'
										}`}>
											<p className="whitespace-pre-wrap text-slate-900 dark:text-white">
												{msg.content}
											</p>
										</div>
									</div>
								))}

								{streaming && (
									<div className="flex gap-3">
										<div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center">
											<Bot className="w-4 h-4" />
										</div>
										<div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 max-w-[80%]">
											<div className="flex items-center gap-2 text-slate-500">
												<Loader2 className="w-4 h-4 animate-spin" />
												<span>生成中...</span>
											</div>
										</div>
									</div>
								)}

								<div ref={messagesEndRef} />
							</div>

							{/* Stream Output */}
							{streaming && streamOutput && (
								<div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-900">
									<div className="flex items-center justify-between mb-2">
										<span className="text-sm text-slate-400">流式输出</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => copyToClipboard(streamOutput)}
										>
											<Copy className="w-4 h-4 mr-1" />
											复制
										</Button>
									</div>
									<pre
										ref={outputRef}
										className="text-sm text-green-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto"
									>
										{streamOutput}
									</pre>
								</div>
							)}

							{/* Error */}
							{error && (
								<div className="border-t border-red-200 dark:border-red-800 p-4 bg-red-50 dark:bg-red-900/20">
									<p className="text-sm text-red-600 dark:text-red-400">{error}</p>
								</div>
							)}

							{/* Stats */}
							{stats && !streaming && (
								<div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
									<div className="flex items-center gap-6 text-sm">
										<div className="flex items-center gap-2">
											<Cpu className="w-4 h-4 text-slate-500" />
											<span className="text-slate-600 dark:text-slate-400">
												{Math.round(stats.tokens)} tokens
											</span>
										</div>
										<div className="flex items-center gap-2">
											<Clock className="w-4 h-4 text-slate-500" />
											<span className="text-slate-600 dark:text-slate-400">
												{(stats.duration / 1000).toFixed(2)}s
											</span>
										</div>
									</div>
								</div>
							)}

							{/* Input */}
							<div className="border-t border-slate-200 dark:border-slate-700 p-4">
								<div className="flex gap-2">
									<Textarea
										value={input}
										onChange={(e) => setInput(e.target.value)}
										onKeyDown={handleKeyDown}
										placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
										rows={1}
										className="flex-1 resize-none"
										disabled={loading || streaming}
									/>
									<Button
										onClick={handleSend}
										disabled={loading || streaming || !input.trim()}
										className="bg-blue-600 hover:bg-blue-700"
									>
										{loading || streaming ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											<Play className="w-4 h-4" />
										)}
									</Button>
								</div>
							</div>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
