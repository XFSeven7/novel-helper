import { useEffect, useState } from "react";

/**
 * 一个很薄的 localStorage 状态封装：
 * - 初次渲染：尝试读取 key（失败则回落 defaultValue）
 * - value 变化：自动写回 localStorage（失败忽略）
 *
 * 约束：这里保持“前端体验优先”，不抛错、不阻断 UI。
 */
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

