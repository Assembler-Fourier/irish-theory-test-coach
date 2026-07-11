export function createApiClient(fetchImpl = window.fetch.bind(window)) {
  return {
    async startStudySession(payload) {
      return jsonRequest(fetchImpl, "/api/v1/study-sessions", {
        method: "POST",
        body: payload,
      });
    },
    async getStudySession(sessionId) {
      return jsonRequest(fetchImpl, `/api/v1/study-sessions/${encodeURIComponent(sessionId)}`);
    },
    async submitAnswer(sessionId, payload) {
      return jsonRequest(fetchImpl, `/api/v1/study-sessions/${encodeURIComponent(sessionId)}/answers`, {
        method: "POST",
        body: payload,
      });
    },
    async flagQuestion(sessionId, payload) {
      return jsonRequest(fetchImpl, `/api/v1/study-sessions/${encodeURIComponent(sessionId)}/flags`, {
        method: "POST",
        body: payload,
      });
    },
    async completeStudySession(sessionId, payload) {
      return jsonRequest(fetchImpl, `/api/v1/study-sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: "POST",
        body: payload,
      });
    },
  };
}

async function jsonRequest(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
