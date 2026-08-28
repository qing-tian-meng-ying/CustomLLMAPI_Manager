'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Copy,
	GitCompare,
	Loader2,
	AlertCircle,
	CheckCircle2,
	ChevronUp,
	ChevronDown,
} from 'lucide-react';
import { useCopy } from '@/hooks/use-copy';
import { formatFullDate } from '@/lib/format';
import {
	buildDiff,
	buildDiffLines,
	deepParseTextFields,
	type DiffChangeBlock,
	type DiffLine,
	type DiffTokenKind,
} from '@/lib/json-diff';

// ============================================================
// 类型
// ============================================================

export interface CompareLog {
	id: string;
	gateway_key_id: string | null;
	provider: string;
	model: string;
	api_key_id: string | null;
	endpoint: string;
	request_method: string;
	request_headers: Record<string, string> | null;
	request_body: Record<string, unknown> | null;
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

type Section = 'request' | 'response' | 'headers' | 'full';

const SECTION_LABELS: Record<Section, string> = {
	request: '请求报文',
	response: '响应报文',
	headers: '请求头',
	full: '完整记录',
};

// ============================================================
// 渲染：逐行差异视图
// ============================================================

/** 行内精确高亮（变更值本体），与原内联高亮一致 */
const HL_CLS = {
	added: 'bg-emerald-100 dark:bg-emerald-500/15 rounded-[3px] px-0.5',
	removed: 'bg-red-100 dark:bg-red-500/15 rounded-[3px] px-0.5',
	changed: 'bg-amber-100 dark:bg-amber-500/15 rounded-[3px] px-0.5',
} as const;

/** 变更行的整行底色 */
const LINE_CLS = {
	added: 'bg-emerald-50 dark:bg-emerald-500/10',
	removed: 'bg-red-50 dark:bg-red-500/10',
	changed: 'bg-amber-50 dark:bg-amber-500/10',
} as const;

/** 当前跳转目标行的整行底色（更强） */
const LINE_ACTIVE_CLS = {
	added: 'bg-emerald-100 dark:bg-emerald-500/20',
	removed: 'bg-red-100 dark:bg-red-500/20',
	changed: 'bg-amber-100 dark:bg-amber-500/20',
} as const;

/** 当前跳转目标行左侧的指示条 */
const ACTIVE_BAR: Record<'added' | 'removed' | 'changed', string> = {
	added: 'inset 3px 0 0 0 #10b981',
	removed: 'inset 3px 0 0 0 #ef4444',
	changed: 'inset 3px 0 0 0 #f59e0b',
};

const TOKEN_CLS: Record<DiffTokenKind, string> = {
	plain: '',
	key: 'text-sky-600 dark:text-sky-400',
	string: 'text-emerald-600 dark:text-emerald-400',
	number: 'text-blue-500',
	boolean: 'text-amber-500',
	null: 'text-slate-400',
	'role-user': 'font-semibold',
	'role-assistant': 'font-semibold',
	'role-system': 'font-semibold',
};

const TOKEN_STYLE: Partial<Record<DiffTokenKind, CSSProperties>> = {
	'role-user': { color: '#009e47ff' },
	'role-assistant': { color: '#031c8dff' },
	'role-system': { color: '#e40000ff' },
};

// ============================================================
// 辅助
// ============================================================

async function fetchDetail(id: string): Promise<CompareLog> {
	const res = await fetch('/api/logs/' + encodeURIComponent(id));
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err?.error?.message || '获取日志详情失败');
	}
	const json = await res.json();
	if (!json?.data) throw new Error('日志不存在');
	return json.data as CompareLog;
}

function sectionValue(log: CompareLog, section: Section): unknown {
	switch (section) {
		case 'request':
			return log.request_body;
		case 'response':
			return log.response_body;
		case 'headers':
			return log.request_headers;
		case 'full':
			return log;
	}
}

function formatJson(value: unknown): string {
	return JSON.stringify(deepParseTextFields(value), null, 4);
}

function describeLog(log: CompareLog): string {
	return log.provider + ' · ' + log.model + ' · ' + formatFullDate(log.created_at);
}

// ============================================================
// 对比弹窗
// ============================================================

export interface LogCompareDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	logA: Pick<CompareLog, 'id' | 'provider' | 'model' | 'created_at'>;
	logB: Pick<CompareLog, 'id' | 'provider' | 'model' | 'created_at'>;
}

