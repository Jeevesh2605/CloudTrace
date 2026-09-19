const { publishRawEvent, reportSpan, annotateXRaySegment } = require("./vaportrace-sdk");

exports.handler = async (event, context) => {
  const startTime = new Date().toISOString();
  const start = Date.now();

  annotateXRaySegment(event.id);

  let status = "ok";
  let error = null;

  try {
    console.log("VaporTrace forwarder received event:", JSON.stringify(event));
    await publishRawEvent(event);
  } catch (err) {
    status = "error";
    error = { message: err.message, stack: err.stack };
    console.error("Failed to publish raw event to IoT Core:", err);
  }

  await reportSpan({
    traceId: event.id,
    spanId: context.awsRequestId,
    service: "ForwarderLambda",
    startTime,
    endTime: new Date().toISOString(),
    durationMs: Date.now() - start,
    status,
    error,
    attributes: { detailType: event["detail-type"], source: event.source },
    attempt: event.detail?.attempt || 1,
    replayOf: event.detail?.replayOf || null,
  });

  return { statusCode: 200 };
};