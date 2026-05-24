import React, { useMemo } from "react";
import { KEYBOARD_SHORTCUTS } from "../../constants/keyboardShortcuts";
import { isMacPlatform } from "../../utils/platform";

function ShortcutKeys({ parts }: { parts: string[] }) {
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      nodes.push(
        <span key={`plus-${i}`} className="settingsShortcutPlus">
          +
        </span>
      );
    }
    nodes.push(
      <kbd key={`key-${i}`} className="settingsShortcutKbd">
        {part}
      </kbd>
    );
  });
  return <span className="settingsShortcutKeys">{nodes}</span>;
}

export function SettingsShortcutsPanel() {
  const isMac = useMemo(() => isMacPlatform(), []);

  return (
    <div className="settingsShortcutsPanel">
      <table className="settingsShortcutsTable">
        <thead>
          <tr>
            <th scope="col">功能</th>
            <th scope="col">快捷键</th>
          </tr>
        </thead>
        <tbody>
          {KEYBOARD_SHORTCUTS.map((entry) => (
            <tr key={entry.action}>
              <td className="settingsShortcutAction">{entry.action}</td>
              <td className="settingsShortcutKeyCell">
                <ShortcutKeys parts={isMac ? entry.mac : entry.win} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
