'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageShell } from '@/components/page-shell';
import { useCopy } from '@/hooks/use-copy';
import { formatFullDate } from '@/lib/format';
import {
	FileText,
	Clock,
	Zap,
	RefreshCw,
	Copy,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Filter,
	X,
	Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiLog {
	id: string;
	gateway_key_id: string | null;
	provider: string;
	model: string;
	api_key_id: string | null;
	endpoint: string;
	request_method: string;
	request_headers: Record<string, string> | null;
	request_body: Record<string, unknown> | null;
	request_summary?: string | null;
	request_tokens: number | null;
	response_status: number | null;
	response_body: Record<string, unknown> | null;
	response_tokens: number | null;
	total_tokens: number | null;
	duration_ms: number | null;
	error_message: string | null;
	ip_address: string | null;
	user_agent: string | null;
	created_at: string;
}

interface FilterOptions {
	providers: string[];
	models: string[];
}

// ============================================================
// 格式化 JSON，对 text 字段中的嵌套 JSON 字符串进行解析
// ============================================================

function formatJsonWithNestedParse(data: unknown): string {
	if (!data) return '';

	// 深度处理：遍历对象，将 text 类型字段中的 JSON 字符串解析出来
	const processed = deepParseTextFields(data);
	return JSON.stringify(processed, null, 4);
}

/**
 * 递归处理对象，将字符串值中包含的 JSON 解析为对象
 * 只处理看起来像 JSON 的字符串（以 { 或 [ 开头）
 */
function deepParseTextFields(value: unknown): unknown {
	if (value === null || value === undefined) return value;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (
			(trimmed.startsWith('{') && trimmed.endsWith('}')) ||
			(trimmed.startsWith('[') && trimmed.endsWith(']'))
		) {
			try {
				const parsed = JSON.parse(trimmed);
				return deepParseTextFields(parsed);
			} catch {
				return value;
			}
		}
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(item => deepParseTextFields(item));
	}

	if (typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			result[key] = deepParseTextFields(val);
		}
		return result;
	}

	return value;
}

// ============================================================
// 分页：根据当前页和总页数生成要显示的页码列表
// ============================================================

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const pages: (number | 'ellipsis')[] = [1];
	const left = Math.max(2, current - 1);
	const right = Math.min(total - 1, current + 1);
	if (left > 2) pages.push('ellipsis');
	for (let i = left; i <= right; i++) pages.push(i);
	if (right < total - 1) pages.push('ellipsis');
	pages.push(total);
	return pages;
}

