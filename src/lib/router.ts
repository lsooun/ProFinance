import { useCallback, useEffect, useState } from 'react';

export type PageKey =
  | 'dashboard'
  | 'projects'
  | 'transactions'
  | 'timesheets'
  | 'personnel'
  | 'reports'
  | 'users';

const PAGES: PageKey[] = [
  'dashboard',
  'projects',
  'transactions',
  'timesheets',
  'personnel',
  'reports',
  'users',
];

export interface RouteState {
  page: PageKey;
  projectId: string | null;
  transactionProjectId: string | null;
}

const DEFAULT_ROUTE: RouteState = {
  page: 'dashboard',
  projectId: null,
  transactionProjectId: null,
};

export function parseRoute(hash: string): RouteState {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return DEFAULT_ROUTE;
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const page = PAGES.includes(segments[0] as PageKey) ? (segments[0] as PageKey) : 'dashboard';
  const projectId = page === 'projects' && segments[1] ? segments[1] : null;
  const params = new URLSearchParams(queryPart);
  const transactionProjectId = page === 'transactions' ? params.get('project') : null;
  return { page, projectId, transactionProjectId };
}

export function getResetTokenFromHash(hash: string): string | null {
  const match = hash.match(/^#\/reset-password\?token=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function pathFor(page: PageKey, projectId?: string | null): string {
  if (page === 'projects' && projectId) return `/projects/${encodeURIComponent(projectId)}`;
  return `/${page}`;
}

function toHash(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function useHashRoute(): {
  route: RouteState;
  navigate: (path: string, options?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<RouteState>(() =>
    typeof window === 'undefined' ? DEFAULT_ROUTE : parseRoute(window.location.hash)
  );

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseRoute(window.location.hash));
    }
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.history.replaceState(null, '', toHash('/dashboard'));
      setRoute(DEFAULT_ROUTE);
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path: string, options: { replace?: boolean } = {}) => {
    const hash = toHash(path);
    if (window.location.hash === hash) return;
    if (options.replace) {
      window.history.replaceState(null, '', hash);
      setRoute(parseRoute(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return { route, navigate };
}
