"use client";
import { useState } from "react";

export default function ReplayEditModal({ event, onClose }) {
  const [payload, setPayload] = useState(
    JSON.stringify(event?.detail || event || {}, null, 2)
  );
  const [status, setStatus] = useState(null);

  async function handlePush() {
    try {
      const parsed = JSON.parse(payload);
      const currentAttempt = event?.detail?.attempt || 1;
      const traceId = event?.id || event?.detail?.traceId;

      const res = await fetch("http://localhost:4000/resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "vaportrace.resubmit",
          detailType: "Manual Resubmit",
          detail: {
            ...parsed,
            attempt: currentAttempt + 1,
            replayOf: traceId,
          },
        }),
      });
      if (!res.ok) throw new Error("Resubmit failed");
      setStatus("success");

      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[600px]">
        <h2 className="text-lg font-bold mb-3">Edit & Resubmit Payload</h2>
        <textarea
          className="w-full h-64 bg-black text-green-300 font-mono text-xs p-3 rounded border border-gray-700"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
        />
        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-gray-400">{status}</span>
          <div className="space-x-2">
            <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-700 rounded">
              Cancel
            </button>
            <button
              onClick={handlePush}
              className="px-3 py-1 text-sm bg-cyan-600 rounded hover:bg-cyan-500"
            >
              Push to Cloud
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}