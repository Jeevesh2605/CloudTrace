const path = require("path");
const os = require("os");
const { mqtt5, iot } = require("aws-iot-device-sdk-v2");

const CERT_DIR = path.join(os.homedir(), ".vaportrace", "certs");

async function connectIotClient(onMessage) {
  const endpoint = process.env.VAPORTRACE_IOT_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "Set VAPORTRACE_IOT_ENDPOINT to your account's IoT Data-ATS endpoint (see `aws iot describe-endpoint`)"
    );
  }

  const clientId = `vaportrace-${Math.floor(Math.random() * 100000)}`;

  const builder =
    iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
      endpoint,
      path.join(CERT_DIR, "device-cert.pem.crt"),
      path.join(CERT_DIR, "device-private.pem.key")
    ).withConnectProperties({
      clientId,
      keepAliveIntervalSeconds: 30,
    });

  const client = new mqtt5.Mqtt5Client(builder.build());

  client.on("messageReceived", (eventData) => {
    const topic = eventData.message.topicName || eventData.message.topic;
    const payload = eventData.message.payload
      ? Buffer.from(eventData.message.payload).toString("utf-8")
      : "{}";
    try {
      onMessage(topic, JSON.parse(payload));
    } catch {
      onMessage(topic, payload);
    }
  });

  client.on("error", (err) => console.error("[iot-client] error:", err));

  await new Promise((resolve, reject) => {
    client.on("connectionSuccess", resolve);
    client.on("connectionFailure", reject);
    client.start();
  });

  await client.subscribe({
    subscriptions: [
      { qos: mqtt5.QoS.AtMostOnce, topicFilter: "vaportrace/events/#" },
    ],
  });

  console.log(`[iot-client] connected & subscribed as ${clientId}`);
  return client;
}

module.exports = { connectIotClient };