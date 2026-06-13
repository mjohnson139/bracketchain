import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./context.tsx";
import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
