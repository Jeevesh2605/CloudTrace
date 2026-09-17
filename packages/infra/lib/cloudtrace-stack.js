const cdk = require("aws-cdk-lib");
const { Construct } = require("constructs");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
const { VaporTraceEventBus } = require("./constructs/event-bus");
const { IotTunnel } = require("./constructs/iot-tunnel");

class VaporTraceStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // 1. Sample event producer — S3 bucket
    const bucket = new s3.Bucket(this, "VaporTraceSourceBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. EventBridge bus + Archive
    const { bus, archive } = new VaporTraceEventBus(this, "Bus");

    // 3. Lambda forwarder
    const forwarderFn = new lambda.Function(this, "ForwarderFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "forwarder.handler",
      code: lambda.Code.fromAsset("src"),
      timeout: cdk.Duration.seconds(10),
    });

    // 4. S3 -> default bus -> re-publish onto vaportrace-bus
    bucket.enableEventBridgeNotification();

    new events.Rule(this, "S3ToVaporTraceBus", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: { bucket: { name: [bucket.bucketName] } },
      },
      targets: [new targets.EventBus(bus)],
    });

    // 5. vaportrace-bus -> forwarder Lambda
    new events.Rule(this, "AllEventsToForwarder", {
      eventBus: bus,
      eventPattern: { source: events.Match.prefix("") },
      targets: [new targets.LambdaFunction(forwarderFn)],
    });

    // 6. IoT Core tunnel — device policy for the local CLI's MQTT cert
    const tunnel = new IotTunnel(this, "Tunnel", {
      topicPrefix: "vaportrace/events",
    });

    // Let the forwarder Lambda publish to IoT Core over the Data Plane API (IAM-based, not cert-based)
    forwarderFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iot:Publish"],
        resources: [
          `arn:aws:iot:${this.region}:${this.account}:topic/vaportrace/events/*`,
        ],
      })
    );

    // Pass the topic prefix into the Lambda as an env var
    forwarderFn.addEnvironment("IOT_TOPIC_PREFIX", "vaportrace/events");

    new cdk.CfnOutput(this, "DevicePolicyName", {
      value: tunnel.devicePolicy.policyName,
    });

    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "BusName", { value: bus.eventBusName });
    new cdk.CfnOutput(this, "ArchiveArn", { value: archive.archiveArn });
  }
}

module.exports = { VaporTraceStack };