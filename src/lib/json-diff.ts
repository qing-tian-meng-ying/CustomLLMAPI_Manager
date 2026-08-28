/**
 * JSON 差异引擎（纯函数，无 React 依赖）。
 * 用于日志页两条日志的 request/response body 等 JSON 结构对比，
 * 支持对象键新增/删除、标量修改、数组元素 LCS 对齐，并统计差异处数。
 */

// ============================================================
// 深度解析 text 字段中的嵌套 JSON 字符串（与日志详情页逻辑一致）
// ============================================================

export function deepParseTextFields(value: unknown): unknown {
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
// Diff 节点类型
// ============================================================

export type DiffNode =
	| { kind: 'same'; value: unknown }
	| { kind: 'changed'; value: unknown; other: unknown }
	| { kind: 'removed'; value: unknown }
	| { kind: 'added'; value: unknown }
	| { kind: 'object'; entries: Array<{ key: string; node: DiffNode }> }
	| { kind: 'array'; items: Array<{ status: 'same' | 'removed' | 'added'; node: DiffNode }> };

function typeOf(v: unknown): string {
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'array';
	return typeof v;
}

/** 递归深比较（对象忽略键顺序） */
export function isDeepEqual(a: unknown, b: unknown): boolean {
	const ta = typeOf(a);
	const tb = typeOf(b);
	if (ta !== tb) return false;
	if (ta === 'null' || ta === 'undefined') return true;
	if (ta !== 'object' && ta !== 'array') return a === b;
	if (ta === 'array') {
		const aa = a as unknown[];
		const bb = b as unknown[];
		if (aa.length !== bb.length) return false;
		for (let i = 0; i < aa.length; i++) {
			if (!isDeepEqual(aa[i], bb[i])) return false;
		}
		return true;
	}
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const ka = Object.keys(ao);
	const kb = Object.keys(bo);
	if (ka.length !== kb.length) return false;
	for (const k of ka) {
		if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
		if (!isDeepEqual(ao[k], bo[k])) return false;
	}
	return true;
}

/** 稳定序列化（键排序），用于数组元素匹配签名 */
function stableStringify(v: unknown): string {
	if (v === null || typeof v !== 'object') return JSON.stringify(v);
	if (Array.isArray(v)) {
		return '[' + v.map(stableStringify).join(',') + ']';
	}
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return (
		'{' +
		keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') +
		'}'
	);
}

/** 数组元素匹配签名（截断避免超大数组内存开销） */
function itemSignature(v: unknown): string {
	return stableStringify(v).slice(0, 500);
}

const MAX_LCS_CELLS = 250_000;

/**
 * 数组对齐：基于元素签名的 LCS，识别插入/删除；
 * 超大规模数组回退到按下标对齐，避免 O(n*m) 卡死页面。
 */
function alignArrays(
	a: unknown[],
	b: unknown[],
	buildDiff: (x: unknown, y: unknown) => DiffNode
): Array<{ status: 'same' | 'removed' | 'added'; node: DiffNode }> {
	const n = a.length;
	const m = b.length;
	const sigA = a.map(itemSignature);
	const sigB = b.map(itemSignature);

	// 规模保护：过大时按下标对齐
	if (n * m > MAX_LCS_CELLS) {
		const items: Array<{ status: 'same' | 'removed' | 'added'; node: DiffNode }> = [];
		const len = Math.max(n, m);
		for (let i = 0; i < len; i++) {
			if (i < n && i < m) items.push({ status: 'same', node: buildDiff(a[i], b[i]) });
			else if (i < n) items.push({ status: 'removed', node: { kind: 'removed', value: a[i] } });
			else items.push({ status: 'added', node: { kind: 'added', value: b[i] } });
		}
		return items;
	}

	// LCS DP
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i][j] =
				sigA[i - 1] === sigB[j - 1]
					? dp[i - 1][j - 1] + 1
					: Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}

	// 回溯得到有序匹配对
	const pairs: Array<[number, number]> = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		if (sigA[i - 1] === sigB[j - 1]) {
			pairs.unshift([i - 1, j - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] >= dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	// 按匹配对顺序输出 removed / added / same
	const items: Array<{ status: 'same' | 'removed' | 'added'; node: DiffNode }> = [];
	let ai = 0;
	let bj = 0;
	for (const [pa, pb] of pairs) {
		while (ai < pa) {
			items.push({ status: 'removed', node: { kind: 'removed', value: a[ai] } });
			ai++;
		}
		while (bj < pb) {
			items.push({ status: 'added', node: { kind: 'added', value: b[bj] } });
			bj++;
		}
		items.push({ status: 'same', node: buildDiff(a[pa], b[pb]) });
		ai = pa + 1;
		bj = pb + 1;
	}
	while (ai < n) {
		items.push({ status: 'removed', node: { kind: 'removed', value: a[ai] } });
		ai++;
	}
	while (bj < m) {
		items.push({ status: 'added', node: { kind: 'added', value: b[bj] } });
		bj++;
	}

	return items;
}

/**
 * 递归构建两棵 JSON 的差异树。
 * 相等子树折叠为 same；整棵新增/删除的子树折叠为单节点 added/removed。
 */
export function buildDiff(a: unknown, b: unknown): DiffNode {
	if (isDeepEqual(a, b)) return { kind: 'same', value: a };

	const ta = typeOf(a);
	const tb = typeOf(b);
	if (ta !== tb) return { kind: 'changed', value: a, other: b };
	// 非对象/数组（标量、null）且不等 → 标为修改
	if (ta !== 'object' && ta !== 'array') {
		return { kind: 'changed', value: a, other: b };
	}

	if (ta === 'array') {
		return { kind: 'array', items: alignArrays(a as unknown[], b as unknown[], buildDiff) };
	}

	// 对象：A 的键序在前，B 新增的键追加在后
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const entries: Array<{ key: string; node: DiffNode }> = [];
	for (const k of Object.keys(ao)) {
		if (Object.prototype.hasOwnProperty.call(bo, k)) {
			entries.push({ key: k, node: buildDiff(ao[k], bo[k]) });
		} else {
			entries.push({ key: k, node: { kind: 'removed', value: ao[k] } });
		}
	}
	for (const k of Object.keys(bo)) {
		if (!Object.prototype.hasOwnProperty.call(ao, k)) {
			entries.push({ key: k, node: { kind: 'added', value: bo[k] } });
		}
	}
	return { kind: 'object', entries };
}

/** 统计差异处数（same 不计，changed/removed/added 各计 1） */
export function countDiff(node: DiffNode): number {
	switch (node.kind) {
		case 'same':
			return 0;
		case 'changed':
		case 'removed':
		case 'added':
			return 1;
		case 'object':
			return node.entries.reduce((sum, e) => sum + countDiff(e.node), 0);
		case 'array':
			return node.items.reduce((sum, it) => sum + countDiff(it.node), 0);
	}
}
// ============================================================
// 逐行 diff 模型：把差异树展开为 A/B 两侧的"行"，
// 连续同类型的变更行合并为 1 个变更块（用于统计数量与跳转定位）
// ============================================================

/** 行内片段的语义类型，着色由渲染层决定 */
export type DiffTokenKind =
	| 'plain'
	| 'key'
	| 'string'
	| 'number'
	| 'boolean'
	| 'null'
	| 'role-user'
	| 'role-assistant'
	| 'role-system';

export interface DiffLineSegment {
	text: string;
	kind: DiffTokenKind;
	/** 是否属于变更值本体（行内精确高亮） */
	hl?: boolean;
}

export type DiffLineChange = 'added' | 'removed' | 'changed' | null;

export interface DiffLine {
	segments: DiffLineSegment[];
	/** 该行所属的变更类型；null 表示两侧一致 */
	change: DiffLineChange;
}

export interface DiffChangeBlock {
	type: 'added' | 'removed' | 'changed';
	/** 在 A 侧的行范围（闭区间）；新增块不存在于 A */
	a?: { start: number; end: number };
	/** 在 B 侧的行范围（闭区间）；删除块不存在于 B */
	b?: { start: number; end: number };
	/** 该侧没有变更行时的跳转锚点（变更发生处相邻的行号） */
	aAnchor: number;
	bAnchor: number;
}

export interface DiffLinesResult {
	a: DiffLine[];
	b: DiffLine[];
	changes: DiffChangeBlock[];
	addedCount: number;
	removedCount: number;
	changedCount: number;
}

const COMMA_SEG: DiffLineSegment = { text: ',', kind: 'plain' };

function scalarSegments(value: unknown, key?: string): DiffLineSegment[] {
	if (value === null) return [{ text: 'null', kind: 'null' }];
	if (typeof value === 'boolean') return [{ text: String(value), kind: 'boolean' }];
	if (typeof value === 'number') return [{ text: String(value), kind: 'number' }];
	if (typeof value === 'string') {
		let kind: DiffTokenKind = 'string';
		if (key === 'role') {
			if (value === 'user') kind = 'role-user';
			else if (value === 'assistant') kind = 'role-assistant';
			else if (value === 'system') kind = 'role-system';
		}
		return [{ text: '"' + value + '"', kind }];
	}
	return [{ text: String(value), kind: 'plain' }];
}

function padSegments(indent: number): DiffLineSegment[] {
	return indent > 0 ? [{ text: '    '.repeat(indent), kind: 'plain' }] : [];
}

function keyPrefixSegments(indent: number, key?: string): DiffLineSegment[] {
	const segs = padSegments(indent);
	if (key !== undefined) {
		segs.push({ text: '"' + key + '"', kind: 'key' }, { text: ': ', kind: 'plain' });
	}
	return segs;
}

function markHl(segs: DiffLineSegment[], hl: boolean): DiffLineSegment[] {
	return hl ? segs.map(s => ({ ...s, hl: true })) : segs;
}

/**
 * 把一棵（无差异状态的）JSON 值展开为行数组。
 * change/hl 用于整棵新增/删除/修改子树：所有行都标记上变更类型。
 */
function valueToLines(
	value: unknown,
	indent: number,
	key: string | undefined,
	change: DiffLineChange,
	hl: boolean
): DiffLine[] {
	const prefix = keyPrefixSegments(indent, key);
	const line = (segments: DiffLineSegment[]): DiffLine => ({ segments, change });

	if (value === null || typeof value !== 'object') {
		return [line([...prefix, ...markHl(scalarSegments(value, key), hl)])];
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return [line([...prefix, ...markHl([{ text: '[]', kind: 'plain' }], hl)])];
		}
		const lines: DiffLine[] = [
			line([...prefix, ...markHl([{ text: '[', kind: 'plain' }], hl)]),
		];
		value.forEach((item, i) => {
			const sub = valueToLines(item, indent + 1, undefined, change, hl);
			if (i < value.length - 1) sub[sub.length - 1].segments.push({ ...COMMA_SEG });
			lines.push(...sub);
		});
		lines.push(
			line([...padSegments(indent), ...markHl([{ text: ']', kind: 'plain' }], hl)])
		);
		return lines;
	}

	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0) {
		return [line([...prefix, ...markHl([{ text: '{}', kind: 'plain' }], hl)])];
	}
	const lines: DiffLine[] = [
		line([...prefix, ...markHl([{ text: '{', kind: 'plain' }], hl)]),
	];
	entries.forEach(([k, v], i) => {
		const sub = valueToLines(v, indent + 1, k, change, hl);
		if (i < entries.length - 1) sub[sub.length - 1].segments.push({ ...COMMA_SEG });
		lines.push(...sub);
	});
	lines.push(
		line([...padSegments(indent), ...markHl([{ text: '}', kind: 'plain' }], hl)])
	);
	return lines;
}

