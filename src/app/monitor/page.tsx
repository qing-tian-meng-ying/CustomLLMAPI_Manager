'use client';

import { TrendingUp } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TokenUsageMonitor } from '@/components/token-usage-monitor';

export default function MonitorPage() {
	return (
		<PageShell
			title="Token 使用监控"
			subtitle="按不同时间粒度查看各模型的 token 消耗情况"
			icon={TrendingUp}
			maxWidth="wide"
		>
			<TokenUsageMonitor />
		</PageShell>
	);
}
