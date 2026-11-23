import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#181d19",
              color: "#edf0e9",
              border: "1px solid #303934",
              fontSize: "12.5px",
              borderRadius: "10px",
              boxShadow: "0 18px 40px -24px rgba(0,0,0,0.95)",
            },
            success: { iconTheme: { primary: "#3fe0ac", secondary: "#050a10" } },
            error: { iconTheme: { primary: "#f87171", secondary: "#050a10" } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
