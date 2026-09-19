const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const { XRayClient, GetServiceGraphCommand, GetTraceSummariesCommand } = require("@aws-sdk/client-xray");
const { connectIotClient } = require("./iot-client");

const app = express();
const PORT = process.env.PORT || 4000;
const eventBridge = new EventBridgeClient({});
const xray = new XRayClient({});

app.use(cors());
app.use(express.json());

let sseClients = [];

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  console.log(chalk.green("🖥️  Next.js Dashboard connected to CLI stream."));
  sseClients.push(res);

  req.on("close", () => {
    console.log(chalk.yellow("🖥️  Next.js Dashboard disconnected."));
    sseClients = sseClients.filter((client) => client !== res);
  });
});

app.post("/resubmit", async (req, res) => {
  const { source, detailType, detail, eventBusName } = req.body;
  try {
    const result = await eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: source || "vaportrace.resubmit",
            DetailType: detailType || "Manual Resubmit",
            Detail: JSON.stringify(detail),
            EventBusName: eventBusName || "vaportrace-bus",
          },
        ],
      })
    );
    console.log(chalk.green("↺ Resubmitted edited payload to cloud"));
    res.json({ status: "resubmitted", result });
  } catch (err) {
    console.error(chalk.red("Resubmit failed:"), err);
    res.status(500).json({ error: err.message });
  }
});

function broadcast(payload) {
  sseClients.forEach((client) => client.write(`data: ${JSON.stringify(payload)}\n\n`));
}

// Poll X-Ray for both the aggregate service graph AND real per-trace verification
function startXRayPolling() {
  setInterval(async () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    try {
      const graphResult = await xray.send(
        new GetServiceGraphCommand({ StartTime: fiveMinAgo, EndTime: now })
      );
      console.log(chalk.magenta(`📡 X-Ray service graph: ${(graphResult.Services || []).length} services`));
    } catch (err) {
      console.error(chalk.red("X-Ray service graph poll failed:"), err.message);
    }

    try {
      const summaryResult = await xray.send(
        new GetTraceSummariesCommand({ StartTime: fiveMinAgo, EndTime: now })
      );

      const verifiedTraceIds = [];
      (summaryResult.TraceSummaries || []).forEach((summary) => {
        const annotationValues = summary.Annotations?.vaporTraceId || [];
        annotationValues.forEach((a) => {
          const val = a.AnnotationValue?.StringValue;
          if (val) verifiedTraceIds.push(val);
        });
      });

      if (verifiedTraceIds.length > 0) {
        console.log(chalk.blue(`✓ X-Ray verified ${verifiedTraceIds.length} trace(s)`));
      }

      broadcast({ type: "xray-verification-update", verifiedTraceIds, time: now.toISOString() });
    } catch (err) {
      console.error(chalk.red("X-Ray trace verification poll failed:"), err.message);
    }
  }, 10000);
}

async function start() {
  console.log(chalk.cyan("🚀 Starting VaporTrace CLI..."));

  try {
    await connectIotClient((topic, payload) => {
      const label = payload?.detail?.service || payload?.["detail-type"] || "event";
      const status = payload?.detail?.status ? ` [${payload.detail.status}]` : "";
      console.log(chalk.gray(`[${topic}]`), chalk.white(`${label}${status}`));
      broadcast(payload);
    });

    app.listen(PORT, () => {
      console.log(chalk.cyan(`🎧 Local API & SSE Stream listening on http://localhost:${PORT}`));
      console.log(chalk.cyan(`👉 Run your Next.js dashboard to connect.`));
      startXRayPolling();
    });
  } catch (error) {
    console.error(chalk.red("❌ Failed to start CLI:"), error);
    process.exit(1);
  }
}

module.exports = { start };