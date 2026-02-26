// Error handling utilities for consistent error messages

type ErrorType = "auth" | "validation" | "network" | "database" | "unknown"

interface AppError {
  type: ErrorType
  message: string
  originalError?: unknown
}

function handleSupabaseError(error: unknown): AppError {
  if (!error) {
    return {
      type: "unknown",
      message: "An unexpected error occurred",
      originalError: error,
    }
  }

  // Supabase errors have a specific structure
  if (typeof error === "object" && error !== null) {
    const err = error as { message?: string; code?: string; hint?: string }

    // Auth errors
    if (err.code === "PGRST301" || err.message?.includes("JWT")) {
      return {
        type: "auth",
        message: "Your session has expired. Please log in again.",
        originalError: error,
      }
    }

    // Row-level security errors
    if (err.code === "42501" || err.message?.includes("permission denied")) {
      return {
        type: "auth",
        message: "You don't have permission to perform this action.",
        originalError: error,
      }
    }

    // Foreign key constraint violations
    if (err.code === "23503" || err.message?.includes("foreign key")) {
      return {
        type: "validation",
        message: "Invalid reference. Please check your selections.",
        originalError: error,
      }
    }

    // Unique constraint violations
    if (err.code === "23505" || err.message?.includes("duplicate key")) {
      return {
        type: "validation",
        message: "This entry already exists.",
        originalError: error,
      }
    }

    // PostgREST single() errors — both 0 rows and multiple rows use PGRST116
    if (err.code === "PGRST116" || err.message?.includes("0 rows") || err.message?.includes("more than one row")) {
      const isMultiple = err.message?.includes("more than one row")
      return {
        type: "database",
        message: isMultiple
          ? "Multiple records found when expecting one."
          : "The requested data was not found.",
        originalError: error,
      }
    }

    // Network errors
    if (err.message?.includes("fetch") || err.message?.includes("network")) {
      return {
        type: "network",
        message: "Network error. Please check your connection and try again.",
        originalError: error,
      }
    }

    // Fallback for other database errors - use generic message for security
    if (err.message) {
      return {
        type: "database",
        message: "A database error occurred. Please try again or contact support if the issue persists.",
        originalError: error,
      }
    }
  }

  // Fallback for unknown error types
  return {
    type: "unknown",
    message: "An unexpected error occurred. Please try again.",
    originalError: error,
  }
}

/**
 * Logs error to console in development, could be extended to send to error tracking service
 */
function logError(error: AppError): void {
  if (process.env.NODE_ENV === "development") {
    console.error(`[${error.type.toUpperCase()}]`, error.message, error.originalError)
  }
  // In production, you could send to an error tracking service like Sentry
}

/**
 * Handles an error and returns a user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  const appError = handleSupabaseError(error)
  logError(appError)
  return appError.message
}
