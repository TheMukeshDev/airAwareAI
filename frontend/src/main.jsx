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
              background: "#0d1824",
              color: "#e6eef5",
              border: "1px solid #17242f",
              fontSize: "13px",
              borderRadius: "12px",
              boxShadow: "0 20px 50px -24px rgba(0,0,0,0.9)",
            },
            success: { iconTheme: { primary: "#3fe0ac", secondary: "#050a10" } },
            error: { iconTheme: { primary: "#f87171", secondary: "#050a10" } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
