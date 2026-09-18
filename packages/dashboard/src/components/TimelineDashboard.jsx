"use client";

import { useEffect, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import ReplayEditModal from "@/components/ReplayEditModal";

const initialNodes = [
  { id: "s3", position: { x: 50, y: 75 }, data: { label: "S3 Bucket" }, type: "input", className: "bg-gray-800 text-gray-200 border border-gray-600 rounded-md shadow-md w-40 text-center py-3" },
  { id: "eb", position: { x: 300, y: 75 }, data: { label: "EventBridge Bus" }, className: "bg-gray-800 text-gray-200 border border-gray-600 rounded-md shadow-md w-40 text-center py-3" },
  { id: "lambda", position: { x: 550, y: 75 }, data: { label: "Forwarder Lambda" }, className: "bg-gray-800 text-gray-200 border border-gray-600 rounded-md shadow-md w-40 text-center py-3" },
  { id: "iot", position: { x: 800, y: 75 }, data: { label: "IoT Core" }, className: "bg-gray-800 text-gray-200 border border-gray-600 rounded-md shadow-md w-40 text-center py-3" },
  { id: "dash", position: { x: 1050, y: 75 }, data: { label: "Dashboard (you)" }, type: "output", className: "bg-cyan-400 text-gray-900 border-none font-bold rounded-md shadow-[0_0_15px_rgba(34,211,238,0.4)] w-40 text-center py-3" },
];

const initialEdges = [
  { id: "e1", source: "s3", target: "eb", type: "smoothstep", style: { stroke: "#4B5563", strokeWidth: 1.5 } },
  { id: "e2", source: "eb", target: "lambda", type: "smoothstep", style: { stroke: "#4B5563", strokeWidth: 1.5 } },
  { id: "e3", source: "lambda", target: "iot", type: "smoothstep", style: { stroke: "#4B5563", strokeWidth: 1.5 } },
  { id: "e4", source: "iot", target: "dash", type: "smoothstep", animated: true, style: { stroke: "#22D3EE", strokeWidth: 2, strokeDasharray: "5,5" } },
];

export default function TimelineDashboard() {
  const [events, setEvents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [edges, setEdges] = useState(initialEdges);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource("http://localhost:4000/stream");

    eventSource.onopen = () => setIsConnected(true);

    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data);
      setEvents((prev) => [parsedData, ...prev]);

      setEdges((eds) =>
        eds.map((e) => ({ ...e, animated: true, style: { stroke: "#22D3EE", strokeWidth: 2 } }))
      );
      setTimeout(() => setEdges(initialEdges), 2000);
    };

    eventSource.onerror = () => setIsConnected(false);

    return () => eventSource.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#050B14] text-gray-300 font-sans p-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white tracking-wide">VaporTrace — Live Timeline</h1>
        <div className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-2 border ${isConnected ? "bg-green-900/30 text-green-500 border-green-800" : "bg-red-900/30 text-red-500 border-red-800"}`}>
          <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
          {isConnected ? "connected" : "disconnected"}
        </div>
      </header>

      <div className="h-64 w-full bg-[#0A101C] border border-gray-800 rounded-lg shadow-lg mb-8 overflow-hidden relative">
        <ReactFlow nodes={initialNodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background color="#1f2937" gap={20} size={1} />
          <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
        </ReactFlow>
      </div>

      <div className="space-y-6">
        {events.length === 0 ? (
          <div className="text-center p-12 bg-[#0A101C] border border-gray-800 rounded-lg text-gray-500">
            Waiting for architecture events. Upload a file to S3 to begin tracing...
          </div>
        ) : (
          events.map((evt, idx) => (
            <div key={idx} className="bg-[#0A101C] border border-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800/60 bg-[#0E1524]">
                <div className="text-cyan-500 font-mono text-sm tracking-wide">
                  {evt["detail-type"] || evt.detailType || "event"}
                </div>
                <button
                  onClick={() => setEditing(evt)}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded flex items-center gap-2 transition-colors"
                >
                  ↺ Replay / Edit
                </button>
              </div>
              <div className="p-6 overflow-x-auto">
                <pre className="text-gray-300 text-sm font-mono leading-relaxed">
                  {JSON.stringify(evt, null, 2)}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && <ReplayEditModal event={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}