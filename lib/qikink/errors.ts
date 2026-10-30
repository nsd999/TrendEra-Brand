import "server-only";

export class QikinkError extends Error {
  readonly code: string;
  readonly statusCode?: number;

  constructor(message: string, code = "QIKINK_ERROR", statusCode?: number) {
    // Sanitize message: never leak secrets, API keys, or raw bearer tokens
    const sanitized = message
      .replace(/([0-9a-f]{32,64})/gi, "[REDACTED]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]");
    super(sanitized);
    this.name = "QikinkError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class QikinkAuthError extends QikinkError {
  constructor(message: string, statusCode = 401) {
    super(message, "QIKINK_AUTH_ERROR", statusCode);
    this.name = "QikinkAuthError";
  }
}

export class QikinkValidationError extends QikinkError {
  constructor(message: string) {
    super(message, "QIKINK_VALIDATION_ERROR", 400);
    this.name = "QikinkValidationError";
  }
}

export class QikinkOrderError extends QikinkError {
  constructor(message: string, statusCode = 502) {
    super(message, "QIKINK_ORDER_ERROR", statusCode);
    this.name = "QikinkOrderError";
  }
}

export class QikinkRateLimitError extends QikinkError {
  constructor(message = "Qikink API rate limit reached. Please wait before retrying.") {
    super(message, "QIKINK_RATE_LIMIT_ERROR", 429);
    this.name = "QikinkRateLimitError";
  }
}