interface RawChangeEvent {
	type: 'added' | 'removed' | 'changed';
	a?: { start: number; end: number };
	b?: { start: number; end: number };
	/** 事件发生时两侧已有的行数 = 变更在该侧的插入点 */
	aPos: number;
	bPos: number;
}

interface WalkCtx {
	a: DiffLine[];
	b: DiffLine[];
	events: RawChangeEvent[];
}

/** 递归展开差异树，同时生成两侧的行与变更事件（事件按可见顺序发出） */
function walkDiffNode(ctx: WalkCtx, node: DiffNode, indent: number, key?: string): void {
	switch (node.kind) {
		case 'same': {
			// 两侧内容一致，分别生成（父级会向行尾追加逗号，不能共享对象）
			ctx.a.push(...valueToLines(node.value, indent, key, null, false));
			ctx.b.push(...valueToLines(node.value, indent, key, null, false));
			return;
		}
		case 'changed': {
			const aStart = ctx.a.length;
			const bStart = ctx.b.length;
			ctx.a.push(...valueToLines(node.value, indent, key, 'changed', true));
			ctx.b.push(...valueToLines(node.other, indent, key, 'changed', true));
			ctx.events.push({
				type: 'changed',
				a: { start: aStart, end: ctx.a.length - 1 },
				b: { start: bStart, end: ctx.b.length - 1 },
				aPos: aStart,
				bPos: bStart,
			});
			return;
		}
		case 'removed': {
			const aStart = ctx.a.length;
			ctx.a.push(...valueToLines(node.value, indent, key, 'removed', true));
			ctx.events.push({
				type: 'removed',
				a: { start: aStart, end: ctx.a.length - 1 },
				aPos: aStart,
				bPos: ctx.b.length,
			});
			return;
		}
		case 'added': {
			const bStart = ctx.b.length;
			ctx.b.push(...valueToLines(node.value, indent, key, 'added', true));
			ctx.events.push({
				type: 'added',
				b: { start: bStart, end: ctx.b.length - 1 },
				aPos: ctx.a.length,
				bPos: bStart,
			});
			return;
		}
		case 'array': {
			const items = node.items;
			if (items.length === 0) {
				ctx.a.push(...valueToLines([], indent, key, null, false));
				ctx.b.push(...valueToLines([], indent, key, null, false));
				return;
			}
			// A 侧隐藏新增项，B 侧隐藏删除项
			const visA = items.filter(it => it.status !== 'added');
			const visB = items.filter(it => it.status !== 'removed');
			const prefix = keyPrefixSegments(indent, key);

			if (visA.length === 0) {
				ctx.a.push({ segments: [...prefix, { text: '[]', kind: 'plain' }], change: null });
			} else {
				ctx.a.push({ segments: [...prefix, { text: '[', kind: 'plain' }], change: null });
			}
			if (visB.length === 0) {
				ctx.b.push({ segments: [...prefix, { text: '[]', kind: 'plain' }], change: null });
			} else {
				ctx.b.push({ segments: [...prefix, { text: '[', kind: 'plain' }], change: null });
			}

			let seenA = 0;
			let seenB = 0;
			for (const it of items) {
				const inA = it.status !== 'added';
				const inB = it.status !== 'removed';
				const aBefore = ctx.a.length;
				const bBefore = ctx.b.length;
				walkDiffNode(ctx, it.node, indent + 1);
				if (inA && ctx.a.length > aBefore) {
					seenA++;
					if (seenA < visA.length) ctx.a[ctx.a.length - 1].segments.push({ ...COMMA_SEG });
				}
				if (inB && ctx.b.length > bBefore) {
					seenB++;
					if (seenB < visB.length) ctx.b[ctx.b.length - 1].segments.push({ ...COMMA_SEG });
				}
			}

			if (visA.length > 0) {
				ctx.a.push({ segments: [...padSegments(indent), { text: ']', kind: 'plain' }], change: null });
			}
			if (visB.length > 0) {
				ctx.b.push({ segments: [...padSegments(indent), { text: ']', kind: 'plain' }], change: null });
			}
			return;
		}
		case 'object': {
			const entries = node.entries;
			if (entries.length === 0) {
				ctx.a.push(...valueToLines({}, indent, key, null, false));
				ctx.b.push(...valueToLines({}, indent, key, null, false));
				return;
			}
			const visA = entries.filter(e => e.node.kind !== 'added');
			const visB = entries.filter(e => e.node.kind !== 'removed');
			const prefix = keyPrefixSegments(indent, key);

			if (visA.length === 0) {
				ctx.a.push({ segments: [...prefix, { text: '{}', kind: 'plain' }], change: null });
			} else {
				ctx.a.push({ segments: [...prefix, { text: '{', kind: 'plain' }], change: null });
			}
			if (visB.length === 0) {
				ctx.b.push({ segments: [...prefix, { text: '{}', kind: 'plain' }], change: null });
			} else {
				ctx.b.push({ segments: [...prefix, { text: '{', kind: 'plain' }], change: null });
			}

			let seenA = 0;
			let seenB = 0;
			for (const e of entries) {
				const inA = e.node.kind !== 'added';
				const inB = e.node.kind !== 'removed';
				const aBefore = ctx.a.length;
				const bBefore = ctx.b.length;
				walkDiffNode(ctx, e.node, indent + 1, e.key);
				if (inA && ctx.a.length > aBefore) {
					seenA++;
					if (seenA < visA.length) ctx.a[ctx.a.length - 1].segments.push({ ...COMMA_SEG });
				}
				if (inB && ctx.b.length > bBefore) {
					seenB++;
					if (seenB < visB.length) ctx.b[ctx.b.length - 1].segments.push({ ...COMMA_SEG });
				}
			}

			if (visA.length > 0) {
				ctx.a.push({ segments: [...padSegments(indent), { text: '}', kind: 'plain' }], change: null });
			}
			if (visB.length > 0) {
				ctx.b.push({ segments: [...padSegments(indent), { text: '}', kind: 'plain' }], change: null });
			}
			return;
		}
	}
}

