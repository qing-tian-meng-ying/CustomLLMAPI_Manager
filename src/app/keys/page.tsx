'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
	Key, 
	Plus, 
	Trash2, 
	Edit2, 
	Cpu,
	Copy,
	Star,
	StarOff
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
	id: string;
	name: string;
	provider: string;
	base_url: string;
	api_key: string;
	models: string[]; // 改为数组
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

export default function KeysPage() {
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
	const [formData, setFormData] = useState({
		name: '',
		provider: 'openai',
		base_url: 'https://api.openai.com/v1',
		api_key: '',
		models: ['gpt-4o'], // 改为数组
		is_default: false,
	});

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
		const providerConfig = PROVIDERS.find(p => p.value === provider);
		setFormData({
			...formData,
			provider,
			base_url: providerConfig?.baseUrl || '',
			models: [MODELS_BY_PROVIDER[provider]?.[0] || ''], // 改为数组
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

		// 编辑时如果 api_key 为空，不发送该字段
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
			
			// 只有在有值时才发送 api_key
			if (formData.api_key) {
				body.api_key = formData.api_key;
			}
			
			if (editingKey) {
				body.id = editingKey.id;
			}

			console.log('提交数据:', body);

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (res.ok) {
				toast.success(editingKey ? '更新成功' : '添加成功');
				setDialogOpen(false);
				setEditingKey(null);
				setFormData({
					name: '',
					provider: 'openai',
					base_url: 'https://api.openai.com/v1',
					api_key: '',
					models: ['gpt-4o'],
					is_default: false,
				});
				fetchKeys();
			} else {
				const error = await res.json();
				console.error('保存失败:', error);
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
			api_key: '', // 不显示原有 key
			models: key.models, // 使用数组
			is_default: key.is_default,
		});
		setDialogOpen(true);
	};

	const handleDelete = async (id: string) => {
		if (!confirm('确定要删除这个 API Key 吗？')) return;

		try {
			const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
			if (res.ok) {
				toast.success('删除成功');
				fetchKeys();
			} else {
				toast.error('删除失败');
			}
		} catch (error) {
			console.error('删除失败:', error);
			toast.error('删除失败');
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

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success('已复制到剪贴板');
	};

	const groupByProvider = keys.reduce((acc, key) => {
		if (!acc[key.provider]) acc[key.provider] = [];
		acc[key.provider].push(key);
		return acc;
	}, {} as Record<string, ApiKey[]>);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
							<Key className="w-6 h-6 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-white">
								API Key 管理
							</h1>
							<p className="text-sm text-slate-500 dark:text-slate-400">
								配置各大 AI 服务商的 API Key
							</p>
						</div>
					</div>
					<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
						<DialogTrigger asChild>
							<Button className="bg-blue-600 hover:bg-blue-700">
								<Plus className="w-4 h-4 mr-2" />
								添加 API Key
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg">
							<DialogHeader>
								<DialogTitle>
									{editingKey ? '编辑 API Key' : '添加新的 API Key'}
								</DialogTitle>
							</DialogHeader>
							<div className="space-y-4 py-4">
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

								<div className="space-y-2">
									<Label htmlFor="base_url">API Base URL</Label>
									<Input
										id="base_url"
										placeholder="https://api.openai.com/v1"
										value={formData.base_url}
										onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="api_key">
										API Key {editingKey && <span className="text-slate-400">(留空则保留原值)</span>}
									</Label>
									<Input
										id="api_key"
										type="password"
										placeholder="sk-..."
										value={formData.api_key}
										onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="models">支持的模型（可多选）</Label>
									<div className="space-y-2">
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
											{formData.provider !== 'custom' && MODELS_BY_PROVIDER[formData.provider]?.length > 0 && (
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
															.filter(m => !formData.models.includes(m))
															.map((m) => (
																<SelectItem key={m} value={m}>
																	{m}
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											)}
											<div className="flex flex-wrap gap-2">
												{formData.models.map((model, index) => (
													<Badge key={index} variant="secondary" className="flex items-center gap-1">
														{model}
														<button
															onClick={() => {
																const newModels = formData.models.filter((_, i) => i !== index);
																setFormData({ ...formData, models: newModels });
															}}
															className="ml-1 hover:text-red-600"
														>
															×
														</button>
													</Badge>
												))}
											</div>
										</div>
									</div>
								</div>

								<div className="flex items-center space-x-2">
									<Switch
										id="is_default"
										checked={formData.is_default}
										onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
									/>
									<Label htmlFor="is_default">设为该提供商的默认 Key</Label>
								</div>

								<Button onClick={handleSubmit} className="w-full">
									{editingKey ? '保存修改' : '添加'}
								</Button>
							</div>
						</DialogContent>
					</Dialog>
				</div>

				{/* Keys List */}
				{loading ? (
					<div className="grid gap-4">
						{[1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-32 w-full" />
						))}
					</div>
				) : keys.length === 0 ? (
					<Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
						<CardContent className="py-12 text-center">
							<Cpu className="w-12 h-12 mx-auto mb-4 text-slate-400" />
							<h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
								暂无 API Key
							</h3>
							<p className="text-slate-500 mb-4">
								点击上方按钮添加你的第一个 API Key
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-6">
						{Object.entries(groupByProvider).map(([provider, providerKeys]) => (
							<div key={provider}>
								<h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
									<Badge variant="outline" className="capitalize">
										{provider}
									</Badge>
									<span className="text-sm text-slate-500">
										{providerKeys.length} 个 Key
									</span>
								</h2>
								<div className="grid gap-4">
									{providerKeys.map((key) => (
										<Card
											key={key.id}
											className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm transition-opacity ${
												!key.is_active ? 'opacity-60' : ''
											}`}
										>
											<CardContent className="py-4">
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-2">
															<h3 className="font-medium text-slate-900 dark:text-white">
																{key.name}
															</h3>
															{key.is_default && (
																<Badge variant="default" className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
																	<Star className="w-3 h-3 mr-1" />
																	默认
																</Badge>
															)}
															{!key.is_active && (
																<Badge variant="secondary" className="text-xs">
																	已禁用
																</Badge>
															)}
														</div>
														<div className="grid grid-cols-1 gap-4 text-sm">
															<div>
																<div className="text-slate-500 dark:text-slate-400 mb-1 text-sm">支持的模型 ({key.models.length} 个)</div>
																<div className="flex flex-wrap gap-1">
																	{key.models.map((model, idx) => (
																		<Badge key={idx} variant="outline" className="text-xs font-mono">
																			{model}
																		</Badge>
																	))}
																</div>
															</div>
															<div>
																<div className="text-slate-500 dark:text-slate-400 text-sm">Base URL</div>
																<div className="flex items-center gap-2">
																	<span className="text-slate-900 dark:text-white font-mono text-xs truncate">
																		{key.base_url}
																	</span>
																	<button
																		onClick={() => copyToClipboard(key.base_url)}
																		className="text-slate-400 hover:text-slate-600"
																	>
																		<Copy className="w-3 h-3" />
																	</button>
																</div>
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2 ml-4">
														<button
															onClick={() => handleSetDefault(key)}
															className={`p-2 rounded-lg transition-colors ${
																key.is_default
																	? 'text-amber-500 bg-amber-50 dark:bg-amber-900/30'
																	: 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
															}`}
														>
															{key.is_default ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
														</button>
														<Switch
															checked={key.is_active}
															onCheckedChange={() => handleToggleActive(key)}
															className="data-[state=checked]:bg-green-600"
														/>
														<button
															onClick={() => handleEdit(key)}
															className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
														>
															<Edit2 className="w-4 h-4" />
														</button>
														<button
															onClick={() => handleDelete(key.id)}
															className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
														>
															<Trash2 className="w-4 h-4" />
														</button>
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

				{/* Usage Tips */}
				<Card className="mt-8 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800/50 dark:to-slate-700/50 border-0">
					<CardHeader>
						<CardTitle className="text-lg">使用说明</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
						<p>1. 支持多个相同提供商的 API Key，系统会优先使用标记为「默认」的 Key</p>
						<p>2. 禁用某个 Key 后，使用该提供商的请求会自动切换到其他可用的 Key</p>
						<p>3. 调用时会自动记录请求和响应，可在「调用记录」中查看详情</p>
						<p>4. 所有 Key 信息加密存储，不会明文显示</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
