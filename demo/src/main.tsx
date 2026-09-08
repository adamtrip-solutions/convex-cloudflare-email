import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SessionProvider } from "convex-helpers/react/sessions";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fallback">
        <h1>The demo couldn’t load.</h1>
        <p>Check your connection and allow session storage, then reload.</p>
        <button onClick={() => location.reload()}>Reload demo</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const url = import.meta.env.VITE_CONVEX_URL;
if (!url) throw new Error("VITE_CONVEX_URL must be configured at build time");
const client = new ConvexReactClient(url);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexProvider client={client}>
        <SessionProvider storageKey="cloudflare-email-demo-session">
          <App />
        </SessionProvider>
      </ConvexProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