/** 相邻（或相接）的行范围才允许合并：中间隔着一致行的同类型事件保持独立 */
function rangesAdjacent(
	prev: { start: number; end: number } | undefined,
	next: { start: number; end: number } | undefined
): boolean {
	if (!prev || !next) return true; // 有一侧不存在行，不阻碍合并
	return next.start <= prev.end + 1;
}

/**
 * 把差异树展开为 A/B 两侧逐行模型。
 * 连续的同类型变更行合并为 1 个变更块，并给出每个块在两侧的行范围，
 * 供统计新增/删除/修改数量以及"跳转到变更"定位。
 */
export function buildDiffLines(root: DiffNode): DiffLinesResult {
	const ctx: WalkCtx = { a: [], b: [], events: [] };
	walkDiffNode(ctx, root, 0);

	// 合并连续的同类型事件为变更块
	const changes: DiffChangeBlock[] = [];
	for (const ev of ctx.events) {
		const last = changes[changes.length - 1];
		if (
			last &&
			last.type === ev.type &&
			rangesAdjacent(last.a, ev.a) &&
			rangesAdjacent(last.b, ev.b)
		) {
			if (ev.a) last.a = last.a ? { start: last.a.start, end: ev.a.end } : ev.a;
			if (ev.b) last.b = last.b ? { start: last.b.start, end: ev.b.end } : ev.b;
		} else {
			changes.push({
				type: ev.type,
				a: ev.a,
				b: ev.b,
				aAnchor: ev.aPos,
				bAnchor: ev.bPos,
			});
		}
	}

	// 锚点夹取到有效行号
	const clamp = (pos: number, len: number) => Math.max(0, Math.min(pos, len - 1));
	for (const ch of changes) {
		ch.aAnchor = ch.a ? ch.a.start : clamp(ch.aAnchor, ctx.a.length);
		ch.bAnchor = ch.b ? ch.b.start : clamp(ch.bAnchor, ctx.b.length);
	}

	return {
		a: ctx.a,
		b: ctx.b,
		changes,
		addedCount: changes.filter(c => c.type === 'added').length,
		removedCount: changes.filter(c => c.type === 'removed').length,
		changedCount: changes.filter(c => c.type === 'changed').length,
	};
}

