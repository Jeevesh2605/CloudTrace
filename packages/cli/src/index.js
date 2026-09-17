const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const { connectIotClient } = require("./iot-client");

const app = express();
const PORT = process.env.PORT || 4000;

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

// 2. Placeholder for Day 4: The Replay Trigger
app.post("/replay", async (req, res) => {
  const { traceId, replayName } = req.body;
  console.log(chalk.blue(`🔄 Replay requested for trace: ${traceId}`));
  // Day 4: Insert AWS SDK EventBridge StartReplay command here
  res.json({ status: "Replay initiated", replayName });
});

// 3. Initialize the MQTT Tunnel and Server
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
    });
  } catch (error) {
    console.error(chalk.red("❌ Failed to start CLI:"), error);
    process.exit(1);
  }
}

start();