// ============================================================
// 主页面
// ============================================================

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function LogsPage() {
	const [logs, setLogs] = useState<ApiLog[]>([]);
	const [loading, setLoading] = useState(true);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);

	// 筛选
	const [filterProvider, setFilterProvider] = useState<string>('');
	const [filterModel, setFilterModel] = useState<string>('');
	const [filterOptions, setFilterOptions] = useState<FilterOptions>({ providers: [], models: [] });
	const [showFilters, setShowFilters] = useState(false);

	// 详情弹窗
	const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	// 删除确认弹窗
	const [deleteTarget, setDeleteTarget] = useState<ApiLog | null>(null);
	const [deleting, setDeleting] = useState(false);

	// 跳页输入
	const [jumpInput, setJumpInput] = useState('');

	// 已读状态（用 localStorage 持久化）
	const [readIds, setReadIds] = useState<Set<string>>(new Set());

	const { copy: copyToClipboard } = useCopy();

	useEffect(() => {
		try {
			const stored = localStorage.getItem('api-logs-read');
			if (stored) setReadIds(new Set(JSON.parse(stored)));
		} catch {}
	}, []);

	useEffect(() => {
		fetch('/api/logs?action=filters')
			.then(res => res.json())
			.then(data => setFilterOptions(data))
			.catch(() => {});
	}, []);

	const fetchLogs = useCallback(async () => {
		try {
			setLoading(true);
			const params = new URLSearchParams({
				page: page.toString(),
				pageSize: pageSize.toString(),
			});
			if (filterProvider) params.set('provider', filterProvider);
			if (filterModel) params.set('model', filterModel);

			const res = await fetch(`/api/logs?${params.toString()}`);
			if (res.ok) {
				const result = await res.json();
				setLogs(result.data || []);
				setTotal(result.total || 0);
			}
		} catch (error) {
			console.error('获取日志失败:', error);
			toast.error('获取日志失败');
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, filterProvider, filterModel]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const pageNumbers = useMemo(() => getPageNumbers(page, totalPages), [page, totalPages]);

	const goToPage = (p: number) => {
		if (p < 1 || p > totalPages || p === page) return;
		setPage(p);
	};

	const handleJumpSubmit = () => {
		const n = parseInt(jumpInput, 10);
		if (!Number.isNaN(n)) {
			goToPage(Math.min(Math.max(1, n), totalPages));
		}
		setJumpInput('');
	};

	const handlePageSizeChange = (v: string) => {
		setPageSize(Number(v));
		setPage(1);
	};

	const viewDetails = (log: ApiLog) => {
		setSelectedLog(log);
		setDialogOpen(true);
		// 标记为已读
		setReadIds(prev => {
			const next = new Set(prev);
			next.add(log.id);
			try {
				localStorage.setItem('api-logs-read', JSON.stringify([...next]));
			} catch {}
			return next;
		});
		// 列表接口已瘦身（不含 response_body / request_headers），打开详情时按需拉全量
		fetch(`/api/logs/${encodeURIComponent(log.id)}`)
			.then(res => (res.ok ? res.json() : null))
			.then(result => {
				if (result?.data) setSelectedLog(result.data);
			})
			.catch(() => {});
	};

	const clearFilters = () => {
		setFilterProvider('');
		setFilterModel('');
		setPage(1);
	};

	// 清除所有已读记录（让红点重新出现）
	const clearReadIds = () => {
		setReadIds(new Set());
		try { localStorage.removeItem('api-logs-read'); } catch {}
	};

	/**
	 * 删除指定日志
	 */
	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			setDeleting(true);
			const res = await fetch(`/api/logs?id=${encodeURIComponent(deleteTarget.id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.error?.message || '删除失败');
			}
			toast.success('删除成功');
			// 从列表中移除
			setLogs(prev => prev.filter(l => l.id !== deleteTarget.id));
			setTotal(t => Math.max(0, t - 1));
			setDeleteTarget(null);
		} catch (error) {
			console.error('删除日志失败:', error);
			toast.error(error instanceof Error ? error.message : '删除失败');
		} finally {
			setDeleting(false);
		}
	};

	const hasActiveFilters = filterProvider || filterModel;

  const getStatusColor = (status: number | null) => {
    if (!status) return 'bg-muted-foreground';
    if (status >= 300 && status < 400) return 'bg-muted-foreground';
    if (status >= 400 && status < 500) return 'bg-amber-500';
    return 'bg-red-500';
  };

	const getStatusBadgeColor = (status: number | null) => {
		if (!status) return 'bg-muted-foreground text-white';
		if (status >= 200 && status < 300) return 'bg-emerald-500 text-white';
		if (status >= 400 && status < 500) return 'bg-red-500 text-white';
		return 'bg-red-600 text-white';
	};

	return (
		<PageShell
			title="调用日志"
			subtitle={`共 ${total} 条记录`}
			icon={FileText}
			actions={
				<>
					<Button
						variant={showFilters ? 'default' : 'outline'}
						size="sm"
						onClick={() => setShowFilters(!showFilters)}
					>
						<Filter className="mr-1 h-4 w-4" />
						筛选
						{hasActiveFilters && (
							<span className="ml-1 h-2 w-2 rounded-full bg-primary" />
						)}
					</Button>
					<Button onClick={fetchLogs} variant="outline" size="sm">
						<RefreshCw className="mr-1 h-4 w-4" />
						刷新
					</Button>
					{readIds.size > 0 && (
						<Button
							onClick={clearReadIds}
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
						>
							标为未读
						</Button>
					)}
				</>
			}
		>
			{/* 筛选栏 */}
			{showFilters && (
				<Card className="mb-4">
					<CardContent className="py-4">
						<div className="flex items-center gap-3 flex-wrap">
							<Select
								value={filterProvider}
								onValueChange={(val) => { setFilterProvider(val === '__all__' ? '' : val); setPage(1); }}
							>
								<SelectTrigger className="w-[160px]">
									<SelectValue placeholder="全部服务商" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__all__">全部服务商</SelectItem>
									{filterOptions.providers.map(p => (
										<SelectItem key={p} value={p}>{p}</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={filterModel}
								onValueChange={(val) => { setFilterModel(val === '__all__' ? '' : val); setPage(1); }}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="全部模型" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__all__">全部模型</SelectItem>
									{filterOptions.models.map(m => (
										<SelectItem key={m} value={m}>{m}</SelectItem>
									))}
								</SelectContent>
							</Select>

							{hasActiveFilters && (
								<Button variant="ghost" size="sm" onClick={clearFilters}>
									<X className="mr-1 h-4 w-4" />
									清除筛选
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* 日志列表 */}
			{loading ? (
				<div className="mx-auto max-w-3xl space-y-3">
					{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
						<Skeleton key={i} className="h-20 w-full rounded-lg" />
					))}
				</div>
			) : logs.length === 0 ? (
				<Card className="mx-auto max-w-3xl">
					<CardContent className="py-16 text-center">
						<FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
						<h3 className="mb-2 text-lg font-medium">
							{hasActiveFilters ? '没有匹配的记录' : '暂无调用记录'}
						</h3>
						<p className="text-sm text-muted-foreground">
							{hasActiveFilters
								? '尝试调整筛选条件'
								: '开始使用 API 后，调用记录会显示在这里'}
						</p>
						{hasActiveFilters && (
							<Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
								清除筛选
							</Button>
						)}
					</CardContent>
				</Card>
			) : (
				<div className="mx-auto max-w-3xl">
					<div className="space-y-2">
						{logs.map((log) => {
							const summary = log.request_summary || '';
							const isUnread = !readIds.has(log.id);
							return (
								<div
									key={log.id}
									className="group relative cursor-pointer rounded-lg border bg-card px-4 py-3 transition-all hover:border-foreground/20 hover:shadow-sm"
									onClick={() => viewDetails(log)}
								>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                      {/* 状态点：只对非 2xx 显示（成功请求不显示，减少噪音） */}
                      {log.response_status != null && log.response_status >= 300 && (
                        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${getStatusColor(log.response_status)}`} />
                      )}
                      {/* 未读红点 - 用内联 style 确保颜色渲染 */}
											{isUnread && (
												<span
													className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-background"
													style={{ backgroundColor: '#ef4444' }}
													aria-label="未读"
												/>
											)}
												<Badge variant="outline" className="capitalize text-xs">
													{log.provider}
												</Badge>
												<span className="truncate font-mono text-xs text-muted-foreground">
													{log.model}
												</span>
												{log.error_message && (
													<Badge variant="destructive" className="text-xs">错误</Badge>
												)}
											</div>
											{summary && (
												<p className="mt-1 truncate text-sm text-muted-foreground">
													{summary}
												</p>
											)}
											{log.error_message && !summary && (
												<p className="mt-1 truncate text-sm text-destructive">
													{log.error_message}
												</p>
											)}
										</div>
										<div className="flex flex-col items-end gap-1 flex-shrink-0">
											<span className="text-xs text-muted-foreground tabular-nums">
												{formatFullDate(log.created_at)}
											</span>
											<div className="flex items-center gap-3 text-xs text-muted-foreground">
												{log.total_tokens != null && log.total_tokens > 0 && (
													<span className="flex items-center gap-1 tabular-nums">
														<Zap className="h-3 w-3" />
														{log.total_tokens}
													</span>
												)}
												{log.duration_ms != null && (
													<span className="flex items-center gap-1 tabular-nums">
														<Clock className="h-3 w-3" />
														{log.duration_ms}ms
													</span>
												)}
											</div>
										</div>
										{/* 删除按钮 */}
										<button
											type="button"
											aria-label="删除日志"
											className="flex-shrink-0 self-center rounded p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												setDeleteTarget(log);
											}}
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>
								</div>
							);
						})}
					</div>

					{/* 分页 - 支持页码点击 + 跳页 + pageSize 选择 */}
					{totalPages > 1 && (
						<div className="mt-6 space-y-3">
							<div className="flex items-center justify-between gap-4">
								<p className="text-sm text-muted-foreground">
									第 <span className="tabular-nums">{(page - 1) * pageSize + 1}</span>
									-
									<span className="tabular-nums">{Math.min(page * pageSize, total)}</span> 条，
									共 <span className="tabular-nums">{total}</span> 条
								</p>
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<span>每页</span>
									<Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
										<SelectTrigger className="h-8 w-[72px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PAGE_SIZE_OPTIONS.map((size) => (
												<SelectItem key={size} value={String(size)}>
													{size}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<span>条</span>
								</div>
							</div>

							<div className="flex flex-wrap items-center justify-center gap-1.5">
								{/* 第一页 */}
								<Button
									variant="outline"
									size="icon-sm"
									onClick={() => goToPage(1)}
									disabled={page <= 1}
									aria-label="第一页"
								>
									<ChevronsLeft className="h-4 w-4" />
								</Button>
								{/* 上一页 */}
								<Button
									variant="outline"
									size="icon-sm"
									onClick={() => goToPage(page - 1)}
									disabled={page <= 1}
									aria-label="上一页"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>

								{/* 页码 */}
								{pageNumbers.map((p, idx) =>
									p === 'ellipsis' ? (
										<span
											key={`e-${idx}`}
											className="px-2 text-sm text-muted-foreground"
										>
											…
										</span>
									) : (
										<Button
											key={p}
											variant={p === page ? 'default' : 'outline'}
											size="icon-sm"
											onClick={() => goToPage(p)}
											className="tabular-nums"
											aria-current={p === page ? 'page' : undefined}
										>
											{p}
										</Button>
									)
								)}

								{/* 下一页 */}
								<Button
									variant="outline"
									size="icon-sm"
									onClick={() => goToPage(page + 1)}
									disabled={page >= totalPages}
									aria-label="下一页"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
								{/* 最后一页 */}
								<Button
									variant="outline"
									size="icon-sm"
									onClick={() => goToPage(totalPages)}
									disabled={page >= totalPages}
									aria-label="最后一页"
								>
									<ChevronsRight className="h-4 w-4" />
								</Button>

								{/* 跳页 */}
								{totalPages > 5 && (
									<div className="ml-2 flex items-center gap-1.5 text-sm text-muted-foreground">
										<span>跳至</span>
										<Input
											value={jumpInput}
											onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ''))}
											onKeyDown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													handleJumpSubmit();
												}
											}}
											placeholder={String(page)}
											className="h-8 w-14 text-center tabular-nums"
											inputMode="numeric"
										/>
										<span>页</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			{/* 详情弹窗 - 紧凑型设计 */}
			{/* ⚠️ 边界：弹窗内部 CodeBlock / renderJsonNode / renderTextValue / formatJsonWithNestedParse / deepParseTextFields 严格不动 */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-2xl p-0 gap-0">
					{selectedLog && (
						<>
							{/* 顶部栏：状态码 + 方法 + 路径 */}
							<div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
								<span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusBadgeColor(selectedLog.response_status)}`}>
									{selectedLog.response_status || 'N/A'}
								</span>
								<span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
									{selectedLog.request_method}
								</span>
								<span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate flex-1">
									{selectedLog.endpoint}
								</span>
							</div>

							{/* 可滚动内容区 */}
							<div className="p-4 space-y-4" style={{ maxHeight: 'calc(80vh - 52px)', overflowY: 'auto' }}>
								{/* 基本信息 - 紧凑布局 */}
								<div className="flex flex-wrap gap-3 text-xs">
									<div className="flex items-center gap-1.5">
										<span className="text-slate-400">服务商</span>
										<Badge variant="outline" className="capitalize text-xs">
											{selectedLog.provider}
										</Badge>
									</div>
									<div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
										<span className="text-slate-400">模型</span>
										<span className="font-mono text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
											{selectedLog.model}
										</span>
									</div>
									{selectedLog.duration_ms != null && (
										<div className="flex items-center gap-1">
											<Clock className="w-3 h-3 text-slate-400" />
											<span className="text-slate-600 dark:text-slate-400">
												{selectedLog.duration_ms}ms
											</span>
										</div>
									)}
									{selectedLog.total_tokens != null && selectedLog.total_tokens > 0 && (
										<div className="flex items-center gap-1">
											<Zap className="w-3 h-3 text-slate-400" />
											<span className="text-slate-600 dark:text-slate-400">
												{selectedLog.total_tokens} tokens
											</span>
										</div>
									)}
								</div>

								{/* 错误信息 */}
								{selectedLog.error_message && (
									<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
										<p className="text-xs font-medium text-red-500 mb-1">错误信息</p>
										<p className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-words max-h-[100px] overflow-y-auto">
											{selectedLog.error_message}
										</p>
									</div>
								)}

								{/* 请求报文 */}
								{selectedLog.request_body && (
									<CodeBlock
										title="请求报文"
										content={formatJsonWithNestedParse(selectedLog.request_body)}
										rawData={deepParseTextFields(selectedLog.request_body)}
										onCopy={() => copyToClipboard(
											formatJsonWithNestedParse(selectedLog.request_body),
											'请求报文'
										)}
									/>
								)}

								{/* 响应报文 */}
								{selectedLog.response_body && (
									<CodeBlock
										title="响应报文"
										content={formatJsonWithNestedParse(selectedLog.response_body)}
										rawData={deepParseTextFields(selectedLog.response_body)}
										onCopy={() => copyToClipboard(
											formatJsonWithNestedParse(selectedLog.response_body),
											'响应报文'
										)}
									/>
								)}

								{/* 请求头 */}
								{selectedLog.request_headers && (
									<CodeBlock
										title="请求头"
										content={JSON.stringify(selectedLog.request_headers, null, 4)}
										onCopy={() => copyToClipboard(
											JSON.stringify(selectedLog.request_headers, null, 4),
											'请求头'
										)}
									/>
								)}
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* 删除确认弹窗 */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>确认删除日志？</AlertDialogTitle>
						<AlertDialogDescription>
							此操作不可恢复。
							{deleteTarget && (
								<span className="block mt-2 text-xs font-mono text-slate-500 truncate">
									{deleteTarget.provider} · {deleteTarget.model} · {formatFullDate(deleteTarget.created_at)}
								</span>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleDelete();
							}}
							disabled={deleting}
							style={{ backgroundColor: deleting ? '#fca5a5' : '#ef4444', color: 'white' }}
						>
							{deleting ? '删除中...' : '确认删除'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}

// ============================================================
// 代码块组件 - 支持 text 字段换行渲染
// ============================================================

/**
 * 将 text 字段内容拆分为带换行和 tag 高亮的 React 节点
 * - \n 渲染为真实换行
 * - <tag>...</tag> 包裹内容用特殊样式标注
 */
function renderTextValue(text: string): React.ReactNode {
	// 先将 \n 替换为真实换行符（处理 JSON 序列化后的转义）
	const normalized = text.replace(/\\n/g, '\n');

	// 按 XML-like tag 分割，识别 <tagname>...</tagname>
	const TAG_RE = /(<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\2>)/g;
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = TAG_RE.exec(normalized)) !== null) {
		// tag 前的普通文本
		if (match.index > lastIndex) {
			const plain = normalized.slice(lastIndex, match.index);
			parts.push(...plain.split('\n').flatMap((line, i, arr) =>
				i < arr.length - 1 ? [line, <br key={`br-${lastIndex}-${i}`} />] : [line]
			));
		}
		// tag 包裹内容
		const tagName = match[2];
		const inner = match[3];
		parts.push(
			<span key={match.index} className="block my-1">
				<span className="inline-block text-[10px] font-bold text-purple-500 dark:text-purple-400 mr-1 select-none">
					{'<'}{tagName}{'>'}
				</span>
				<span className="text-slate-500 dark:text-slate-400 italic">
					{inner.split('\n').flatMap((line, i, arr) =>
						i < arr.length - 1 ? [line, <br key={i} />] : [line]
					)}
				</span>
				<span className="inline-block text-[10px] font-bold text-purple-500 dark:text-purple-400 ml-1 select-none">
					{'</'}{tagName}{'>'}
				</span>
			</span>
		);
		lastIndex = match.index + match[0].length;
	}

	// 剩余文本
	if (lastIndex < normalized.length) {
		const tail = normalized.slice(lastIndex);
		parts.push(...tail.split('\n').flatMap((line, i, arr) =>
			i < arr.length - 1 ? [line, <br key={`br-tail-${i}`} />] : [line]
		));
	}

	return <>{parts}</>;
}

/**
 * 递归渲染 JSON 数据，对 text 字段做特殊换行处理
 */
function renderJsonNode(value: unknown, indent: number = 0, key?: string): React.ReactNode {
	const pad = '    '.repeat(indent);
	const padInner = '    '.repeat(indent + 1);

	if (value === null) return <span className="text-slate-400">null</span>;
	if (typeof value === 'boolean') return <span className="text-amber-500">{String(value)}</span>;
	if (typeof value === 'number') return <span className="text-blue-500">{value}</span>;

	if (typeof value === 'string') {
		// role 字段的 user/assistant 值用角色颜色
		if (key === 'role') {
			if (value === 'user') {
				return <span className="font-semibold" style={{ color: '#009e47ff' }}>&quot;{value}&quot;</span>;
			}
			if (value === 'assistant') {
				return <span className="font-semibold" style={{ color: '#031c8dff' }}>&quot;{value}&quot;</span>;
			}
			if (value === 'system') {
				return <span className="font-semibold" style={{ color: '#e40000ff' }}>&quot;{value}&quot;</span>;
			}
		}
		return <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) return <span>{'[]'}</span>;
		return (
			<span>
				{'[\n'}
				{value.map((item, i) => (
					<span key={i}>
						{padInner}
						{renderJsonNode(item, indent + 1)}
						{i < value.length - 1 ? ',' : ''}
						{'\n'}
					</span>
				))}
				{pad}{']'}
			</span>
		);
	}

	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return <span>{'{}'}</span>;
		return (
			<span>
				{'{\n'}
				{entries.map(([k, v], i) => {
					// text/content 字段：整体渲染为米黄色块
					const isTextField = (k === 'text' || k === 'content') && typeof v === 'string';
					if (isTextField) {
						const strVal = v as string;
						const hasRichContent = strVal.includes('\\n') || strVal.includes('\n') || /<[a-zA-Z_]/.test(strVal);
						return (
							<span key={k}>
								{padInner}
								<span className="text-sky-600 dark:text-sky-400">&quot;{k}&quot;</span>
								{': '}
								{hasRichContent ? (
									<>
										{'"'}
										<div
											className="inline-block w-full rounded-md px-3 py-2 my-1 text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap break-words"
											style={{ backgroundColor: 'rgba(254, 249, 195, 0.3)', border: '1px solid rgba(234, 179, 8, 0.15)' }}
										>
											{renderTextValue(strVal)}
										</div>
										{'"'}
									</>
								) : (
									<span className="text-emerald-600 dark:text-emerald-400">&quot;{strVal}&quot;</span>
								)}
								{i < entries.length - 1 ? ',' : ''}
								{'\n'}
							</span>
						);
					}
					return (
						<span key={k}>
							{padInner}
							<span className="text-sky-600 dark:text-sky-400">&quot;{k}&quot;</span>
							{': '}
							{renderJsonNode(v, indent + 1, k)}
							{i < entries.length - 1 ? ',' : ''}
							{'\n'}
						</span>
					);
				})}
				{pad}{'}'}
			</span>
		);
	}

	return <span>{String(value)}</span>;
}

function CodeBlock({
	title,
	content,
	rawData,
	onCopy,
}: {
	title: string;
	content: string;
	rawData?: unknown;
	onCopy: () => void;
}) {
	return (
		<div>
			<div className="flex items-center justify-between mb-2">
				<p className="text-sm font-medium text-slate-700 dark:text-slate-300">
					{title}
				</p>
				<button
					onClick={onCopy}
					className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
				>
					<Copy className="w-3.5 h-3.5" />
					复制
				</button>
			</div>
			<div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
				<pre className="p-4 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words overflow-auto max-h-[500px] leading-relaxed">
					{rawData !== undefined ? renderJsonNode(rawData) : content}
				</pre>
			</div>
		</div>
	);
}
