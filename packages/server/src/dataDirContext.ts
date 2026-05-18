import path from "node:path";

let activeDataDir = "";

export function getDataDir(): string {
  return activeDataDir;
}

export function setDataDir(next: string) {
  activeDataDir = path.resolve(next.trim().replace(/[\r\n\u0000]+/g, ""));
}

export function initDataDir(initial: string) {
  setDataDir(initial);
}

type CacheClearFn = () => void;
const cacheClearFns: CacheClearFn[] = [];

export function registerDataDirCacheClear(fn: CacheClearFn) {
  cacheClearFns.push(fn);
}

export function clearDataDirCaches() {
  for (const fn of cacheClearFns) fn();
}
