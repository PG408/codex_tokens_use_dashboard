type SessionDisplaySource = {
  cwd?: string;
  sessionId: string;
  sessionName?: string;
};

export const projectNameFromCwd = (cwd = ''): string => {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? 'Unknown project';
};

export const sessionName = (source: SessionDisplaySource): string =>
  source.sessionName?.trim() || 'Untitled session';

export const sessionHoverTitle = (source: SessionDisplaySource): string =>
  `Session id: ${source.sessionId}`;
