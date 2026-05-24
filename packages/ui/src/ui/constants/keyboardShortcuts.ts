export type ShortcutEntry = {
  action: string;
  mac: string[];
  win: string[];
};

/** 设置页「快捷键」展示用；与 App / 各组件内实际监听保持一致 */
export const KEYBOARD_SHORTCUTS: ShortcutEntry[] = [
  {
    action: "打开全书搜索",
    mac: ["⌘", "I"],
    win: ["Ctrl", "I"]
  },
  {
    action: "打开查找替换",
    mac: ["⌥", "R"],
    win: ["Alt", "R"]
  },
  {
    action: "在当前行下方插入空行",
    mac: ["⌥", "⇧", "Enter"],
    win: ["Alt", "Shift", "Enter"]
  },
  {
    action: "切换全屏 / 退出全屏",
    mac: ["⌥", "Enter"],
    win: ["Alt", "Enter"]
  }
];
