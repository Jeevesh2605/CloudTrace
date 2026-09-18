import { useEffect, useState } from "react";

export function useEventStream(streamUrl = "http://localhost:4000/stream") {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(streamUrl);

    es.onopen = () => setConnected(true);

    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        setEvents((prev) => [parsed, ...prev]); // newest first
      } catch (err) {
        console.error("Failed to parse SSE payload:", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE connection error:", err);
      setConnected(false);
    };

    return () => es.close();
  }, [streamUrl]);

  return { events, connected };
}
