export const formatNumber = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  return new Intl.NumberFormat().format(value);
};

export const formatPercent = (value: number | null): string =>
  value === null ? '-' : `${(value * 100).toFixed(1)}%`;

export const formatDateTime = (value: string): string => {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
};

export const formatCompactDate = (value: string): string => {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
};
