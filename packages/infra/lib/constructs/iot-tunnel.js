const { Construct } = require("constructs");
const iot = require("aws-cdk-lib/aws-iot");
const cdk = require("aws-cdk-lib");

class IotTunnel extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    const topicPrefix = props.topicPrefix ?? "vaportrace/events";

    // Policy the LOCAL CLI's certificate will be attached to.
    // Scoped to connect + subscribe + receive on our topic only.
    this.devicePolicy = new iot.CfnPolicy(this, "DevicePolicy", {
      policyName: "vaportrace-device-policy",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "iot:Connect",
            Resource: `arn:aws:iot:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:client/vaportrace-*`,
          },
          {
            Effect: "Allow",
            Action: "iot:Subscribe",
            Resource: `arn:aws:iot:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:topicfilter/${topicPrefix}/*`,
          },
          {
            Effect: "Allow",
            Action: "iot:Receive",
            Resource: `arn:aws:iot:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:topic/${topicPrefix}/*`,
          },
        ],
      },
    });

    this.topicPrefix = topicPrefix;
  }
}

module.exports = { IotTunnel };