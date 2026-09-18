#!/usr/bin/env node
const { Command } = require("commander");
const { start } = require("../src/index");

const program = new Command();

program
  .name("vaportrace")
  .description("ngrok for AWS Events")
  .version("0.1.0");

program
  .command("start")
  .description("Start the VaporTrace tunnel and local API/SSE server")
  .action(async () => {
    await start();
  });

program.parse(process.argv);
