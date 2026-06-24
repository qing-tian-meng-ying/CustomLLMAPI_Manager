'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageShell } from '@/components/page-shell';
import { useCopy } from '@/hooks/use-copy';
import {
	Play,
	Trash2,
	Loader2,
	Cpu,
	Clock,
	Copy,
	Download,
	Sparkles,
	User,
	Bot,
	Settings,
	Key as KeyIcon,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface ApiKey {
	id: string;
	name: string;
	provider: string;
	models: string[];
	is_active: boolean;
}

interface ApiKeyOption {
	value: string;
	label: string;
	provider: string;
	models: string[];
}

export default function TestPage() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [systemPrompt, setSystemPrompt] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [streamOutput, setStreamOutput] = useState('');
	const [loading, setLoading] = useState(false);
	const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
	const [keysLoading, setKeysLoading] = useState(true);
	const [selectedKey, setSelectedKey] = useState<string>('');
	const [model, setModel] = useState('');
	const [temperature, setTemperature] = useState(0.7);
	const [maxTokens, setMaxTokens] = useState(2048);
	const [streamEnabled, setStreamEnabled] = useState(true);
	const [stats, setStats] = useState<{ tokens: number; duration: number } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const outputRef = useRef<HTMLPreElement>(null);

	const { copy: copyOutput } = useCopy();

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
					label: `${k.name} (${k.models.length} 个模型)`,
					provider: k.provider,
					models: k.models,
				}));
				setApiKeys(options);
				if (options.length > 0 && !selectedKey) {
					setSelectedKey(options[0].value);
					setModel(options[0].models[0] || '');
				}
			}
		} catch (error) {
			console.error('获取 API Keys 失败:', error);
		} finally {
			setKeysLoading(false);
		}
	};

	const handleKeyChange = (keyId: string) => {
		setSelectedKey(keyId);
		const key = apiKeys.find((k) => k.value === keyId);
		if (key) {
			// 切换 key 时，模型默认设为该 key 的第一个模型
			setModel(key.models[0] || '');
		}
	};

	// 当前选中 key 的模型列表，用于模型下拉
	const currentKeyModels = apiKeys.find((k) => k.value === selectedKey)?.models ?? [];

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

	// 填充示例 system prompt（原 addSystemPrompt，命名误导，改名为 fillExamplePrompt）
	const fillExamplePrompt = () => {
		setSystemPrompt('你是一个有帮助的AI助手。');
	};

	const noKeys = !keysLoading && apiKeys.length === 0;

	return (
		<PageShell
			title="测试接口"
			subtitle="在线测试 AI API 调用"
			icon={Play}
			actions={
				<>
					<Button
						variant="outline"
						onClick={downloadConversation}
						disabled={messages.length === 0}
					>
						<Download className="mr-2 h-4 w-4" />
						导出对话
					</Button>
					<Button variant="outline" onClick={clearMessages} disabled={messages.length === 0}>
						<Trash2 className="mr-2 h-4 w-4" />
						清空
					</Button>
				</>
			}
		>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
				{/* Settings Panel */}
				<div className="lg:col-span-1">
					<Card className="sticky top-20">
						<CardHeader className="pb-4">
							<CardTitle className="text-lg">参数设置</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{keysLoading ? (
								<div className="space-y-3">
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
								</div>
							) : noKeys ? (
								<div className="rounded-lg border border-dashed p-4 text-center">
									<KeyIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
									<p className="mb-3 text-sm text-muted-foreground">暂无可用 API Key</p>
									<Link href="/keys">
										<Button size="sm" variant="outline" className="w-full">
											去添加 API Key
										</Button>
									</Link>
								</div>
							) : (
								<>
									<div className="space-y-2">
										<Label>API Key</Label>
										<Select value={selectedKey} onValueChange={handleKeyChange}>
											<SelectTrigger>
												<SelectValue placeholder="选择 API Key" />
											</SelectTrigger>
											<SelectContent>
												{apiKeys.map((k) => (
													<SelectItem key={k.value} value={k.value}>
														<div className="flex flex-col">
															<span>{k.label}</span>
															<span className="text-xs text-muted-foreground">{k.provider}</span>
														</div>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

								<div className="space-y-2">
									<Label>模型</Label>
									{currentKeyModels.length > 0 ? (
										<Select value={model} onValueChange={setModel}>
											<SelectTrigger>
												<SelectValue placeholder="选择模型" />
											</SelectTrigger>
											<SelectContent>
												{currentKeyModels.map((m) => (
													<SelectItem key={m} value={m}>
														<span className="font-mono text-xs">{m}</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<Input
											value={model}
											onChange={(e) => setModel(e.target.value)}
											placeholder="该 Key 未配置模型，手动输入"
										/>
									)}
								</div>

									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label>Temperature</Label>
											<span className="font-mono text-sm text-primary tabular-nums">
												{temperature.toFixed(1)}
											</span>
										</div>
										<Slider
											value={[temperature]}
											min={0}
											max={2}
											step={0.1}
											onValueChange={(v) => setTemperature(v[0])}
										/>
										<div className="flex justify-between text-xs text-muted-foreground">
											<span>0</span>
											<span>2</span>
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label>Max Tokens</Label>
											<span className="font-mono text-sm text-primary tabular-nums">
												{maxTokens}
											</span>
										</div>
										<Slider
											value={[maxTokens]}
											min={100}
											max={8192}
											step={100}
											onValueChange={(v) => setMaxTokens(v[0])}
										/>
										<div className="flex justify-between text-xs text-muted-foreground">
											<span>100</span>
											<span>8192</span>
										</div>
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
											<Button
												variant="ghost"
												size="sm"
												onClick={fillExamplePrompt}
												aria-label="填充示例"
											>
												<Sparkles className="h-4 w-4" />
											</Button>
										</div>
										<Textarea
											value={systemPrompt}
											onChange={(e) => setSystemPrompt(e.target.value)}
											placeholder="可选的系统提示词..."
											rows={4}
										/>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Chat Panel */}
				<div className="lg:col-span-3">
					<Card className="flex h-[calc(100dvh-200px)] flex-col">
						{/* Messages */}
						<div className="flex-1 space-y-4 overflow-y-auto p-4">
							{messages.length === 0 && !streaming && (
								<div className="flex h-full flex-col items-center justify-center text-muted-foreground">
									{noKeys ? (
										<>
											<KeyIcon className="mb-4 h-16 w-16 text-muted-foreground/40" />
											<p className="mb-2 text-lg">还没有可用的 API Key</p>
											<p className="mb-4 text-sm">添加 Key 后即可开始测试</p>
											<Link href="/keys">
												<Button variant="outline">
													<KeyIcon className="mr-2 h-4 w-4" />
													去添加 API Key
												</Button>
											</Link>
										</>
									) : (
										<>
											<Bot className="mb-4 h-16 w-16 text-muted-foreground/40" />
											<p className="mb-2 text-lg">开始对话</p>
											<p className="text-sm">输入消息开始测试 API</p>
										</>
									)}
								</div>
							)}

							{messages.map((msg, idx) => (
								<div
									key={idx}
									className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
								>
									<div
										className={`flex h-8 w-8 items-center justify-center rounded-full ${
											msg.role === 'user'
												? 'bg-primary text-primary-foreground'
												: msg.role === 'system'
												? 'bg-muted text-muted-foreground'
												: 'bg-primary/10 text-primary'
										}`}
									>
										{msg.role === 'user' ? (
											<User className="h-4 w-4" />
										) : msg.role === 'system' ? (
											<Settings className="h-4 w-4" />
										) : (
											<Bot className="h-4 w-4" />
										)}
									</div>
									<div
										className={`max-w-[80%] rounded-lg p-4 ${
											msg.role === 'user'
												? 'bg-primary/10'
												: 'bg-muted/60'
										}`}
									>
										<p className="whitespace-pre-wrap">{msg.content}</p>
									</div>
								</div>
							))}

							{streaming && (
								<div className="flex gap-3">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
										<Bot className="h-4 w-4" />
									</div>
									<div className="max-w-[80%] rounded-lg bg-muted/60 p-4">
										<div className="flex items-center gap-2 text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											<span>生成中...</span>
										</div>
									</div>
								</div>
							)}

							<div ref={messagesEndRef} />
						</div>

						{/* Stream Output - 主题化，去掉硬黑硬绿 */}
						{streaming && streamOutput && (
							<div className="border-t border-border bg-muted/40 p-4">
								<div className="mb-2 flex items-center justify-between">
									<span className="text-sm text-muted-foreground">流式输出</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => copyOutput(streamOutput, '流式输出')}
									>
										<Copy className="mr-1 h-3.5 w-3.5" />
										复制
									</Button>
								</div>
								<pre
									ref={outputRef}
									className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed"
								>
									{streamOutput}
								</pre>
							</div>
						)}

						{/* Error */}
						{error && (
							<div className="border-t border-destructive/20 bg-destructive/5 p-4">
								<p className="text-sm text-destructive">{error}</p>
							</div>
						)}

						{/* Stats */}
						{stats && !streaming && (
							<div className="border-t border-border bg-muted/30 p-4">
								<div className="flex items-center gap-6 text-sm">
									<div className="flex items-center gap-2">
										<Cpu className="h-4 w-4 text-muted-foreground" />
										<span className="text-muted-foreground tabular-nums">
											{Math.round(stats.tokens)} tokens
										</span>
									</div>
									<div className="flex items-center gap-2">
										<Clock className="h-4 w-4 text-muted-foreground" />
										<span className="text-muted-foreground tabular-nums">
											{(stats.duration / 1000).toFixed(2)}s
										</span>
									</div>
								</div>
							</div>
						)}

						{/* Input */}
						<div className="border-t border-border p-4">
							<div className="flex gap-2">
								<Textarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={handleKeyDown}
									placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
									rows={1}
									className="flex-1 resize-none"
									disabled={loading || streaming || noKeys}
								/>
								<Button
									onClick={handleSend}
									disabled={loading || streaming || !input.trim() || noKeys}
								>
									{loading || streaming ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Play className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</PageShell>
	);
}
