#!/usr/bin/env node
const cdk = require("aws-cdk-lib");
const { VaporTraceStack } = require("../lib/cloudtrace-stack.js");

const app = new cdk.App();
new VaporTraceStack(app, "VaporTraceStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});