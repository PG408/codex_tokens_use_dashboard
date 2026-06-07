export const projectNameFromCwd = (cwd: string): string => {
  const trimmed = cwd.trim();

  if (!trimmed) {
    return 'Unknown project';
  }

  return trimmed.split('/').filter(Boolean).at(-1) ?? trimmed;
};

export const sessionLabel = (sessionId: string): string => {
  const parts = sessionId.split('-');

  return parts.length > 2 ? parts.slice(0, 3).join('-') : sessionId;
};
