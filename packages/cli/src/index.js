const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const { XRayClient, GetServiceGraphCommand } = require("@aws-sdk/client-xray");
const { connectIotClient } = require("./iot-client");

const app = express();
const PORT = process.env.PORT || 4000;
const eventBridge = new EventBridgeClient({});
const xray = new XRayClient({});

app.use(cors());
app.use(express.json());

// Store active frontend dashboard connections
let sseClients = [];

// 1. The Server-Sent Events (SSE) endpoint for Next.js
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

// 2. Edit & Resubmit — pushes a (possibly edited) payload back onto the bus
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

// 3. Poll AWS X-Ray's real service graph and broadcast it to the dashboard
function startServiceGraphPolling() {
  setInterval(async () => {
    try {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const result = await xray.send(
        new GetServiceGraphCommand({
          StartTime: fiveMinAgo,
          EndTime: now,
        })
      );

      const payload = {
        type: "service-graph-update",
        services: result.Services || [],
        time: now.toISOString(),
      };

      sseClients.forEach((client) => {
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
      });
    } catch (err) {
      console.error(chalk.red("X-Ray service graph poll failed:"), err.message);
    }
  }, 10000);
}

// 4. Initialize the MQTT Tunnel and Server
async function start() {
  console.log(chalk.cyan("🚀 Starting VaporTrace CLI..."));

  try {
    await connectIotClient((topic, payload) => {
      console.log(chalk.gray(`[${topic}]`), chalk.white(JSON.stringify(payload)));

      // Broadcast the MQTT payload to all connected Next.js dashboards
      sseClients.forEach((client) => {
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
      });
    });

    app.listen(PORT, () => {
      console.log(chalk.cyan(`🎧 Local API & SSE Stream listening on http://localhost:${PORT}`));
      console.log(chalk.cyan(`👉 Run your Next.js dashboard to connect.`));
      startServiceGraphPolling();
    });
  } catch (error) {
    console.error(chalk.red("❌ Failed to start CLI:"), error);
    process.exit(1);
  }
}

module.exports = { start };