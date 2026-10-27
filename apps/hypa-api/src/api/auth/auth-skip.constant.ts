type AuthSkipMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export const AUTH_SKIP_RULES: ReadonlyArray<{
  method: AuthSkipMethod;
  exactPaths?: readonly string[];
  pathPrefixes: readonly string[];
}> = [
  {
    method: 'GET',
    pathPrefixes: ['/labs/wotd'],
  },
] as const;
