#!/usr/bin/env node
const ref = process.env.GITHUB_REF;
let stage;

if (ref.startsWith("refs/heads/feature")) {
  stage = "STAGING";
} else if (ref.startsWith("refs/heads/main")) {
  stage = "PRODUCTION";
} else {
  stage = "REVIEW";
}

console.log(`STAGE=${stage}`);
