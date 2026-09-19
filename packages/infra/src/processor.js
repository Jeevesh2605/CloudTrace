const { reportSpan, annotateXRaySegment } = require("./vaportrace-sdk");

exports.handler = async (event, context) => {
  const startTime = new Date().toISOString();
  const start = Date.now();

  annotateXRaySegment(event.id);

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
    traceId: event.id,
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

  await reportSpan(span);

  return span;
};