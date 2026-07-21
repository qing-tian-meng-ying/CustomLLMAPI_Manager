'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	Area,
	AreaChart,
	Brush,
	CartesianGrid,
	ReferenceArea,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { Activity, MousePointerClick, Sigma, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { formatTokens } from '@/lib/format';

type Granularity = 'month' | 'week' | 'day' | 'hour' | 'minute';

interface Bucket {
	time: string;
	total: number;
	calls: number;
	models: Record<string, number>;
}

interface TokenUsageData {
	granularity: Granularity;
	models: string[];
	buckets: Bucket[];
	modelTotals: Record<string, number>;
	grandTotal: number;
	bucketCount: number;
	totalBuckets: number;
	truncated: boolean;
}

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
	{ value: 'month', label: '每月' },
	{ value: 'week', label: '每周' },
	{ value: 'day', label: '每天' },
	{ value: 'hour', label: '每小时' },
	{ value: 'minute', label: '每分钟' },
];

// 每种粒度默认展示的桶数（即默认回看窗口），保证数据点密度可读。
// 选择“全部”时用各粒度的服务端上限兜底。
const WINDOW_OPTIONS: Record<Granularity, { value: number; label: string }[]> = {
	minute: [
		{ value: 60, label: '最近 1 小时' },
		{ value: 180, label: '最近 3 小时' },
		{ value: 360, label: '最近 6 小时' },
		{ value: 0, label: '全部' },
	],
	hour: [
		{ value: 24, label: '最近 24 小时' },
		{ value: 72, label: '最近 3 天' },
		{ value: 168, label: '最近 7 天' },
		{ value: 0, label: '全部' },
	],
	day: [
		{ value: 14, label: '最近 14 天' },
		{ value: 30, label: '最近 30 天' },
		{ value: 90, label: '最近 90 天' },
		{ value: 0, label: '全部' },
	],
	week: [
		{ value: 12, label: '最近 12 周' },
		{ value: 26, label: '最近 26 周' },
		{ value: 52, label: '最近 52 周' },
		{ value: 0, label: '全部' },
	],
	month: [
		{ value: 6, label: '最近 6 个月' },
		{ value: 12, label: '最近 12 个月' },
		{ value: 24, label: '最近 24 个月' },
		{ value: 0, label: '全部' },
	],
};

// 各粒度切换时的默认窗口（对应 WINDOW_OPTIONS 第二项）。
const DEFAULT_WINDOW: Record<Granularity, number> = {
	minute: 180,
	hour: 72,
	day: 30,
	week: 26,
	month: 12,
};

// 稳定的高对比度调色板，按模型顺序循环分配
const COLOR_PALETTE = [
	'#6366f1', // indigo
	'#10b981', // emerald
	'#f59e0b', // amber
	'#ef4444', // red
	'#3b82f6', // blue
	'#ec4899', // pink
	'#14b8a6', // teal
	'#8b5cf6', // violet
	'#f97316', // orange
	'#84cc16', // lime
	'#06b6d4', // cyan
	'#a855f7', // purple
];

