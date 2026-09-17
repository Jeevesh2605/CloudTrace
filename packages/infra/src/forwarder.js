const {
    IoTDataPlaneClient,
    PublishCommand,
  } = require("@aws-sdk/client-iot-data-plane");
  
  const iotClient = new IoTDataPlaneClient({});
  const TOPIC_PREFIX = process.env.IOT_TOPIC_PREFIX || "vaportrace/events";
  
  exports.handler = async (event, context) => {
    console.log("VaporTrace forwarder received event:");
    console.log(JSON.stringify(event, null, 2));
  
    const topic = `${TOPIC_PREFIX}/${event["detail-type"] || "unknown"}`;
  
    try {
      await iotClient.send(
        new PublishCommand({
          topic,
          payload: Buffer.from(JSON.stringify(event)),
          qos: 0,
        })
      );
      console.log(`Published to IoT topic: ${topic}`);
    } catch (err) {
      console.error("Failed to publish to IoT Core:", err);
      // don't fail the Lambda over a publish error — logging + archive already captured it
    }
  
    return { statusCode: 200 };
  };