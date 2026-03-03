// @ts-nocheck
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppQueryProvider } from "./lib/queryClient";
import "./styles/index.css";
import ToastProvider from "./components/ToastProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppQueryProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppQueryProvider>
    </BrowserRouter>
  </React.StrictMode>
);
