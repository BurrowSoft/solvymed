import { useMemo } from 'react';
import { useTheme } from './theme-context';

export function useStyles<T extends Record<string, object>>(factory: () => T): T {
  const { theme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [theme]);
}
