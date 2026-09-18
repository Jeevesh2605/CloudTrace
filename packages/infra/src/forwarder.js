const { IoTDataPlaneClient, PublishCommand } = require("@aws-sdk/client-iot-data-plane");

const iotClient = new IoTDataPlaneClient({});
const TOPIC_PREFIX = process.env.IOT_TOPIC_PREFIX || "vaportrace/events";

// 1. The reusable span reporter function
async function reportSpan(span) {
  await iotClient.send(
    new PublishCommand({
      topic: `${TOPIC_PREFIX}/span`,
      payload: Buffer.from(JSON.stringify({ 
        "detail-type": "Span Report", 
        source: "vaportrace.tracer", 
        detail: span 
      })),
      qos: 0,
    })
  );
}

exports.handler = async (event, context) => {
  console.log("VaporTrace forwarder received event:", JSON.stringify(event, null, 2));

  // 2. Initialize tracing timers and status
  const startTime = new Date().toISOString();
  const start = Date.now();
  let status = "ok";
  let error = null;
  let resultMessage = "";
  
  const topic = `${TOPIC_PREFIX}/${event["detail-type"] || "unknown"}`;

  // 3. Core Forwarder Logic
  try {
    await iotClient.send(
      new PublishCommand({
        topic,
        payload: Buffer.from(JSON.stringify(event)),
        qos: 0,
      })
    );
    resultMessage = `Published event to IoT topic: ${topic}`;
  } catch (err) {
    status = "error";
    error = { message: err.message, stack: err.stack };
    resultMessage = `Forwarder failed: ${err.message}`;
    console.error("Failed to publish to IoT Core:", err);
  }

  // 4. Construct the Span for the Forwarder
  const span = {
    traceId: event.id,                       // Links this execution to the global event trace
    spanId: context.awsRequestId,            // Unique ID for this specific Lambda execution
    service: "ForwarderLambda",
    startTime,
    endTime: new Date().toISOString(),
    durationMs: Date.now() - start,
    status,
    error,
    attributes: {
      originalSource: event.source,
      originalDetailType: event["detail-type"],
      targetTopic: topic,
      resultMessage,
    },
    attempt: event.detail?.attempt || 1,
    // Catch EventBridge native replay names if present
    replayOf: event.detail?.replayOf || event["replay-name"] || null,
  };

  // 5. Fire the span report asynchronously
  await reportSpan(span).catch((e) => console.error("Span report failed:", e));

  return { statusCode: 200 };
};