exports.handler = async (event, context) => {
    console.log("VaporTrace forwarder received event:");
    console.log(JSON.stringify(event, null, 2));
    return { statusCode: 200 };
  };