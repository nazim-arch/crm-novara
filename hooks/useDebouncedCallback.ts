import { useCallback, useRef } from "react";

export function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always hold the latest fn without putting it in useCallback deps,
  // so the returned debounced function stays stable across renders.
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  ) as T;
}
