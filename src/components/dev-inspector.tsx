'use client';

import dynamic from 'next/dynamic';

// dev-inspector 只在 dev 模式按需加载，避免污染 prod bundle
// 必须放在 Client Component 里，因为 next/dynamic 的 ssr:false 不允许在 Server Component 中使用
const Inspector = dynamic(
  () => import('react-dev-inspector').then((m) => m.Inspector),
  { ssr: false }
);

export function DevInspector() {
  return <Inspector />;
}
