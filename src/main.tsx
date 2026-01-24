import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import './styles/unified-styles.css';
import './styles/component-specific.css';
import { App } from "./App.tsx";
import { AlertProvider } from "./contexts/AlertContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AlertProvider>
      <App />
    </AlertProvider>
  </StrictMode>
);
