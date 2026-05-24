export function isAltEnter(e: KeyboardEvent): boolean {
  if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return false;
  return e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter";
}

export function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

export async function toggleDocumentFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  if (getFullscreenElement()) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (doc.webkitExitFullscreen) await Promise.resolve(doc.webkitExitFullscreen());
    else if (doc.mozCancelFullScreen) await Promise.resolve(doc.mozCancelFullScreen());
    else if (doc.msExitFullscreen) await Promise.resolve(doc.msExitFullscreen());
    return;
  }

  if (root.requestFullscreen) await root.requestFullscreen();
  else if (root.webkitRequestFullscreen) await Promise.resolve(root.webkitRequestFullscreen());
  else if (root.mozRequestFullScreen) await Promise.resolve(root.mozRequestFullScreen());
  else if (root.msRequestFullscreen) await Promise.resolve(root.msRequestFullscreen());
}
