"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              padding: "1.5rem",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              backgroundColor: "#ffffff",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: "#dc2626",
                  marginBottom: "0.5rem",
                }}
              >
                Critical Error
              </h1>
              <p
                style={{
                  color: "#6b7280",
                  marginBottom: "1.5rem",
                }}
              >
                A critical error occurred. Please try reloading the page.
              </p>

              {process.env.NODE_ENV === "development" && (
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "#f3f4f6",
                    borderRadius: "0.375rem",
                    marginBottom: "1.5rem",
                    textAlign: "left",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.875rem",
                      fontFamily: "monospace",
                      color: "#dc2626",
                    }}
                  >
                    {error.message}
                  </p>
                  {error.digest && (
                    <p
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.75rem",
                        color: "#9ca3af",
                      }}
                    >
                      Error ID: {error.digest}
                    </p>
                  )}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <button
                  onClick={reset}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#3b82f6",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                >
                  Try again
                </button>
                <button
                  onClick={() => window.location.href = "/"}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#ffffff",
                    color: "#374151",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                >
                  Go to home
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
