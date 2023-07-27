/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
const {
  createDeploymentDetailsFromOptions,
} = require("@calliope-edu/website-deploy-aws-config");

const { s3Config } = createDeploymentDetailsFromOptions({
  production: {
    bucket: "production.calliope.simulator",
  },
  staging: {
    bucket: "staging.calliope.simulator",
  },
  review: {
    bucket: "review.calliope.simulator",
    mode: "branch-prefix",
  },
});
module.exports = {
  ...s3Config,
  region: "eu-central-1",
  removeNonexistentObjects: true,
  enableS3StaticWebsiteHosting: true,
  errorDocumentKey: "index.html",
  redirects: [],
  params: {
    "**/*": {
      CacheControl: "public, max-age=0, must-revalidate",
    },
    // We need hashes in the filenames to enable these
    // "**/**/!(sw).js": { CacheControl: "public, max-age=31536000, immutable" },
    // "**/**.wasm": { CacheControl: "public, max-age=31536000, immutable" },
  },
};
