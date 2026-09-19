"use client";

import { useEffect, useState, useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import ReplayEditModal from "@/components/ReplayEditModal";

// 1. Virtual Span Generator (Explicitly tagged as inferred)
function generateVirtualSpans(awsEvent) {
  const spans = [];
  const traceId = awsEvent.id;

  if (!traceId || awsEvent["detail-type"] === "Span Report") return spans;

  const eventTime = new Date(awsEvent.time || Date.now()).getTime();

  if (awsEvent.source === "aws.s3") {
    spans.push({
      spanId: `s3-${traceId}`,
      service: "Amazon S3",
      startTime: new Date(eventTime - 60).toISOString(),
      durationMs: 40,
      status: "ok",
      inferred: true,
      attributes: { bucket: awsEvent.detail?.bucket?.name, key: awsEvent.detail?.object?.key, region: awsEvent.region }
    });
  } else if (awsEvent.source === "vaportrace.resubmit") {
    spans.push({
      spanId: `client-${traceId}`,
      service: "VaporTrace Client",
      startTime: new Date(eventTime - 30).toISOString(),
      durationMs: 25,
      status: "ok",
      inferred: true,
      attributes: { attempt: awsEvent.detail?.attempt, replayOf: awsEvent.detail?.replayOf }
    });
  }

  if (awsEvent.source) {
    spans.push({
      spanId: `eb-${traceId}`,
      service: "Amazon EventBridge",
      startTime: new Date(eventTime).toISOString(),
      durationMs: 85,
      status: "ok",
      inferred: true,
      attributes: { ruleMatch: awsEvent["detail-type"], account: awsEvent.account }
    });
  }

  return spans;
}

export default function TimelineDashboard() {
  const [traces, setTraces] = useState({});
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [editing, setEditing] = useState(null);
  const [verifiedTraceIds, setVerifiedTraceIds] = useState(new Set()); // NEW

  // 2. Ingest & Group Spans (Strict Immutability)
  useEffect(() => {
    const eventSource = new EventSource("http://localhost:4000/stream");
    eventSource.onopen = () => setIsConnected(true);

    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data);
      if (parsedData.type === "service-graph-update") return;

      // NEW — handle real X-Ray verification broadcasts from the CLI
      if (parsedData.type === "xray-verification-update") {
        setVerifiedTraceIds((prev) => {
          const next = new Set(prev);
          (parsedData.verifiedTraceIds || []).forEach((id) => next.add(id));
          return next;
        });
        return;
      }

      const traceId = parsedData.detail?.traceId || parsedData.id;
      if (!traceId) return;

      setTraces((prev) => {
        const existingTrace = prev[traceId] || { spans: [], hasError: false, maxAttempt: 1, rawEvent: null };

        const isSpanReport = parsedData["detail-type"] === "Span Report";
        const newRawEvent = isSpanReport ? existingTrace.rawEvent : parsedData;
        const incomingSpans = isSpanReport ? [parsedData.detail] : generateVirtualSpans(parsedData);

        const newUniqueSpans = incomingSpans.filter(
          (incSpan) => !existingTrace.spans.some((exSpan) => exSpan.spanId === incSpan.spanId)
        );

        if (newUniqueSpans.length === 0 && newRawEvent === existingTrace.rawEvent) {
          return prev;
        }

        const updatedSpans = [...existingTrace.spans, ...newUniqueSpans];
        const hasError = updatedSpans.some((s) => s.status === "error");
        const maxAttempt = Math.max(
          existingTrace.maxAttempt,
          ...updatedSpans.map((s) => s.attempt || s.attributes?.attempt || 1)
        );

        return {
          ...prev,
          [traceId]: {
            spans: updatedSpans,
            hasError,
            maxAttempt,
            rawEvent: newRawEvent,
            lastUpdated: Date.now()
          },
        };
      });

      setSelectedTraceId((prev) => prev || traceId);
    };

    eventSource.onerror = () => setIsConnected(false);
    return () => eventSource.close();
  }, []);

  // 3. Dynamically Generate ReactFlow Nodes & Edges
  const activeTrace = traces[selectedTraceId];

  const { nodes, edges } = useMemo(() => {
    if (!activeTrace || activeTrace.spans.length === 0) return { nodes: [], edges: [] };

    const sortedSpans = [...activeTrace.spans].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const nodes = sortedSpans.map((span, index) => {
      const isError = span.status === "error";
      const isSelected = selectedSpan?.spanId === span.spanId;

      return {
        id: span.spanId,
        position: { x: index * 250 + 50, y: 100 },
        data: {
          label: (
            <div className="flex flex-col items-center">
              <span className="font-bold text-sm tracking-wide">
                {span.service}
              </span>
              {span.inferred && <span className="text-[9px] opacity-60 uppercase tracking-widest mt-0.5 font-semibold text-amber-200/80">Estimated</span>}
              <span className="text-[10px] mt-1 opacity-70 font-mono">{span.durationMs} ms</span>
            </div>
          )
        },
        className: `border-2 transition-all ${
          isError ? "border-red-500 bg-red-950/80 text-red-200" : "border-cyan-500 bg-cyan-950/80 text-cyan-200"
        } ${isSelected ? "ring-4 ring-white/20 shadow-[0_0_15px_rgba(255,255,255,0.2)]" : "shadow-lg"} rounded-lg p-3 min-w-[160px] cursor-pointer`
      };
    });

    const edges = [];
    for (let i = 0; i < sortedSpans.length - 1; i++) {
      const current = sortedSpans[i];
      const next = sortedSpans[i + 1];
      edges.push({
        id: `e-${current.spanId}-${next.spanId}`,
        source: current.spanId,
        target: next.spanId,
        type: "smoothstep",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: next.status === "error" ? "#ef4444" : "#22d3ee" },
        style: { stroke: next.status === "error" ? "#ef4444" : "#22d3ee", strokeWidth: 2 }
      });
    }

    return { nodes, edges };
  }, [activeTrace, selectedSpan]);

  return (
    <div className="min-h-screen bg-[#050B14] text-gray-300 font-sans p-8 flex flex-col">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">VaporTrace — Distributed Tracing</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time architecture mapping</p>
        </div>
        <div className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-2 border ${isConnected ? "bg-green-900/30 text-green-500 border-green-800" : "bg-red-900/30 text-red-500 border-red-800"}`}>
          <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
          {isConnected ? "Tunnel Active" : "Disconnected"}
        </div>
      </header>

      <div className="flex gap-6 flex-1 min-h-0 h-[800px]">
        {/* Left Panel: Trace List */}
        <div className="w-1/3 bg-[#0A101C] border border-gray-800 rounded-lg shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-[#0E1524] font-semibold text-gray-300">Recent Traces</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {Object.keys(traces).length === 0 ? (
              <div className="text-center text-sm text-gray-600 mt-10">Awaiting execution data...</div>
            ) : (
              Object.entries(traces)
                .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated)
                .map(([id, trace]) => {
                  const isVerified = verifiedTraceIds.has(id); // NEW
                  return (
                    <div
                      key={id}
                      onClick={() => { setSelectedTraceId(id); setSelectedSpan(null); }}
                      className={`p-4 rounded-md cursor-pointer border transition-colors ${
                        selectedTraceId === id ? "bg-gray-800/50 border-cyan-500/50" : "bg-transparent border-transparent hover:bg-gray-900"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-mono text-gray-400 truncate w-48">{id}</span>
                        {isVerified ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/50">
                            ✓ Verified in X-Ray
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                            ⏳ Awaiting X-Ray
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <span className={`text-sm font-bold ${trace.hasError ? "text-red-400" : "text-green-400"}`}>{trace.hasError ? "Failed" : "Resolved"}</span>
                          <span className="text-sm text-gray-500">— {trace.maxAttempt} attempt(s)</span>
                        </div>
                        <span className="text-xs font-mono text-gray-500">{trace.spans.length} spans</span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Right Panel: Dynamic Flow Graph & Span Details */}
        <div className="w-2/3 flex flex-col gap-6">
          <div className="flex-1 bg-[#0A101C] border border-gray-800 rounded-lg shadow-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-800 bg-[#0E1524] flex justify-between items-center">
              <span className="font-semibold text-gray-300">Service Map</span>
              {activeTrace && activeTrace.rawEvent && (
                <button
                  onClick={() => setEditing(activeTrace.rawEvent)}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors"
                >
                  ↺ Replay / Edit Trace
                </button>
              )}
            </div>

            <div className="flex-1 relative">
              {!activeTrace || activeTrace.spans.length === 0 ? (
                <div className="text-center text-sm text-gray-600 mt-20">Select a trace to view its flow</div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodeClick={(event, node) => {
                    const span = activeTrace?.spans.find(s => s.spanId === node.id);
                    if (span) setSelectedSpan(span);
                  }}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#1f2937" gap={20} size={1} />
                  <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
                </ReactFlow>
              )}
            </div>
          </div>

          <div className="h-64 bg-[#0A101C] border border-gray-800 rounded-lg shadow-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800 bg-[#0E1524] font-semibold text-sm text-gray-300 flex justify-between items-center">
              <span>Span Inspector</span>
              {selectedSpan?.inferred && (
                <span className="text-xs text-amber-500/80 font-normal">
                  ⚠️ Timing estimated from event metadata — not a measured span
                </span>
              )}
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-black/40">
              {!selectedSpan ? (
                <div className="text-center text-sm text-gray-600 mt-10">Click a node in the graph to inspect attributes and errors.</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 border-b border-gray-800 pb-4">
                    <div>
                      <div className="text-[10px] uppercase text-gray-500 mb-1">Service</div>
                      <div className="text-sm text-cyan-400 font-mono">{selectedSpan.service}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-gray-500 mb-1">Duration</div>
                      <div className="text-sm text-gray-300 font-mono">{selectedSpan.durationMs} ms</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-gray-500 mb-1">Status</div>
                      <div className={`text-sm font-mono ${selectedSpan.status === "error" ? "text-red-400" : "text-green-400"}`}>
                        {selectedSpan.status.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  {selectedSpan.error && (
                    <div className="bg-red-950/30 border border-red-900/50 p-3 rounded text-red-400">
                      <div className="font-bold text-sm mb-1">{selectedSpan.error.message}</div>
                      <pre className="text-xs font-mono overflow-x-auto text-red-300/70">{selectedSpan.error.stack}</pre>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 mb-2">Attributes</div>
                    <pre className="text-xs font-mono text-gray-400 bg-[#0A101C] p-3 rounded border border-gray-800 overflow-x-auto">
                      {JSON.stringify(selectedSpan.attributes, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {editing && <ReplayEditModal event={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}