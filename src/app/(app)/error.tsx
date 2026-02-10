"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="space-y-4 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-red-600">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              An unexpected error occurred while rendering this page.
            </p>
          </div>

          {process.env.NODE_ENV === "development" && (
            <div className="rounded-md bg-muted p-4 text-left">
              <p className="text-sm font-mono text-destructive">
                {error.message}
              </p>
              {error.digest && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              onClick={reset}
              className="w-full sm:w-auto"
            >
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/expenses"}
              className="w-full sm:w-auto"
            >
              Go to expenses
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
