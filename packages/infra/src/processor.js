const { IoTDataPlaneClient, PublishCommand } = require("@aws-sdk/client-iot-data-plane");
const iotClient = new IoTDataPlaneClient({});
const TOPIC_PREFIX = process.env.IOT_TOPIC_PREFIX || "vaportrace/events";

async function reportSpan(span) {
  await iotClient.send(
    new PublishCommand({
      topic: `${TOPIC_PREFIX}/span`,
      payload: Buffer.from(JSON.stringify({ "detail-type": "Span Report", source: "vaportrace.tracer", detail: span })),
      qos: 0,
    })
  );
}

exports.handler = async (event, context) => {
  const startTime = new Date().toISOString();
  const start = Date.now();
  const detail = event.detail || {};
  let status = "ok";
  let error = null;
  let resultMessage = "";

  try {
    const normalizedPostalCode = detail.postalCode.trim().toUpperCase();
    resultMessage = `Processed order ${detail.orderId} for postal code ${normalizedPostalCode}`;
  } catch (err) {
    status = "error";
    error = { message: err.message, stack: err.stack };
    resultMessage = `Processor failed: ${err.message}`;
    console.error("Processor error:", err);
  }

  const span = {
    traceId: event.id,                       // <-- the free correlation ID
    spanId: context.awsRequestId,
    service: "ProcessorLambda",
    startTime,
    endTime: new Date().toISOString(),
    durationMs: Date.now() - start,
    status,
    error,
    attributes: {
      orderId: detail.orderId,
      postalCode: detail.postalCode,
      sourceKey: detail.object?.key,
      resultMessage,
    },
    attempt: detail.attempt || 1,
    replayOf: detail.replayOf || null,
  };

  await reportSpan(span).catch((e) => console.error("Span report failed:", e));

  return span;
};