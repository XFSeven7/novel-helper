import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppDialogHost } from "./AppDialogHost";
import { registerAppDialog } from "./dialog";
import type { ActiveAppDialog, AppAlertOptions, AppConfirmOptions } from "./types";

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<ActiveAppDialog | null>(null);
  const resolverRef = useRef<((value: boolean | void) => void) | null>(null);

  const finish = useCallback((value: boolean | void) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const alert = useCallback(
    (opts: AppAlertOptions) =>
      new Promise<void>((resolve) => {
        resolverRef.current = () => resolve();
        setDialog({ kind: "alert", opts });
      }),
    []
  );

  const confirm = useCallback(
    (opts: AppConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = (v) => resolve(Boolean(v));
        setDialog({ kind: "confirm", opts });
      }),
    []
  );

  useEffect(() => {
    registerAppDialog({ alert, confirm });
    return () => registerAppDialog(null);
  }, [alert, confirm]);

  return (
    <>
      {children}
      {createPortal(
        <AppDialogHost
          dialog={dialog}
          onAlertClose={() => finish()}
          onConfirmClose={(ok) => finish(ok)}
        />,
        document.body
      )}
    </>
  );
}
