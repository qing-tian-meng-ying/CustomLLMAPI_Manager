'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
	Key, 
	History, 
	BarChart3, 
	Play, 
	Database, 
	Clock, 
	Cpu,
	ArrowRight,
	Sparkles,
	Copy,
	CheckCircle2,
	Globe
} from 'lucide-react';
import { toast } from 'sonner';

interface StatsData {
	provider: string;
	call_count: number;
	total_tokens: number;
	avg_duration_ms: number;
	models: string[];
}

interface RecentLog {
	id: string;
	provider: string;
	model: string;
	request_tokens: number;
	response_tokens: number;
	total_tokens: number;
	duration_ms: number;
	created_at: string;
}

interface GatewayKey {
	id: string;
	name: string;
	key: string;
	is_active: boolean;
	total_requests: number;
	total_tokens: number;
}

export default function DashboardPage() {
	const [stats, setStats] = useState<StatsData[]>([]);
	const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
	const [gatewayKeys, setGatewayKeys] = useState<GatewayKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [copiedKey, setCopiedKey] = useState(false);
	const [copiedUrl, setCopiedUrl] = useState(false);
	const [gatewayUrl, setGatewayUrl] = useState('http://localhost:5000/api/v1');

	useEffect(() => {
		// 在客户端设置真实的 URL
		if (typeof window !== 'undefined') {
			setGatewayUrl(`${window.location.origin}/api/v1`);
		}
		fetchDashboardData();
	}, []);

	const fetchDashboardData = async () => {
		try {
			const [statsRes, logsRes, keysRes] = await Promise.all([
				fetch('/api/stats'),
				fetch('/api/logs?pageSize=5'),
				fetch('/api/gateway-keys')
			]);
			
			if (statsRes.ok) {
				const statsData = await statsRes.json();
				setStats(statsData.data || []);
			}
			
			if (logsRes.ok) {
				const logsData = await logsRes.json();
				setRecentLogs(logsData.data || []);
			}
			
			if (keysRes.ok) {
				const keysData = await keysRes.json();
				setGatewayKeys(keysData.data || []);
			}
		} catch (error) {
			console.error('获取数据失败:', error);
		} finally {
			setLoading(false);
		}
	};

	const copyToClipboard = (text: string, type: 'key' | 'url') => {
		navigator.clipboard.writeText(text);
		if (type === 'key') {
			setCopiedKey(true);
			setTimeout(() => setCopiedKey(false), 2000);
			toast.success('API Key 已复制');
		} else {
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
			toast.success('网关地址已复制');
		}
	};

	const totalCalls = stats.reduce((sum, s) => sum + s.call_count, 0);
	const totalTokens = stats.reduce((sum, s) => sum + s.total_tokens, 0);
	const avgResponseTime = stats.length > 0 
		? Math.round(stats.reduce((sum, s) => sum + s.avg_duration_ms, 0) / stats.length)
		: 0;

	const formatTime = (ms: number) => {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	};

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
							<Database className="w-8 h-8 text-white" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-slate-900 dark:text-white">
								AI API Gateway
							</h1>
							<p className="text-slate-500 dark:text-slate-400">
								统一大模型 API 分发与调用记录
							</p>
						</div>
					</div>
				</div>

				{/* Gateway Info Card */}
				<Card className="mb-8 bg-gradient-to-r from-blue-500 to-purple-600 border-0 shadow-xl">
					<CardContent className="pt-6">
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-4">
									<Key className="w-5 h-5 text-white" />
									<h2 className="text-xl font-bold text-white">网关接入信息</h2>
									<Badge className="bg-white/20 text-white border-0">
										{gatewayKeys.length} 个 Key
									</Badge>
								</div>
								
								{/* Gateway URL */}
								<div className="mb-4">
									<div className="flex items-center gap-2 mb-2">
										<Globe className="w-4 h-4 text-white/80" />
										<span className="text-sm text-white/80">网关地址</span>
									</div>
									<div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-3">
										<code className="flex-1 text-white font-mono text-sm">
											{gatewayUrl}
										</code>
										<Button
											size="sm"
											variant="ghost"
											className="text-white hover:bg-white/20"
											onClick={() => copyToClipboard(gatewayUrl, 'url')}
										>
											{copiedUrl ? (
												<CheckCircle2 className="w-4 h-4" />
											) : (
												<Copy className="w-4 h-4" />
											)}
										</Button>
									</div>
								</div>

								{/* Gateway Keys */}
								{loading ? (
									<Skeleton className="h-20 w-full bg-white/20" />
								) : gatewayKeys.length > 0 ? (
									<div className="space-y-3">
										{gatewayKeys.slice(0, 2).map((key) => (
											<div key={key.id}>
												<div className="flex items-center gap-2 mb-2">
													<Key className="w-4 h-4 text-white/80" />
													<span className="text-sm text-white/80">{key.name}</span>
													{key.is_active ? (
														<Badge className="bg-green-500/20 text-green-100 border-0 text-xs">
															活跃
														</Badge>
													) : (
														<Badge className="bg-red-500/20 text-red-100 border-0 text-xs">
															已禁用
														</Badge>
													)}
												</div>
												<div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-3">
													<code className="flex-1 text-white font-mono text-sm break-all">
														{key.key}
													</code>
													<Button
														size="sm"
														variant="ghost"
														className="text-white hover:bg-white/20 shrink-0"
														onClick={() => copyToClipboard(key.key, 'key')}
													>
														{copiedKey ? (
															<CheckCircle2 className="w-4 h-4" />
														) : (
															<Copy className="w-4 h-4" />
														)}
													</Button>
												</div>
												<div className="flex items-center gap-4 mt-2 text-xs text-white/60">
													<span>请求: {key.total_requests}</span>
													<span>Tokens: {key.total_tokens.toLocaleString()}</span>
												</div>
											</div>
										))}
										{gatewayKeys.length > 2 && (
											<Link href="/gateway-keys">
												<Button variant="ghost" size="sm" className="text-white hover:bg-white/20 w-full">
													查看全部 {gatewayKeys.length} 个 Key
												</Button>
											</Link>
										)}
									</div>
								) : (
									<div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
										<p className="text-white/80 mb-2">暂无网关 Key</p>
										<Link href="/gateway-keys">
											<Button size="sm" variant="ghost" className="text-white hover:bg-white/20">
												创建第一个 Key
											</Button>
										</Link>
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stats Cards */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardContent className="pt-6">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-slate-500 dark:text-slate-400">总调用次数</p>
									<div className="text-2xl font-bold text-slate-900 dark:text-white">
										{loading ? <Skeleton className="h-8 w-20" /> : totalCalls.toLocaleString()}
									</div>
								</div>
								<div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
									<BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardContent className="pt-6">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-slate-500 dark:text-slate-400">总 Tokens</p>
									<div className="text-2xl font-bold text-slate-900 dark:text-white">
										{loading ? <Skeleton className="h-8 w-20" /> : (totalTokens / 1000000).toFixed(2) + 'M'}
									</div>
								</div>
								<div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
									<Cpu className="w-6 h-6 text-green-600 dark:text-green-400" />
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardContent className="pt-6">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-slate-500 dark:text-slate-400">平均响应时间</p>
									<div className="text-2xl font-bold text-slate-900 dark:text-white">
										{loading ? <Skeleton className="h-8 w-20" /> : formatTime(avgResponseTime)}
									</div>
								</div>
								<div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
									<Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardContent className="pt-6">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-slate-500 dark:text-slate-400">活跃提供商</p>
									<div className="text-2xl font-bold text-slate-900 dark:text-white">
										{loading ? <Skeleton className="h-8 w-20" /> : stats.length}
									</div>
								</div>
								<div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full">
									<Database className="w-6 h-6 text-orange-600 dark:text-orange-400" />
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Quick Actions */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
					<Link href="/keys" className="block">
						<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="p-2 bg-blue-500 rounded-lg">
										<Key className="w-5 h-5 text-white" />
									</div>
									<CardTitle className="text-lg">API Key 管理</CardTitle>
								</div>
							</CardHeader>
							<CardContent>
								<CardDescription className="text-base">
									配置和管理各大 AI 服务商的 API Key，支持 OpenAI、Claude、DeepSeek 等
								</CardDescription>
								<div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium">
									管理 Keys <ArrowRight className="w-4 h-4 ml-1" />
								</div>
							</CardContent>
						</Card>
					</Link>

					<Link href="/logs" className="block">
						<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="p-2 bg-green-500 rounded-lg">
										<History className="w-5 h-5 text-white" />
									</div>
									<CardTitle className="text-lg">调用记录</CardTitle>
								</div>
							</CardHeader>
							<CardContent>
								<CardDescription className="text-base">
									查看所有 API 调用详情，包括请求参数、响应内容和消耗统计
								</CardDescription>
								<div className="mt-4 flex items-center text-green-600 dark:text-green-400 text-sm font-medium">
									查看记录 <ArrowRight className="w-4 h-4 ml-1" />
								</div>
							</CardContent>
						</Card>
					</Link>

					<Link href="/test" className="block">
						<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full">
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="p-2 bg-purple-500 rounded-lg">
										<Play className="w-5 h-5 text-white" />
									</div>
									<CardTitle className="text-lg">测试接口</CardTitle>
								</div>
							</CardHeader>
							<CardContent>
								<CardDescription className="text-base">
									在线测试 API 调用，支持多模型切换和流式输出预览
								</CardDescription>
								<div className="mt-4 flex items-center text-purple-600 dark:text-purple-400 text-sm font-medium">
									开始测试 <ArrowRight className="w-4 h-4 ml-1" />
								</div>
							</CardContent>
						</Card>
					</Link>
				</div>

				{/* Recent Logs & Providers */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Recent Logs */}
					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardHeader>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<History className="w-5 h-5 text-slate-600 dark:text-slate-400" />
									<CardTitle>最近调用</CardTitle>
								</div>
								<Link href="/logs">
									<Button variant="ghost" size="sm" className="text-slate-500">
										查看全部
									</Button>
								</Link>
							</div>
						</CardHeader>
						<CardContent>
							{loading ? (
								<div className="space-y-3">
									{[1, 2, 3].map((i) => (
										<Skeleton key={i} className="h-12 w-full" />
									))}
								</div>
							) : recentLogs.length === 0 ? (
								<div className="text-center py-8 text-slate-500">
									<p>暂无调用记录</p>
									<Link href="/test">
										<Button variant="link" className="mt-2 text-blue-600">
											去测试
										</Button>
									</Link>
								</div>
							) : (
								<div className="space-y-3">
									{recentLogs.map((log) => (
										<div
											key={log.id}
											className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50"
										>
											<div className="flex items-center gap-3">
												<Badge variant="outline" className="capitalize">
													{log.provider}
												</Badge>
												<span className="text-sm text-slate-600 dark:text-slate-300">
													{log.model}
												</span>
											</div>
											<div className="flex items-center gap-4 text-sm text-slate-500">
												<span>{log.total_tokens} tokens</span>
												<span>{formatTime(log.duration_ms)}</span>
												<span className="text-xs">{formatDate(log.created_at)}</span>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Provider Stats */}
					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
						<CardHeader>
							<div className="flex items-center gap-3">
								<Database className="w-5 h-5 text-slate-600 dark:text-slate-400" />
								<CardTitle>提供商统计</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							{loading ? (
								<div className="space-y-3">
									{[1, 2, 3].map((i) => (
										<Skeleton key={i} className="h-16 w-full" />
									))}
								</div>
							) : stats.length === 0 ? (
								<div className="text-center py-8 text-slate-500">
									<p>暂无统计数据</p>
									<Link href="/keys">
										<Button variant="link" className="mt-2 text-blue-600">
											添加 API Key
										</Button>
									</Link>
								</div>
							) : (
								<div className="space-y-4">
									{stats.map((stat) => (
										<div
											key={stat.provider}
											className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50"
										>
											<div className="flex items-center justify-between mb-2">
												<div className="flex items-center gap-2">
													<Badge className="capitalize bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
														{stat.provider}
													</Badge>
												</div>
												<span className="text-sm font-medium text-slate-900 dark:text-white">
													{stat.call_count} 次调用
												</span>
											</div>
											<div className="grid grid-cols-3 gap-4 text-sm text-slate-500">
												<div>
													<span className="block text-xs">Tokens</span>
													<span>{(stat.total_tokens / 1000).toFixed(1)}K</span>
												</div>
												<div>
													<span className="block text-xs">平均延迟</span>
													<span>{formatTime(stat.avg_duration_ms)}</span>
												</div>
												<div>
													<span className="block text-xs">模型</span>
													<span className="truncate">{stat.models.length}</span>
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Usage Instructions */}
				<Card className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800/50 dark:to-slate-700/50 border-0">
					<CardContent className="pt-6">
						<div className="flex items-start gap-4">
							<div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
								<Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
							</div>
							<div>
								<h3 className="font-semibold text-slate-900 dark:text-white mb-2">
									统一 API 调用方式
								</h3>
								<p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
									通过本网关调用时，只需将请求发送到统一的端点，系统会自动根据模型名或配置的默认 Key 路由到对应的 AI 服务商。
								</p>
								<div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-4 font-mono text-sm overflow-x-auto">
									<pre className="text-green-400">{`curl -X POST ${gatewayUrl.replace('/api/v1', '')}/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'`}</pre>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
