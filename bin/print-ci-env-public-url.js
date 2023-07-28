#!/usr/bin/env node
let url = "/";
if (process.env.GITHUB_REPOSITORY_OWNER === "calliope-edu") {
  if (!process.env.STAGE) {
    throw new Error("STAGE must be defined");
  }

  const deployment = require("../deployment");
  const { bucket } = deployment;
  const deployPath = `${bucket}`;

  console.log(`DEPLOY_PATH=${deployPath}`);
}

