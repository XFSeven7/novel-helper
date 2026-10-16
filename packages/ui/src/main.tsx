import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import { AppDialogProvider } from "./ui/dialog/AppDialogProvider";
import { UiPrefsProvider } from "./ui/uiPrefs/UiPrefsContext";
import "./ui/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppDialogProvider>
      <UiPrefsProvider>
        <App />
      </UiPrefsProvider>
    </AppDialogProvider>
  </React.StrictMode>
);

