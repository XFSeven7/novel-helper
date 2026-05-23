export type AppAlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
};

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

export type ActiveAppDialog =
  | { kind: "alert"; opts: AppAlertOptions }
  | { kind: "confirm"; opts: AppConfirmOptions };

export type AppDialogApi = {
  alert: (opts: AppAlertOptions) => Promise<void>;
  confirm: (opts: AppConfirmOptions) => Promise<boolean>;
};
