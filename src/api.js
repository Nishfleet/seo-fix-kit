export class ApiError extends Error {
  constructor(message, { status = 0, payload = {} } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildInit({ method, body, headers, signal, credentials = "same-origin", keepalive }) {
  const hasBody = body !== undefined;
  const init = {
    method: method || (hasBody ? "POST" : "GET"),
    credentials,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : { accept: "application/json" }),
      ...(headers || {})
    }
  };
  if (hasBody) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;
  if (keepalive) init.keepalive = true;
  return init;
}

export async function apiRequest(path, options = {}) {
  const init = options.init
    ? { ...options.init, ...(options.signal ? { signal: options.signal } : {}) }
    : buildInit(options);
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  return { response, payload, ok: response.ok, status: response.status };
}

export async function apiFetch(path, options = {}) {
  const { fallbackError = "Request failed.", errorKeys = ["error"], requireOkFlag = true } = options;
  const { response, payload } = await apiRequest(path, options);
  if (!response.ok || (requireOkFlag && payload.ok !== true)) {
    throw new ApiError(apiErrorMessage(payload, fallbackError, errorKeys), {
      status: response.status,
      payload
    });
  }
  return payload;
}

export function apiErrorMessage(payload, fallbackError, errorKeys = ["error"]) {
  for (const key of errorKeys) {
    if (payload && payload[key]) return payload[key];
  }
  return fallbackError;
}

export function isAbortError(error) {
  return Boolean(error) && error.name === "AbortError";
}
