'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageShell } from '@/components/page-shell';
import { useCopy } from '@/hooks/use-copy';
import {
	Key,
	Plus,
	Trash2,
	Edit2,
	Cpu,
	Copy,
	Star,
	StarOff,
	X,
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
	id: string;
	name: string;
	provider: string;
	base_url: string;
	api_key: string;
	models: string[];
	is_active: boolean;
	is_default: boolean;
	created_at: string;
}

const PROVIDERS = [
	{ value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
	{ value: 'anthropic', label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com' },
	{ value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
	{ value: 'zhipu', label: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
	{ value: 'yi', label: '零一万物', baseUrl: 'https://api.lingyiwanwu.com/v1' },
	{ value: 'mistral', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1' },
	{ value: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
	{ value: 'moonshot', label: '月之暗面 (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1' },
	{ value: 'ali', label: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
	{ value: 'custom', label: '自定义 (OpenAI 兼容)', baseUrl: '' },
];

const MODELS_BY_PROVIDER: Record<string, string[]> = {
	openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
	anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
	deepseek: ['deepseek-chat', 'deepseek-coder'],
	zhipu: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-4v', 'glm-3-turbo'],
	yi: ['yi-large', 'yi-large-rag', 'yi-medium', 'yi-medium-200k'],
	mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
	groq: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
	moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
	ali: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-coder-turbo'],
	custom: ['custom-model'],
};

const DEFAULT_FORM = {
	name: '',
	provider: 'openai',
	base_url: 'https://api.openai.com/v1',
	api_key: '',
	models: ['gpt-4o'],
	is_default: false,
};

export default function KeysPage() {
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
	const [formData, setFormData] = useState({ ...DEFAULT_FORM });

	// 删除确认
	const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
	const [deleting, setDeleting] = useState(false);

	const { copy: copyBaseUrl } = useCopy();

	useEffect(() => {
		fetchKeys();
	}, []);

	const fetchKeys = async () => {
		try {
			const res = await fetch('/api/keys');
			if (res.ok) {
				const data = await res.json();
				setKeys(data.data || []);
			}
		} catch (error) {
			console.error('获取 Keys 失败:', error);
			toast.error('获取 Keys 失败');
		} finally {
			setLoading(false);
		}
	};

	const handleProviderChange = (provider: string) => {
		const providerConfig = PROVIDERS.find((p) => p.value === provider);
		setFormData({
			...formData,
			provider,
			base_url: providerConfig?.baseUrl || '',
			models: [MODELS_BY_PROVIDER[provider]?.[0] || ''],
		});
	};

	const handleSubmit = async () => {
		if (!formData.name) {
			toast.error('请填写名称');
			return;
		}

		if (!formData.models || formData.models.length === 0) {
			toast.error('请至少选择一个模型');
			return;
		}

		if (!editingKey && !formData.api_key) {
			toast.error('请填写 API Key');
			return;
		}

		try {
			const url = '/api/keys';
			const method = editingKey ? 'PUT' : 'POST';
			const body: Record<string, unknown> = {
				name: formData.name,
				provider: formData.provider,
				base_url: formData.base_url,
				models: formData.models,
				is_default: formData.is_default,
			};

			if (formData.api_key) {
				body.api_key = formData.api_key;
			}

			if (editingKey) {
				body.id = editingKey.id;
			}

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (res.ok) {
				toast.success(editingKey ? '更新成功' : '添加成功');
				setDialogOpen(false);
				setEditingKey(null);
				setFormData({ ...DEFAULT_FORM });
				fetchKeys();
			} else {
				const error = await res.json();
				toast.error(error.error?.message || '操作失败');
			}
		} catch (error) {
			console.error('操作失败:', error);
			toast.error('操作失败');
		}
	};

	const handleEdit = (key: ApiKey) => {
		setEditingKey(key);
		setFormData({
			name: key.name,
			provider: key.provider,
			base_url: key.base_url,
			api_key: '',
			models: key.models,
			is_default: key.is_default,
		});
		setDialogOpen(true);
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			setDeleting(true);
			const res = await fetch(`/api/keys?id=${deleteTarget.id}`, { method: 'DELETE' });
			if (res.ok) {
				toast.success('删除成功');
				setDeleteTarget(null);
				fetchKeys();
			} else {
				toast.error('删除失败');
			}
		} catch (error) {
			console.error('删除失败:', error);
			toast.error('删除失败');
		} finally {
			setDeleting(false);
		}
	};

	const handleToggleActive = async (key: ApiKey) => {
		try {
			const res = await fetch('/api/keys', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: key.id,
					is_active: !key.is_active,
				}),
			});
			if (res.ok) {
				toast.success(key.is_active ? '已禁用' : '已启用');
				fetchKeys();
			}
		} catch (error) {
			console.error('切换状态失败:', error);
			toast.error('操作失败');
		}
	};

	const handleSetDefault = async (key: ApiKey) => {
		try {
			const res = await fetch('/api/keys', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: key.id,
					is_default: !key.is_default,
				}),
			});
			if (res.ok) {
				toast.success('已设为默认');
				fetchKeys();
			}
		} catch (error) {
			console.error('设置默认失败:', error);
			toast.error('操作失败');
		}
	};

	const groupByProvider = keys.reduce((acc, key) => {
		if (!acc[key.provider]) acc[key.provider] = [];
		acc[key.provider].push(key);
		return acc;
	}, {} as Record<string, ApiKey[]>);

	return (
		<PageShell
			title="API Key 管理"
			subtitle="配置各大 AI 服务商的 API Key"
			icon={Key}
			actions={
				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							添加 API Key
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[600px] gap-0 p-0">
						<DialogHeader className="border-b px-6 pt-6 pb-4 text-left">
							<DialogTitle className="text-base">
								{editingKey ? '编辑 API Key' : '添加新的 API Key'}
							</DialogTitle>
							<p className="text-sm text-muted-foreground">
								{editingKey
									? '修改 API Key 配置，留空字段将保留原值'
									: '配置 AI 服务商的 API Key，支持多个相同提供商'}
							</p>
						</DialogHeader>

						<div className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5">
							{/* 基本信息：名称 + 提供商 双列 */}
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="name">名称</Label>
									<Input
										id="name"
										placeholder="例如: My OpenAI Key"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="provider">提供商</Label>
									<Select value={formData.provider} onValueChange={handleProviderChange}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PROVIDERS.map((p) => (
												<SelectItem key={p.value} value={p.value}>
													{p.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* 连接配置 */}
							<div className="space-y-2">
								<Label htmlFor="base_url">API Base URL</Label>
								<Input
									id="base_url"
									placeholder="https://api.openai.com/v1"
									value={formData.base_url}
									onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
									className="font-mono text-sm"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="api_key" className="flex items-center gap-2">
									API Key
									{editingKey && (
										<span className="text-xs font-normal text-muted-foreground">
											（留空则保留原值）
										</span>
									)}
								</Label>
								<Input
									id="api_key"
									type="password"
									placeholder="sk-..."
									value={formData.api_key}
									onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
									className="font-mono text-sm"
								/>
							</div>

							{/* 模型配置 */}
							<div className="space-y-2">
								<Label htmlFor="models">支持的模型（可多选）</Label>
								<div className="space-y-2">
									<Input
										placeholder="输入模型名称，按回车添加"
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												const input = e.currentTarget;
												const value = input.value.trim();
												if (value && !formData.models.includes(value)) {
													setFormData({ ...formData, models: [...formData.models, value] });
													input.value = '';
												}
											}
										}}
									/>
									{formData.provider !== 'custom' &&
										MODELS_BY_PROVIDER[formData.provider]?.length > 0 && (
											<Select
												value=""
												onValueChange={(v) => {
													if (v && !formData.models.includes(v)) {
														setFormData({ ...formData, models: [...formData.models, v] });
													}
												}}
											>
												<SelectTrigger>
													<SelectValue placeholder="或从预设模型中选择" />
												</SelectTrigger>
												<SelectContent>
													{MODELS_BY_PROVIDER[formData.provider]
														.filter((m) => !formData.models.includes(m))
														.map((m) => (
															<SelectItem key={m} value={m}>
																{m}
															</SelectItem>
														))}
												</SelectContent>
											</Select>
										)}
									{formData.models.length > 0 && (
										<div className="flex flex-wrap gap-1.5 pt-1">
											{formData.models.map((model, index) => (
												<Badge
													key={`${model}-${index}`}
													variant="secondary"
													className="flex items-center gap-1 font-mono"
												>
													{model}
													<button
														type="button"
														aria-label={`移除 ${model}`}
														onClick={() => {
															const newModels = formData.models.filter((_, i) => i !== index);
															setFormData({ ...formData, models: newModels });
														}}
														className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive"
													>
														<X className="h-3 w-3" />
													</button>
												</Badge>
											))}
										</div>
									)}
								</div>
							</div>

							{/* 默认开关 */}
							<div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
								<div className="space-y-0.5">
									<Label htmlFor="is_default" className="cursor-pointer">
										设为该提供商的默认 Key
									</Label>
									<p className="text-xs text-muted-foreground">
										相同提供商的请求会优先使用此 Key
									</p>
								</div>
								<Switch
									id="is_default"
									checked={formData.is_default}
									onCheckedChange={(checked) =>
										setFormData({ ...formData, is_default: checked })
									}
								/>
							</div>
						</div>

						{/* 底部操作区 */}
						<div className="flex justify-end gap-3 border-t px-6 py-4">
							<Button variant="outline" onClick={() => setDialogOpen(false)}>
								取消
							</Button>
							<Button onClick={handleSubmit}>
								{editingKey ? '保存修改' : '添加'}
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			}
		>
			{loading ? (
				<div className="grid gap-4">
					{[1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-32 w-full" />
					))}
				</div>
			) : keys.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center">
						<Cpu className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
						<h3 className="mb-2 text-lg font-medium">暂无 API Key</h3>
						<p className="text-muted-foreground">点击右上角按钮添加你的第一个 API Key</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-6">
					{Object.entries(groupByProvider).map(([provider, providerKeys]) => (
						<div key={provider}>
							<h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
								<Badge variant="outline" className="capitalize">
									{provider}
								</Badge>
								<span className="text-sm text-muted-foreground">
									{providerKeys.length} 个 Key
								</span>
							</h2>
							<div className="grid gap-3">
								{providerKeys.map((key) => (
									<Card
										key={key.id}
										className={key.is_active ? '' : 'opacity-60'}
									>
										<CardContent className="py-4">
											<div className="flex items-start justify-between">
												<div className="flex-1 min-w-0">
													<div className="mb-2 flex items-center gap-2">
														<h3 className="font-medium">{key.name}</h3>
														{key.is_default && (
															<Badge variant="secondary" className="bg-primary/10 text-primary">
																<Star className="mr-1 h-3 w-3" />
																默认
															</Badge>
														)}
														{!key.is_active && (
															<Badge variant="secondary">已禁用</Badge>
														)}
													</div>
													<div className="grid grid-cols-1 gap-3 text-sm">
														<div>
															<div className="mb-1 text-xs text-muted-foreground">
																支持的模型 ({key.models.length} 个)
															</div>
															<div className="flex flex-wrap gap-1">
																{key.models.map((model, idx) => (
																	<Badge
																		key={idx}
																		variant="outline"
																		className="font-mono text-xs"
																	>
																		{model}
																	</Badge>
																))}
															</div>
														</div>
														<div>
															<div className="text-xs text-muted-foreground">Base URL</div>
															<div className="flex items-center gap-2">
																<span className="truncate font-mono text-xs">
																	{key.base_url}
																</span>
																<button
																	onClick={() => copyBaseUrl(key.base_url, 'Base URL')}
																	className="text-muted-foreground transition-colors hover:text-foreground"
																	aria-label="复制 Base URL"
																>
																	<Copy className="h-3 w-3" />
																</button>
															</div>
														</div>
													</div>
												</div>

												{/* 操作按钮：分组 + 分隔 */}
												<div className="ml-4 flex items-center gap-1">
													<TooltipProvider delayDuration={300}>
														<Tooltip>
															<TooltipTrigger asChild>
																<button
																	onClick={() => handleSetDefault(key)}
																	className={`rounded-md p-2 transition-colors ${
																		key.is_default
																			? 'text-primary'
																			: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
																	}`}
																	aria-label={key.is_default ? '取消默认' : '设为默认'}
																>
																	{key.is_default ? (
																		<Star className="h-4 w-4" />
																	) : (
																		<StarOff className="h-4 w-4" />
																	)}
																</button>
															</TooltipTrigger>
															<TooltipContent>
																{key.is_default ? '取消默认' : '设为默认'}
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider delayDuration={300}>
														<Tooltip>
															<TooltipTrigger asChild>
																<div>
																	<Switch
																		checked={key.is_active}
																		onCheckedChange={() => handleToggleActive(key)}
																		aria-label="启用/禁用"
																	/>
																</div>
															</TooltipTrigger>
															<TooltipContent>
																{key.is_active ? '禁用' : '启用'}
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<Separator orientation="vertical" className="mx-1 h-6" />

													<TooltipProvider delayDuration={300}>
														<Tooltip>
															<TooltipTrigger asChild>
																<button
																	onClick={() => handleEdit(key)}
																	className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
																	aria-label="编辑"
																>
																	<Edit2 className="h-4 w-4" />
																</button>
															</TooltipTrigger>
															<TooltipContent>编辑</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<TooltipProvider delayDuration={300}>
														<Tooltip>
															<TooltipTrigger asChild>
																<button
																	onClick={() => setDeleteTarget(key)}
																	className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
																	aria-label="删除"
																>
																	<Trash2 className="h-4 w-4" />
																</button>
															</TooltipTrigger>
															<TooltipContent>删除</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						</div>
					))}
				</div>
			)}

			{/* 使用说明 */}
			<Card className="mt-8 bg-muted/30">
								<CardContent className="space-y-2 py-4 text-sm text-muted-foreground">
									<p>1. 支持多个相同提供商的 API Key，系统会优先使用标记为「默认」的 Key</p>
									<p>2. 禁用某个 Key 后，使用该提供商的请求会自动切换到其他可用的 Key</p>
									<p>3. 调用时会自动记录请求和响应，可在「Logs」中查看详情</p>
									<p>4. 所有 Key 信息加密存储，不会明文显示</p>
								</CardContent>
							</Card>

			{/* 删除确认 */}
			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>确认删除这个 API Key？</AlertDialogTitle>
						<AlertDialogDescription>
							此操作不可恢复。
							{deleteTarget && (
								<span className="mt-2 block truncate font-mono text-xs text-muted-foreground">
									{deleteTarget.name} · {deleteTarget.provider}
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
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{deleting ? '删除中...' : '确认删除'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}
