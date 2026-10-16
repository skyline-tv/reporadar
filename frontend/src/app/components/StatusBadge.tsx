'use client';

import { Badge } from '@chakra-ui/react';

const map: Record<string, { color: string; label: string }> = {
  completed: { color: 'green', label: 'Completed' },
  failed: { color: 'red', label: 'Failed' },
  pending: { color: 'yellow', label: 'Pending' },
  processing: { color: 'blue', label: 'Processing' },
  critical: { color: 'red', label: 'Critical' },
  warning: { color: 'orange', label: 'Warning' },
  info: { color: 'cyan', label: 'Info' },
};

export default function StatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: string;
}) {
  const key = (status || '').toLowerCase();
  const conf = map[key] || { color: 'gray', label: status || 'Unknown' };
  return (
    <Badge colorScheme={conf.color} variant="subtle" fontSize={size} px={2} py={0.5} borderRadius="md">
      {conf.label}
    </Badge>
  );
}
