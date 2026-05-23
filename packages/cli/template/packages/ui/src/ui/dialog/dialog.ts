import type { AppAlertOptions, AppConfirmOptions, AppDialogApi } from "./types";

let dialogApi: AppDialogApi | null = null;

export function registerAppDialog(api: AppDialogApi | null) {
  dialogApi = api;
}

export function appAlert(opts: AppAlertOptions): Promise<void> {
  if (!dialogApi) {
    return Promise.reject(new Error("AppDialogProvider 未挂载，无法显示提示框"));
  }
  return dialogApi.alert(opts);
}

export function appConfirm(opts: AppConfirmOptions): Promise<boolean> {
  if (!dialogApi) {
    return Promise.reject(new Error("AppDialogProvider 未挂载，无法显示确认框"));
  }
  return dialogApi.confirm(opts);
}
