'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Activity, ArrowDown, ArrowUp, Clock, Cpu, RefreshCw, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface RouteStat {
  route_id: string;
  priority: number;
  route_active: boolean;
  api_key_id: string;
  key_name: string;
  provider: string;
  key_active: boolean;
  call_count: number;
  total_tokens: number;
  duration_sum: number;
  error_count: number;
  last_called_at: number | null;
}

interface ModelStat {
  model: string;
  model_key: string;
  call_count: number;
  total_tokens: number;
  error_count: number;
  avg_duration_ms: number;
  error_rate: number;
  last_called_at: number | null;
  routes: RouteStat[];
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRouteId, setSavingRouteId] = useState<string | null>(null);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/models');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '获取模型路由失败');
      setModels(result.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取模型路由失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return models;
    return models.filter(item =>
      item.model_key.includes(normalizedQuery) ||
      item.routes.some(route => route.key_name.toLowerCase().includes(normalizedQuery) || route.provider.toLowerCase().includes(normalizedQuery))
    );
  }, [models, query]);

  const updateRoute = async (route: RouteStat, update: { priority?: number; is_active?: boolean }) => {
    try {
      setSavingRouteId(route.route_id);
      const response = await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: route.route_id, ...update }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '更新失败');
      toast.success('路由配置已更新');
      await fetchModels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败');
    } finally {
      setSavingRouteId(null);
    }
  };

  const moveRoute = (route: RouteStat, delta: number, routeCount: number) => {
    const nextPriority = Math.min(routeCount, Math.max(1, route.priority + delta));
    if (nextPriority !== route.priority) updateRoute(route, { priority: nextPriority });
  };

  const submitPriority = (route: RouteStat, routeCount: number) => {
    const draft = priorityDrafts[route.route_id];
    if (draft === undefined) return;
    const value = Number(draft);
    setPriorityDrafts(current => {
      const next = { ...current };
      delete next[route.route_id];
      return next;
    });
    if (!Number.isInteger(value) || value < 1) {
      toast.error('优先级必须是大于等于 1 的整数');
      return;
    }
    const nextPriority = Math.min(routeCount, value);
    if (nextPriority !== route.priority) updateRoute(route, { priority: nextPriority });
  };

  const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(value || 0);
  const formatDate = (timestamp: number | null) => timestamp ? new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无调用';

  return (
    <PageShell
      title="模型管理"
      subtitle="管理同名模型的上游路由顺序，并查看模型级调用指标"
      icon={Cpu}
      maxWidth="wide"
      actions={
        <Button variant="outline" size="sm" onClick={fetchModels} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={Cpu} label="已配置模型" value={formatNumber(models.length)} />
        <Metric icon={Activity} label="总调用次数" value={formatNumber(models.reduce((sum, item) => sum + item.call_count, 0))} />
        <Metric icon={Zap} label="累计 Tokens" value={formatNumber(models.reduce((sum, item) => sum + item.total_tokens, 0))} />
        <Metric icon={Clock} label="路由配置数" value={formatNumber(models.reduce((sum, item) => sum + item.routes.length, 0))} />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card p-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索模型名、Key 名称或服务商"
          className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(item => <Skeleton key={item} className="h-44 w-full" />)}
        </div>
      ) : visibleModels.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Cpu className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">暂无模型路由</p>
            <p className="mt-1 text-sm text-muted-foreground">请先在 API Key 管理页为上游 Key 配置模型。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleModels.map(item => (
            <Card key={item.model_key} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="grid gap-4 border-b bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-mono text-base font-semibold">{item.model}</h2>
                      {item.routes.length > 1 && <Badge variant="secondary">{item.routes.length} 条候选路由</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">优先级 1 最高。可以用数字或上下按钮调整路由顺序。</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:flex sm:items-center sm:gap-5">
                    <Stat label="调用" value={formatNumber(item.call_count)} />
                    <Stat label="Tokens" value={formatNumber(item.total_tokens)} />
                    <Stat label="平均耗时" value={item.call_count ? `${item.avg_duration_ms}ms` : '-'} />
                    <Stat label="错误率" value={item.call_count ? `${item.error_rate}%` : '-'} danger={item.error_rate > 0} />
                    <Stat label="最近调用" value={formatDate(item.last_called_at)} />
                  </div>
                </div>

                <div className="divide-y">
                  {item.routes.map(route => {
                    const routeAvgDuration = route.call_count ? Math.round(route.duration_sum / route.call_count) : 0;
                    const routeErrorRate = route.call_count ? (route.error_count / route.call_count * 100).toFixed(1) : '0.0';
                    const saving = savingRouteId === route.route_id;
                    return (
                      <div key={route.route_id} className="grid gap-3 p-4 md:grid-cols-[80px_minmax(0,1fr)_auto_auto] md:items-center">
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon" className="h-7 w-7" disabled={saving || route.priority === 1} onClick={() => moveRoute(route, -1, item.routes.length)} aria-label="提高优先级">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" disabled={saving || route.priority === item.routes.length} onClick={() => moveRoute(route, 1, item.routes.length)} aria-label="降低优先级">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={item.routes.length}
                              inputMode="numeric"
                              aria-label={`${route.key_name} 的优先级`}
                              value={priorityDrafts[route.route_id] ?? String(route.priority)}
                              disabled={saving}
                              onChange={event => setPriorityDrafts(current => ({ ...current, [route.route_id]: event.target.value }))}
                              onBlur={() => submitPriority(route, item.routes.length)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') event.currentTarget.blur();
                                if (event.key === 'Escape') {
                                  setPriorityDrafts(current => {
                                    const next = { ...current };
                                    delete next[route.route_id];
                                    return next;
                                  });
                                  event.currentTarget.blur();
                                }
                              }}
                              className="h-7 w-10 px-1 text-center font-mono text-xs"
                            />
                            <span className="truncate text-sm font-medium">{route.key_name}</span>
                            <Badge variant="outline" className="capitalize">{route.provider}</Badge>
                            {!route.key_active && <Badge variant="destructive">Key 已禁用</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatNumber(route.call_count)} 次调用 · {formatNumber(route.total_tokens)} Tokens · {route.call_count ? `${routeAvgDuration}ms` : '暂无耗时'} · {route.call_count ? `${routeErrorRate}% 错误率` : '暂无调用'}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">{formatDate(route.last_called_at)}</div>
                        <div className="flex items-center gap-2 md:justify-end">
                          <span className="text-xs text-muted-foreground">启用</span>
                          <Switch checked={route.route_active} disabled={saving || !route.key_active} onCheckedChange={checked => updateRoute(route, { is_active: checked })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-3"><Icon className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-mono text-sm font-semibold tabular-nums">{value}</p></div></CardContent></Card>;
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div><p className="text-muted-foreground">{label}</p><p className={`mt-0.5 font-mono tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</p></div>;
}
