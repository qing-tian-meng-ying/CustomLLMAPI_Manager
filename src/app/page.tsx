'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/page-shell';
import { useCopy } from '@/hooks/use-copy';
import { formatShortDate, formatDuration, formatTokens } from '@/lib/format';
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
	Globe,
} from 'lucide-react';

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
	const [gatewayUrl, setGatewayUrl] = useState('http://localhost:5000/api/v1');

	const { copy: copyKey, copied: copiedKey } = useCopy();
	const { copy: copyUrl, copied: copiedUrl } = useCopy();

	useEffect(() => {
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
				fetch('/api/gateway-keys'),
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

	const totalCalls = stats.reduce((sum, s) => sum + s.call_count, 0);
	const totalTokens = stats.reduce((sum, s) => sum + s.total_tokens, 0);
	const avgResponseTime =
		stats.length > 0
			? Math.round(stats.reduce((sum, s) => sum + s.avg_duration_ms, 0) / stats.length)
			: 0;

	const statsCards = [
		{
			label: '总调用次数',
			value: loading ? null : totalCalls.toLocaleString(),
			icon: BarChart3,
			tint: 'bg-primary/10 text-primary',
		},
		{
			label: '总 Tokens',
			value: loading ? null : formatTokens(totalTokens),
			icon: Cpu,
			tint: 'bg-primary/10 text-primary',
		},
		{
			label: '平均响应时间',
			value: loading ? null : formatDuration(avgResponseTime),
			icon: Clock,
			tint: 'bg-primary/10 text-primary',
		},
		{
			label: '活跃提供商',
			value: loading ? null : String(stats.length),
			icon: Database,
			tint: 'bg-primary/10 text-primary',
		},
	];

	const curlExample = `curl -X POST ${gatewayUrl.replace('/api/v1', '')}/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'`;

	return (
		<PageShell
			title="AI API Gateway"
			subtitle="统一大模型 API 分发与调用记录"
			icon={Database}
		>
			{/* Stats Cards - 首屏可见 */}
			<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
				{statsCards.map((stat) => {
					const Icon = stat.icon;
					return (
						<Card key={stat.label}>
							<CardContent className="pt-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm text-muted-foreground">{stat.label}</p>
										<div className="mt-1 text-2xl font-bold tabular-nums">
											{stat.value === null ? (
												<Skeleton className="h-8 w-20" />
											) : (
												stat.value
											)}
										</div>
									</div>
									<div className={`flex h-11 w-11 items-center justify-center rounded-full ${stat.tint}`}>
										<Icon className="h-5 w-5" />
									</div>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			{/* Quick Actions */}
			<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
				<Link href="/keys" className="block">
					<Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
						<CardHeader>
							<div className="flex items-center gap-3">
								<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<Key className="h-4 w-4" />
								</span>
								<CardTitle className="text-lg">API Key 管理</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="text-base">
								配置和管理各大 AI 服务商的 API Key，支持 OpenAI、Claude、DeepSeek 等
							</CardDescription>
							<div className="mt-4 flex items-center text-sm font-medium text-primary">
								管理 Keys <ArrowRight className="ml-1 h-4 w-4" />
							</div>
						</CardContent>
					</Card>
				</Link>

				<Link href="/logs" className="block">
					<Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
						<CardHeader>
							<div className="flex items-center gap-3">
								<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<History className="h-4 w-4" />
								</span>
								<CardTitle className="text-lg">调用记录</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="text-base">
								查看所有 API 调用详情，包括请求参数、响应内容和消耗统计
							</CardDescription>
							<div className="mt-4 flex items-center text-sm font-medium text-primary">
								查看记录 <ArrowRight className="ml-1 h-4 w-4" />
							</div>
						</CardContent>
					</Card>
				</Link>

				<Link href="/test" className="block">
					<Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
						<CardHeader>
							<div className="flex items-center gap-3">
								<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<Play className="h-4 w-4" />
								</span>
								<CardTitle className="text-lg">测试接口</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="text-base">
								在线测试 API 调用，支持多模型切换和流式输出预览
							</CardDescription>
							<div className="mt-4 flex items-center text-sm font-medium text-primary">
								开始测试 <ArrowRight className="ml-1 h-4 w-4" />
							</div>
						</CardContent>
					</Card>
				</Link>
			</div>

			{/* Gateway Info Card */}
			<Card className="mb-8 overflow-hidden border-primary/20 bg-primary/5">
				<CardHeader>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Key className="h-5 w-5 text-primary" />
							<CardTitle className="text-lg">网关接入信息</CardTitle>
							<Badge variant="secondary">{gatewayKeys.length} 个 Key</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Gateway URL */}
					<div>
						<div className="mb-2 flex items-center gap-2">
							<Globe className="h-4 w-4 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">网关地址</span>
						</div>
						<div className="flex items-center gap-2 rounded-lg border bg-background p-3">
							<code className="flex-1 font-mono text-sm break-all">{gatewayUrl}</code>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => copyUrl(gatewayUrl, '网关地址')}
							>
								{copiedUrl ? (
									<CheckCircle2 className="h-4 w-4 text-primary" />
								) : (
									<Copy className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>

					{/* Gateway Keys */}
					{loading ? (
						<Skeleton className="h-20 w-full" />
					) : gatewayKeys.length > 0 ? (
						<div className="space-y-3">
							{gatewayKeys.slice(0, 2).map((key) => (
								<div key={key.id}>
									<div className="mb-2 flex items-center gap-2">
										<Key className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm">{key.name}</span>
										{key.is_active ? (
											<Badge variant="secondary" className="bg-primary/10 text-primary">
												活跃
											</Badge>
										) : (
											<Badge variant="secondary" className="bg-destructive/10 text-destructive">
												已禁用
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2 rounded-lg border bg-background p-3">
										<code className="flex-1 font-mono text-sm break-all">{key.key}</code>
										<Button
											size="sm"
											variant="ghost"
											className="shrink-0"
											onClick={() => copyKey(key.key, 'API Key')}
										>
											{copiedKey ? (
												<CheckCircle2 className="h-4 w-4 text-primary" />
											) : (
												<Copy className="h-4 w-4" />
											)}
										</Button>
									</div>
									<div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
										<span>请求: {key.total_requests}</span>
										<span>Tokens: {key.total_tokens.toLocaleString()}</span>
									</div>
								</div>
							))}
							{gatewayKeys.length > 2 && (
								<Link href="/keys">
									<Button variant="ghost" size="sm" className="w-full">
										查看全部 {gatewayKeys.length} 个 Key
									</Button>
								</Link>
							)}
						</div>
					) : (
						<div className="rounded-lg border border-dashed p-4 text-center">
							<p className="mb-2 text-muted-foreground">暂无网关 Key</p>
							<Link href="/keys">
								<Button size="sm" variant="ghost">
									创建第一个 Key
								</Button>
							</Link>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Recent Logs & Providers */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Recent Logs */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<History className="h-5 w-5 text-muted-foreground" />
								<CardTitle>最近调用</CardTitle>
							</div>
							<Link href="/logs">
								<Button variant="ghost" size="sm" className="text-muted-foreground">
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
							<div className="py-8 text-center text-muted-foreground">
								<p>暂无调用记录</p>
								<Link href="/test">
									<Button variant="link" className="mt-2 text-primary">
										去测试
									</Button>
								</Link>
							</div>
						) : (
							<div className="divide-y divide-border">
								{recentLogs.map((log) => (
									<div
										key={log.id}
										className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
									>
										<div className="flex items-center gap-3">
											<Badge variant="outline" className="capitalize">
												{log.provider}
											</Badge>
											<span className="text-sm">{log.model}</span>
										</div>
										<div className="flex items-center gap-4 text-sm text-muted-foreground">
											<span className="tabular-nums">{formatTokens(log.total_tokens)} tokens</span>
											<span className="tabular-nums">{formatDuration(log.duration_ms)}</span>
											<span className="text-xs tabular-nums">{formatShortDate(log.created_at)}</span>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Provider Stats */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<Database className="h-5 w-5 text-muted-foreground" />
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
							<div className="py-8 text-center text-muted-foreground">
								<p>暂无统计数据</p>
								<Link href="/keys">
									<Button variant="link" className="mt-2 text-primary">
										添加 API Key
									</Button>
								</Link>
							</div>
						) : (
							<div className="space-y-3">
								{stats.map((stat) => (
									<div key={stat.provider} className="rounded-lg bg-muted/50 p-4">
										<div className="mb-2 flex items-center justify-between">
											<Badge variant="secondary" className="capitalize">
												{stat.provider}
											</Badge>
											<span className="text-sm font-medium tabular-nums">
												{stat.call_count} 次调用
											</span>
										</div>
										<div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
											<div>
												<span className="block text-xs">Tokens</span>
												<span className="tabular-nums">{formatTokens(stat.total_tokens)}</span>
											</div>
											<div>
												<span className="block text-xs">平均延迟</span>
												<span className="tabular-nums">{formatDuration(stat.avg_duration_ms)}</span>
											</div>
											<div>
												<span className="block text-xs">模型</span>
												<span className="tabular-nums">{stat.models.length}</span>
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
			<Card className="mt-6">
				<CardContent className="pt-6">
					<div className="flex items-start gap-4">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<Sparkles className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<h3 className="mb-2 font-semibold">统一 API 调用方式</h3>
							<p className="mb-3 text-sm text-muted-foreground">
								通过本网关调用时，只需将请求发送到统一的端点，系统会自动根据模型名或配置的默认 Key 路由到对应的 AI 服务商。
							</p>
							<div className="overflow-hidden rounded-lg border bg-muted/50">
								<div className="flex items-center justify-between border-b bg-muted/80 px-4 py-1.5">
									<span className="font-mono text-xs text-muted-foreground">bash</span>
									<Button
										variant="ghost"
										size="sm"
										className="h-7"
										onClick={() => copyUrl(curlExample, '示例代码')}
									>
										<Copy className="h-3.5 w-3.5" />
										复制
									</Button>
								</div>
								<pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground">
									{curlExample}
								</pre>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
