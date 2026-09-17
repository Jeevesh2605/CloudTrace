const { Construct } = require("constructs");
const events = require("aws-cdk-lib/aws-events");
const { Duration } = require("aws-cdk-lib");

class VaporTraceEventBus extends Construct {
  constructor(scope, id, props = {}) {
    super(scope, id);

    this.bus = new events.EventBus(this, "VaporTraceBus", {
      eventBusName: "vaportrace-bus",
    });

    this.archive = new events.Archive(this, "VaporTraceArchive", {
      sourceEventBus: this.bus,
      archiveName: "vaportrace-archive",
      description: "Archive of all VaporTrace dev-account events for replay",
      eventPattern: {
        source: events.Match.prefix(""),
      },
      retention: Duration.days(props.archiveRetentionDays ?? 7),
    });
  }
}

module.exports = { VaporTraceEventBus };