export function LogCompareDialog({ open, onOpenChange, logA, logB }: LogCompareDialogProps) {
	const { copy } = useCopy();

	const [detailA, setDetailA] = useState<CompareLog | null>(null);
	const [detailB, setDetailB] = useState<CompareLog | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [section, setSection] = useState<Section>('request');
	const [reloadKey, setReloadKey] = useState(0);

	// 当前跳转到的变更块下标（null = 尚未跳转）
	const [activeChange, setActiveChange] = useState<number | null>(null);
	// 两侧每一行的 DOM 引用，用于跳转滚动
	const lineRefsA = useRef<Map<number, HTMLDivElement>>(new Map());
	const lineRefsB = useRef<Map<number, HTMLDivElement>>(new Map());

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDetailA(null);
		setDetailB(null);

		Promise.all([fetchDetail(logA.id), fetchDetail(logB.id)])
			.then(([a, b]) => {
				if (cancelled) return;
				setDetailA(a);
				setDetailB(b);
			})
			.catch(err => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : '获取日志详情失败');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open, logA.id, logB.id, reloadKey]);

	const availableSections = useMemo<Section[]>(() => {
		if (!detailA || !detailB) return [];
		const sections: Section[] = [];
		if (detailA.request_body && detailB.request_body) sections.push('request');
		if (detailA.response_body && detailB.response_body) sections.push('response');
		if (detailA.request_headers && detailB.request_headers) sections.push('headers');
		sections.push('full');
		return sections;
	}, [detailA, detailB]);

	// 区块数据就绪后，若当前选中区块不可用则切到第一个可用区块
	useEffect(() => {
		if (loading || availableSections.length === 0) return;
		if (!availableSections.includes(section)) {
			setSection(availableSections[0]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [availableSections, loading]);

	const diffResult = useMemo(() => {
		if (!detailA || !detailB) return null;
		const va = sectionValue(detailA, section);
		const vb = sectionValue(detailB, section);
		if (va === null || va === undefined || vb === null || vb === undefined) return null;
		const na = deepParseTextFields(va);
		const nb = deepParseTextFields(vb);
		const node = buildDiff(na, nb);
		return { na, nb, lines: buildDiffLines(node) };
	}, [detailA, detailB, section]);

	// 切换区块/日志后回到未跳转状态
	useEffect(() => {
		setActiveChange(null);
	}, [diffResult]);

	const changes = useMemo<DiffChangeBlock[]>(() => diffResult?.lines.changes ?? [], [diffResult]);

	const registerLineA = useCallback((idx: number, el: HTMLDivElement | null) => {
		if (el) lineRefsA.current.set(idx, el);
		else lineRefsA.current.delete(idx);
	}, []);
	const registerLineB = useCallback((idx: number, el: HTMLDivElement | null) => {
		if (el) lineRefsB.current.set(idx, el);
		else lineRefsB.current.delete(idx);
	}, []);

	/** 跳转到第 idx 个变更块：两侧各自滚动到自己的变更行（无变更行的一侧滚到相邻锚点） */
	const jumpToChange = useCallback((idx: number) => {
		const ch = changes[idx];
		if (!ch) return;
		setActiveChange(idx);
		requestAnimationFrame(() => {
			const aIdx = ch.a ? ch.a.start : ch.aAnchor;
			const bIdx = ch.b ? ch.b.start : ch.bAnchor;
			lineRefsA.current.get(aIdx)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			lineRefsB.current.get(bIdx)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}, [changes]);

	const jumpPrev = useCallback(() => {
		if (changes.length === 0) return;
		jumpToChange(activeChange === null ? changes.length - 1 : (activeChange - 1 + changes.length) % changes.length);
	}, [changes.length, activeChange, jumpToChange]);

	const jumpNext = useCallback(() => {
		if (changes.length === 0) return;
		jumpToChange(activeChange === null ? 0 : (activeChange + 1) % changes.length);
	}, [changes.length, activeChange, jumpToChange]);

	const handleRetry = () => setReloadKey(k => k + 1);

	const activeBlock = activeChange !== null ? (changes[activeChange] ?? null) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[1400px] w-[95vw] p-0 gap-0">
				{/* 顶部栏 */}
				<div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
					<GitCompare className="h-4 w-4 text-slate-500" />
					<span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
						JSON 对比
					</span>
					{!loading && !error && diffResult && (
						diffResult.lines.changes.length === 0 ? (
							<Badge className="bg-emerald-500 text-white">完全一致</Badge>
						) : (
							<>
								{diffResult.lines.removedCount > 0 && (
									<Badge variant="outline" className="tabular-nums border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
										删除 {diffResult.lines.removedCount}
									</Badge>
								)}
								{diffResult.lines.changedCount > 0 && (
									<Badge variant="outline" className="tabular-nums border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
										修改 {diffResult.lines.changedCount}
									</Badge>
								)}
								{diffResult.lines.addedCount > 0 && (
									<Badge variant="outline" className="tabular-nums border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400">
										新增 {diffResult.lines.addedCount}
									</Badge>
								)}
								{/* 变更跳转 */}
								<div className="flex items-center gap-1">
									<Button variant="outline" size="sm" className="h-6 px-1.5" onClick={jumpPrev} aria-label="上一处变更" title="上一处变更">
										<ChevronUp className="h-3.5 w-3.5" />
									</Button>
									<span className="min-w-[3.5rem] text-center text-xs tabular-nums text-slate-500 dark:text-slate-400">
										{activeChange === null
											? '共 ' + changes.length + ' 处'
											: (activeChange + 1) + ' / ' + changes.length}
									</span>
									<Button variant="outline" size="sm" className="h-6 px-1.5" onClick={jumpNext} aria-label="下一处变更" title="下一处变更">
										<ChevronDown className="h-3.5 w-3.5" />
									</Button>
								</div>
							</>
						)
					)}
					<span className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
						<span className="flex items-center gap-1.5">
							<span className="inline-block h-3 w-3 rounded-sm bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/40" />
							删除
						</span>
						<span className="flex items-center gap-1.5">
							<span className="inline-block h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40" />
							修改
						</span>
						<span className="flex items-center gap-1.5">
							<span className="inline-block h-3 w-3 rounded-sm bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40" />
							新增
						</span>
					</span>
				</div>

				{/* 区块切换 */}
				{availableSections.length > 0 && (
					<div className="px-5 pt-3">
						<Tabs value={section} onValueChange={v => setSection(v as Section)}>
							<TabsList>
								{availableSections.map(s => (
									<TabsTrigger key={s} value={s}>
										{SECTION_LABELS[s]}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>
				)}

				{/* 内容区 */}
				<div className="p-5 pt-3">
					{loading ? (
						<div className="flex h-64 items-center justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							<span className="ml-2 text-sm text-muted-foreground">加载日志详情…</span>
						</div>
					) : error ? (
						<div className="flex h-64 flex-col items-center justify-center gap-3">
							<AlertCircle className="h-8 w-8 text-destructive" />
							<p className="text-sm text-destructive">{error}</p>
							<Button size="sm" variant="outline" onClick={handleRetry}>
								重试
							</Button>
						</div>
					) : diffResult ? (
						// diffResult 非空即代表 detailA/detailB 均已加载，这里用 ! 收窄
						diffResult.lines.changes.length === 0 ? (
							<div className="flex h-40 flex-col items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
								<CheckCircle2 className="h-6 w-6" />
								<span className="text-sm font-medium">
									{SECTION_LABELS[section]} 完全一致，无差异
								</span>
							</div>
						) : (
							<div className="flex gap-3 items-stretch">
								<JsonDiffPane
									side="a"
									log={detailA!}
									lines={diffResult.lines.a}
									sectionLabel={SECTION_LABELS[section]}
									activeRange={activeBlock?.a ?? null}
									registerLine={registerLineA}
									onCopy={() =>
										copy(formatJson(diffResult.na), '左侧 ' + SECTION_LABELS[section])
									}
								/>
								<JsonDiffPane
									side="b"
									log={detailB!}
									lines={diffResult.lines.b}
									sectionLabel={SECTION_LABELS[section]}
									activeRange={activeBlock?.b ?? null}
									registerLine={registerLineB}
									onCopy={() =>
										copy(formatJson(diffResult.nb), '右侧 ' + SECTION_LABELS[section])
									}
								/>
							</div>
						)
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ============================================================
// 单侧 JSON 展示面板（逐行渲染）
// ============================================================

function JsonDiffPane({
	side,
	log,
	lines,
	sectionLabel,
	activeRange,
	registerLine,
	onCopy,
}: {
	side: 'a' | 'b';
	log: CompareLog;
	lines: DiffLine[];
	sectionLabel: string;
	/** 当前跳转目标在该侧的行范围（闭区间），无则不高亮 */
	activeRange: { start: number; end: number } | null;
	registerLine: (idx: number, el: HTMLDivElement | null) => void;
	onCopy: () => void;
}) {
	const isA = side === 'a';
	return (
		<div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
			<div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
				<span
					className={'flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold text-white ' + (isA ? 'bg-blue-500' : 'bg-purple-500')}
				>
					{isA ? 'A' : 'B'}
				</span>
				<span className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">
					{describeLog(log)}
				</span>
				<span className="hidden truncate text-[10px] text-slate-400 lg:inline">
					{sectionLabel}
				</span>
				<button
					type="button"
					onClick={onCopy}
					className="ml-auto flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-300"
				>
					<Copy className="h-3 w-3" />
					复制
				</button>
			</div>
			<div className="max-h-[60vh] min-h-[320px] flex-1 overflow-auto py-2 text-xs font-mono leading-relaxed text-slate-700 dark:text-slate-300">
				{lines.map((line, i) => {
					const isActive =
						activeRange !== null && i >= activeRange.start && i <= activeRange.end;
					const change = line.change;
					return (
						<div
							key={i}
							ref={el => registerLine(i, el)}
							className={
								'whitespace-pre-wrap break-words px-4' +
								(change ? ' ' + (isActive ? LINE_ACTIVE_CLS[change] : LINE_CLS[change]) : '')
							}
							style={isActive && change ? { boxShadow: ACTIVE_BAR[change] } : undefined}
						>
							{line.segments.map((seg, j) => (
								<span
									key={j}
									className={
										TOKEN_CLS[seg.kind] +
										(seg.hl && change ? (TOKEN_CLS[seg.kind] ? ' ' : '') + HL_CLS[change] : '')
									}
									style={TOKEN_STYLE[seg.kind]}
								>
									{seg.text}
								</span>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
