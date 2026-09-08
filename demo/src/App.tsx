import { useState } from "react";
import { useConvexConnectionState } from "convex/react";
import { ConvexError } from "convex/values";
import {
  useSessionMutation,
  useSessionQuery,
} from "convex-helpers/react/sessions";
import { api } from "../convex/_generated/api";

const repository =
  "https://github.com/adamtrip-solutions/convex-cloudflare-email";
const install = "npm i convex-cloudflare-email@beta";
const snippet = `import { CloudflareEmail } from "convex-cloudflare-email";
import { components } from "./_generated/api";

const email = new CloudflareEmail(components.cloudflareEmail, {
  testMode: true,
});

// Inside your Convex mutation:
const id = await email.sendEmail(ctx, {
  from: "hello@example.com",
  to: "visitor@example.net",
  subject: "Hello from Convex",
  text: "Your welcome email is queued.",
  idempotencyKey: "welcome:visitor-123",
});

// Repeating the same payload and key returns the same id.`;

function Icon({ kind }: { kind: "mail" | "copy" | "arrow" | "check" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "mail" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </>
      ) : kind === "copy" ? (
        <>
          <rect x="8" y="8" width="12" height="13" rx="2" />
          <path d="M16 8V3H3v13h5" />
        </>
      ) : kind === "check" ? (
        <path d="m5 12 4 4L19 6" />
      ) : (
        <>
          <path d="M4 12h16M14 6l6 6-6 6" />
        </>
      )}
    </svg>
  );
}
function CopyButton({ text, label }: { text: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Copied");
    } catch {
      setFeedback("Select the text to copy");
    }
  }
  return (
    <button
      className="copy-button"
      onClick={copy}
      aria-label={feedback || label}
    >
      <Icon kind={feedback === "Copied" ? "check" : "copy"} />
      <span aria-live="polite">{feedback || label}</span>
    </button>
  );
}
function errorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    if (typeof error.data === "string") return error.data;
    const data = error.data as { retryAfter?: number } | null;
    if (typeof data?.retryAfter === "number")
      return `The demo usage limit has been reached. Try again in ${Math.max(1, Math.ceil(data.retryAfter / 60000))} minute(s).`;
  }
  return "The request couldn’t complete. Check your connection, then retry this same example.";
}
export default function App() {
  const history = useSessionQuery(api.demo.history, {});
  const send = useSessionMutation(api.demo.send);
  const connection = useConvexConnectionState();
  const [requestKey, setRequestKey] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    emailId: string;
    duplicate: boolean;
    submissions: number;
  } | null>(null);
  const current = history?.find((row) => row.requestKey === requestKey);
  const status = current?.status?.status;
  const connected = connection.isWebSocketConnected;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      setReceipt(await send({ requestKey }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setRequestKey(crypto.randomUUID());
    setReceipt(null);
    setError("");
  }
  const submitted = Boolean(current || receipt);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Cloudflare Email demo home">
          <span className="brand-icon">
            <Icon kind="mail" />
          </span>
          <span>
            Cloudflare Email <span className="brand-divider">/</span>{" "}
            <strong>Convex</strong>
          </span>
        </a>
        <nav aria-label="Project links">
          <a href={`${repository}#readme`}>Docs</a>
          <a href={repository}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <a
            className="version"
            href="https://www.npmjs.com/package/convex-cloudflare-email"
          >
            v0.1.0-beta.0
          </a>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">INTERACTIVE COMPONENT DEMO</p>
            <h1>One request. One email.</h1>
            <p className="intro-copy">
              Queue an email from Convex. Repeat the request.
              <br className="desktop-break" /> See deduplication work, live.
            </p>
          </div>
          <div className="install">
            <span className="install-label">TRY IT IN YOUR APP</span>
            <div>
              <code>{install}</code>
              <CopyButton text={install} label="Copy install command" />
            </div>
          </div>
        </section>
        <div className="mode-notice">
          <span className="mode-badge">TEST MODE</span>
          <p>
            Real Convex component. Simulated email delivery. No email is sent,
            and no address is collected.
          </p>
        </div>
        <section className="workspace" aria-label="Email playground">
          <div className="compose panel">
            <div className="panel-heading">
              <h2>
                <span className="step">01</span> Send an example
              </h2>
              <span className="muted">Preset message</span>
            </div>
            <div className="email-fields">
              <div>
                <span>From</span>
                <span>
                  Cloudflare Email Demo <small>&lt;hello@example.com&gt;</small>
                </span>
              </div>
              <div>
                <span>To</span>
                <span>visitor@example.net</span>
              </div>
              <div>
                <span>Subject</span>
                <strong>Hello from Convex</strong>
              </div>
            </div>
            <div className="message">
              <span className="message-label">PLAIN TEXT</span>
              <p>Your welcome email is queued.</p>
              <p>This is a test-mode example; no email leaves the component.</p>
            </div>
            <div className="compose-actions">
              <button
                className="primary"
                onClick={submit}
                disabled={busy || !connected || history === undefined}
              >
                {busy
                  ? "Sending request…"
                  : submitted
                    ? "Send the same request again"
                    : "Send test email"}
                <Icon kind="arrow" />
              </button>
              <button
                className="secondary"
                onClick={reset}
                disabled={busy || !submitted}
              >
                New example
              </button>
              <p>
                Repeat uses the same key. New example generates a fresh one.
              </p>
            </div>
          </div>
          <div className="result panel" aria-live="polite" aria-busy={busy}>
            <div className="panel-heading">
              <h2>
                <span className="step">02</span> Watch the result
              </h2>
              <span className={`connection ${connected ? "online" : ""}`}>
                <i />
                {connected ? "Live" : "Connecting"}
              </span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!submitted ? (
              <div className="empty-result">
                <span className="empty-symbol">
                  <Icon kind="mail" />
                </span>
                <h3>
                  {history === undefined
                    ? "Connecting to Convex…"
                    : "Ready when you are"}
                </h3>
                <p>
                  Send the example to see its email ID,
                  <br /> status, and request count here.
                </p>
              </div>
            ) : (
              <div className="result-content">
                <div className="status-line">
                  <span
                    className={`status-pill ${status === "test" ? "success" : ""}`}
                  >
                    {status ?? "Awaiting status"}
                  </span>
                  <span className="muted">
                    {status === "test"
                      ? "Simulated send completed"
                      : "Reported by the component"}
                  </span>
                </div>
                <dl className="result-details">
                  <div>
                    <dt>Email ID</dt>
                    <dd className="mono">
                      {current?.emailId ?? receipt?.emailId}
                    </dd>
                  </div>
                  <div>
                    <dt>Idempotency key</dt>
                    <dd className="mono">
                      {requestKey}
                      <span className="detail-hint">
                        Namespaced to your session on the server
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="metrics">
                  <div>
                    <strong>
                      {current?.submissions ?? receipt?.submissions ?? 1}
                    </strong>
                    <span>Requests submitted</span>
                  </div>
                  <div>
                    <strong>1</strong>
                    <span>Unique email</span>
                  </div>
                  <div>
                    <strong>{current?.status?.attempts ?? "—"}</strong>
                    <span>Send attempts</span>
                  </div>
                </div>
                {receipt?.duplicate ? (
                  <div className="dedup-result">
                    <Icon kind="check" />
                    <div>
                      <strong>Same ID. No second email.</strong>
                      <p>
                        The component returned the original email ID for the
                        repeated request.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="result-tip">
                    Now send the same request again. The email ID should stay
                    the same.
                  </p>
                )}
              </div>
            )}
            <div className="result-footnote">
              Statuses come directly from Convex. Fast sends may finish before
              you see a pending state.
            </div>
          </div>
        </section>
        <section className="bottom-grid">
          <div className="code-panel">
            <div className="code-heading">
              <h2>The integration</h2>
              <CopyButton text={snippet} label="Copy code" />
            </div>
            <pre tabIndex={0} aria-label="Convex integration example">
              <code>{snippet}</code>
            </pre>
            <a className="code-footer" href={`${repository}/tree/main/demo`}>
              Explore the full demo source <Icon kind="arrow" />
            </a>
          </div>
          <div className="history-panel">
            <div className="history-heading">
              <h2>Your examples</h2>
              <span className="muted">This session only</span>
            </div>
            {history?.length ? (
              <ol className="history-list">
                {history.map((row, index) => (
                  <li key={row.emailId}>
                    <button
                      onClick={() => {
                        setRequestKey(row.requestKey);
                        setReceipt(null);
                        setError("");
                      }}
                      disabled={busy}
                      aria-current={
                        row.requestKey === requestKey ? "true" : undefined
                      }
                    >
                      <div>
                        <span className="history-number">
                          {String(history.length - index).padStart(2, "0")}
                        </span>
                        <span>
                          <strong>Hello from Convex</strong>
                          <small>
                            {row.submissions} request
                            {row.submissions !== 1 ? "s" : ""} ·{" "}
                            {row.emailId.slice(0, 8)}…
                          </small>
                        </span>
                      </div>
                      <span className="history-status">
                        {row.status?.status ?? "expired"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="history-empty">
                Your latest eight examples will appear here.
              </p>
            )}
            <div className="privacy-note">
              <h3>A small, bounded playground</h3>
              <p>
                Up to 20 requests per session per 10 minutes, with a shared
                daily limit. Records become eligible for cleanup after 24 hours.
              </p>
              <p>
                Test status demonstrates queue execution, not inbox delivery.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>Cloudflare Email for Convex · Community component</span>
        <span>
          Open source · MIT <span className="footer-dot">/</span>{" "}
          <a href={`${repository}/issues`}>Report an issue ↗</a>
        </span>
      </footer>
    </>
  );
}