function colorForIndex(index: number): string {
	return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

export function TokenUsageMonitor() {
	const [granularity, setGranularity] = useState<Granularity>('day');
	const [windowSize, setWindowSize] = useState<number>(DEFAULT_WINDOW.day);
	const [data, setData] = useState<TokenUsageData | null>(null);
	const [loading, setLoading] = useState(true);

	// 切换粒度时，回看窗口重置为该粒度的默认值
	const handleGranularityChange = (value: Granularity) => {
		setGranularity(value);
		setWindowSize(DEFAULT_WINDOW[value]);
	};

	// 拖拽选区状态：记录起止桶的 time 值
	const [refLeft, setRefLeft] = useState<string | null>(null);
	const [refRight, setRefRight] = useState<string | null>(null);
	const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);

	// 受控的 Brush 缩放范围，避免父组件重渲染（如框选）时滑块被重置
	const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);

	useEffect(() => {
		let cancelled = false;
		const fetchData = async () => {
			setLoading(true);
			setSelection(null);
			setRefLeft(null);
			setRefRight(null);
			setBrushRange(null);
			try {
				// windowSize=0 表示“全部”，交由服务端上限兜底
				const limitParam = windowSize > 0 ? `&limit=${windowSize}` : '';
				const res = await fetch(`/api/stats/token-usage?granularity=${granularity}${limitParam}`);
				if (res.ok) {
					const json = await res.json();
					if (!cancelled) setData(json.data);
				}
			} catch (error) {
				console.error('获取 token 使用统计失败:', error);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		fetchData();
		return () => {
			cancelled = true;
		};
	}, [granularity, windowSize]);

	const models = data?.models ?? [];
	const buckets = data?.buckets ?? [];

	const modelColors = useMemo(() => {
		const map: Record<string, string> = {};
		models.forEach((model, index) => {
			map[model] = colorForIndex(index);
		});
		return map;
	}, [models]);

	// 把 buckets 展开成 recharts 需要的扁平结构（每个模型一个数值字段）
	const chartData = useMemo(
		() =>
			buckets.map((bucket) => ({
				time: bucket.time,
				total: bucket.total,
				...bucket.models,
			})),
		[buckets]
	);

	// 计算选区内的 token 总数、平均值与桶数
	const selectionStats = useMemo(() => {
		if (!selection || buckets.length === 0) return null;
		const times = buckets.map((b) => b.time);
		const i1 = times.indexOf(selection.start);
		const i2 = times.indexOf(selection.end);
		if (i1 === -1 || i2 === -1) return null;
		const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
		const slice = buckets.slice(from, to + 1);
		const total = slice.reduce((sum, b) => sum + b.total, 0);
		const calls = slice.reduce((sum, b) => sum + b.calls, 0);
		return {
			total,
			calls,
			count: slice.length,
			avg: slice.length > 0 ? Math.round(total / slice.length) : 0,
			startLabel: slice[0].time,
			endLabel: slice[slice.length - 1].time,
		};
	}, [selection, buckets]);

	const handleMouseDown = (e: { activeLabel?: string } | null) => {
		if (e?.activeLabel) {
			setRefLeft(e.activeLabel);
			setRefRight(e.activeLabel);
			setSelection(null);
		}
	};

	const handleMouseMove = (e: { activeLabel?: string } | null) => {
		if (refLeft !== null && e?.activeLabel) {
			setRefRight(e.activeLabel);
		}
	};

	const handleMouseUp = () => {
		if (refLeft !== null && refRight !== null && refLeft !== refRight) {
			setSelection({ start: refLeft, end: refRight });
		} else if (refLeft !== null && refRight !== null && refLeft === refRight) {
			// 单击单个桶也视为选中该桶
			setSelection({ start: refLeft, end: refRight });
		}
		setRefLeft(null);
		setRefRight(null);
	};

	const grandTotal = data?.grandTotal ?? 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2">
						<TrendingUp className="h-5 w-5 text-primary" />
						<CardTitle>Token 使用监控</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<Select value={String(windowSize)} onValueChange={(v) => setWindowSize(Number(v))}>
							<SelectTrigger className="w-36" size="sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{WINDOW_OPTIONS[granularity].map((opt) => (
									<SelectItem key={opt.value} value={String(opt.value)}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={granularity} onValueChange={(v) => handleGranularityChange(v as Granularity)}>
							<SelectTrigger className="w-28" size="sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{GRANULARITY_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				{loading ? (
					<Skeleton className="h-72 w-full" />
				) : buckets.length === 0 ? (
					<div className="flex h-72 flex-col items-center justify-center text-center text-muted-foreground">
						<Activity className="mb-2 h-8 w-8 opacity-50" />
						<p>该时间粒度下暂无 token 消耗数据</p>
					</div>
				) : (
					<>
						{/* 选区提示 */}
						<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
							<span className="flex items-center gap-1.5">
								<MousePointerClick className="h-3.5 w-3.5" />
								框选一段时间查看 token 总数与平均值；拖动图表下方滑块可缩放
							</span>
							{data?.truncated && (
								<span className="text-amber-600 dark:text-amber-500">
									数据点较多，仅显示最近 {data.bucketCount} 个时段（共 {data.totalBuckets} 个）
								</span>
							)}
						</div>

						{/* 图表 */}
						<div className="h-72 w-full select-none">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart
									data={chartData}
									margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
									onMouseDown={handleMouseDown}
									onMouseMove={handleMouseMove}
									onMouseUp={handleMouseUp}
									onMouseLeave={handleMouseUp}
								>
									<defs>
										{models.map((model) => (
											<linearGradient key={model} id={`grad-${model}`} x1="0" y1="0" x2="0" y2="1">
												<stop offset="5%" stopColor={modelColors[model]} stopOpacity={0.7} />
												<stop offset="95%" stopColor={modelColors[model]} stopOpacity={0.1} />
											</linearGradient>
										))}
									</defs>
									<CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
									<XAxis
										dataKey="time"
										tick={{ fontSize: 11 }}
										minTickGap={24}
										tickLine={false}
									/>
									<YAxis
										tick={{ fontSize: 11 }}
										tickFormatter={(v) => formatTokens(Number(v))}
										width={48}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip content={<TokenTooltip modelColors={modelColors} />} />
									{models.map((model) => (
										<Area
											key={model}
											type="monotone"
											dataKey={model}
											stackId="tokens"
											stroke={modelColors[model]}
											fill={`url(#grad-${model})`}
											strokeWidth={1.5}
											isAnimationActive={false}
										/>
									))}
									{refLeft !== null && refRight !== null && (
										<ReferenceArea
											x1={refLeft}
											x2={refRight}
											strokeOpacity={0.3}
											fill="var(--primary)"
											fillOpacity={0.15}
										/>
									)}
									{chartData.length > 30 && (
										<Brush
											dataKey="time"
											height={22}
											travellerWidth={8}
											stroke="var(--primary)"
											tickFormatter={() => ''}
											// 受控：默认只显示末尾一段，用户拖动后由 brushRange 保持
											startIndex={brushRange?.startIndex ?? Math.max(0, chartData.length - 60)}
											endIndex={brushRange?.endIndex ?? chartData.length - 1}
											onChange={(range) => {
												if (
													range &&
													typeof range.startIndex === 'number' &&
													typeof range.endIndex === 'number'
												) {
													setBrushRange({
														startIndex: range.startIndex,
														endIndex: range.endIndex,
													});
												}
											}}
										/>
									)}
								</AreaChart>
							</ResponsiveContainer>
						</div>

						{/* 选区统计 */}
						{selectionStats && (
							<div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-4">
								<div>
									<p className="text-xs text-muted-foreground">选中区间</p>
									<p className="mt-0.5 text-sm font-medium tabular-nums">
										{selectionStats.count} 个时段
									</p>
									<p className="mt-0.5 text-[11px] text-muted-foreground">
										{selectionStats.startLabel} ~ {selectionStats.endLabel}
									</p>
								</div>
								<div>
									<p className="flex items-center gap-1 text-xs text-muted-foreground">
										<Sigma className="h-3 w-3" /> Token 总数
									</p>
									<p className="mt-0.5 text-lg font-bold tabular-nums">
										{selectionStats.total.toLocaleString()}
									</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">平均每时段</p>
									<p className="mt-0.5 text-lg font-bold tabular-nums">
										{selectionStats.avg.toLocaleString()}
									</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">调用次数</p>
									<p className="mt-0.5 text-lg font-bold tabular-nums">
										{selectionStats.calls.toLocaleString()}
									</p>
								</div>
							</div>
						)}

						{/* 模型图例与比例 */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<p className="text-sm font-medium">模型消耗占比</p>
								<span className="text-xs text-muted-foreground">
									总计 {formatTokens(grandTotal)} tokens
								</span>
							</div>
							<div className="space-y-2">
								{models
									.map((model) => ({
										model,
										tokens: data?.modelTotals[model] ?? 0,
									}))
									.sort((a, b) => b.tokens - a.tokens)
									.map(({ model, tokens }) => {
										const pct = grandTotal > 0 ? (tokens / grandTotal) * 100 : 0;
										return (
											<div key={model} className="flex items-center gap-3">
												<span
													className="h-3 w-3 shrink-0 rounded-[3px]"
													style={{ backgroundColor: modelColors[model] }}
												/>
												<span className="w-40 shrink-0 truncate text-sm" title={model}>
													{model}
												</span>
												<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
													<div
														className="h-full rounded-full transition-all"
														style={{
															width: `${pct}%`,
															backgroundColor: modelColors[model],
														}}
													/>
												</div>
												<span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
													{pct.toFixed(1)}%
												</span>
												<Badge variant="secondary" className="w-20 justify-center tabular-nums">
													{formatTokens(tokens)}
												</Badge>
											</div>
										);
									})}
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

interface TooltipProps {
	active?: boolean;
	payload?: Array<{ name: string; value: number; dataKey: string }>;
	label?: string;
	modelColors: Record<string, string>;
}

function TokenTooltip({ active, payload, label, modelColors }: TooltipProps) {
	if (!active || !payload || payload.length === 0) return null;
	const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
	// 只显示有值的模型，token 高的排前面
	const items = payload
		.filter((item) => Number(item.value) > 0)
		.sort((a, b) => Number(b.value) - Number(a.value));

	return (
		<div className="min-w-[10rem] rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
			<p className="mb-1.5 font-medium">{label}</p>
			<div className="space-y-1">
				{items.map((item) => (
					<div key={item.dataKey} className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-1.5">
							<span
								className="h-2.5 w-2.5 rounded-[2px]"
								style={{ backgroundColor: modelColors[item.name] }}
							/>
							<span className="text-muted-foreground">{item.name}</span>
						</span>
						<span className="font-mono tabular-nums">{Number(item.value).toLocaleString()}</span>
					</div>
				))}
			</div>
			<div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border/50 pt-1.5 font-medium">
				<span>合计</span>
				<span className="font-mono tabular-nums">{total.toLocaleString()}</span>
			</div>
		</div>
	);
}
