export function createAnalyticsClient({ fetchImpl = window.fetch.bind(window), anonymousId }) {
  return {
    trackEvent(eventName, properties = {}) {
      return this.trackEvents([{ eventName, properties }]);
    },
    trackEvents(events) {
      const payload = {
        anonymousId,
        events: events.map((event) => ({
          eventName: event.eventName,
          properties: event.properties || {},
        })),
      };
      return fetchImpl("/api/events", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
  };
}
