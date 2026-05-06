import { useEffect, useState } from "react";

export function useLocalStorageState<T>(input: {
  key: string;
  defaultValue: T;
  parse?: (raw: string) => T;
  serialize?: (v: T) => string;
}) {
  const { key, defaultValue, parse, serialize } = input;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return parse ? parse(raw) : (JSON.parse(raw) as T);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      const raw = serialize ? serialize(value) : JSON.stringify(value);
      localStorage.setItem(key, raw);
    } catch {
      // ignore
    }
  }, [key, serialize, value]);

  return [value, setValue] as const;
}

