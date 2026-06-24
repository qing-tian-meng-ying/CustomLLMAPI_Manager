import { cn } from '@/lib/utils';

interface PageShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** 容器最大宽度，默认 max-w-7xl */
  maxWidth?: 'default' | 'narrow' | 'wide';
  className?: string;
}

/**
 * 统一的页面外壳。
 * 取代每个 page.tsx 顶部重复的：
 *   <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ...">
 *     <div className="container mx-auto px-4 py-8">
 *       <div className="flex items-center gap-3 mb-8"> header ... </div>
 */
export function PageShell({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  maxWidth = 'default',
  className,
}: PageShellProps) {
  const maxW =
    maxWidth === 'narrow'
      ? 'max-w-3xl'
      : maxWidth === 'wide'
      ? 'max-w-7xl'
      : 'max-w-6xl';

  return (
    <div className={cn('mx-auto px-4 py-8 sm:px-6', maxW, className)}>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
