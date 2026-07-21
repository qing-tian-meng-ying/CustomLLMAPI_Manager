'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Key, FileText, Play, Cpu, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/keys', label: 'Keys', icon: Key },
  { href: '/models', label: 'Models', icon: Cpu },
  { href: '/monitor', label: 'Monitor', icon: TrendingUp },
  { href: '/logs', label: 'Logs', icon: FileText },
  { href: '/test', label: 'Test', icon: Play },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <span className="hidden font-semibold tracking-tight sm:inline">
              AI API Gateway
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
