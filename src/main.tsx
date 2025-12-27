import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./web/index.css";
import App from "./web/App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
