'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * 复制到剪贴板 + toast 反馈，全项目共用。
 * 取代 4 个页面里各自复制的 copyToClipboard 实现。
 */
export function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (text: string, label?: string) => {
      try {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(label ? `${label} 已复制` : '已复制到剪贴板');
        setTimeout(() => setCopied(false), timeout);
      } catch {
        toast.error('复制失败');
      }
    },
    [timeout]
  );

  return { copied, copy };
}
