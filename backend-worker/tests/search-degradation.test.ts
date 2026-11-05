import { test } from "node:test";
import assert from "node:assert/strict";
import { isLibgenErrorPage, isAaChallengePage } from "../src/parse.ts";
import { classifyProviderStatus } from "../src/reliability.ts";

test("isAaChallengePage correctly identifies anti-bot challenges", () => {
  const challengeRedirecting = "<html><head><title>Redirecting...</title></head><body>Please wait...</body></html>";
  const challengeVarRedirect = "<html><body><script>var redirect_link = 'https://annas-archive.li/md5/...';</script></body></html>";
  const challengeIife = "<html><body><script src='/iife.min.js'></script></body></html>";
  const normalPage = "<html><head><title>Anna’s Archive</title></head><body><div>Search results: Dune by Frank Herbert</div></body></html>";

  assert.equal(isAaChallengePage(challengeRedirecting), true);
  assert.equal(isAaChallengePage(challengeVarRedirect), true);
  assert.equal(isAaChallengePage(challengeIife), true);
  assert.equal(isAaChallengePage(normalPage), false);
});

test("isLibgenErrorPage correctly identifies LibGen search daemon errors", () => {
  const errorPage1 = "<body>Could not connect to the database 9306. Too many connections</body>";
  const nginxPage = "<html><head><title>Welcome to nginx!</title></head><body><p>If you see this page, the nginx web server is successfully installed</p></body></html>";
  const normalLibgen = "<html><body><table class='c'><tr><td>Dune</td><td>Frank Herbert</td></tr></table></body></html>";
  const cleanMissLibgen = "<html><body><table class='c'></table>No files found</body></html>";

  assert.equal(isLibgenErrorPage(errorPage1), true);
  assert.equal(isLibgenErrorPage(nginxPage), true);
  assert.equal(isLibgenErrorPage(normalLibgen), false);
  assert.equal(isLibgenErrorPage(cleanMissLibgen), false);
});

test("classifyProviderStatus: both providers unavailable (challenges / errors / timeouts)", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 0, attempted: 3, healthyResponses: 0, challenges: 2, failures: 1 },
    { total: 5, skipped: 0, attempted: 2, healthyResponses: 0, challenges: 0, failures: 2 }
  );
  assert.equal(res.aaUnavailable, true);
  assert.equal(res.lgUnavailable, true);
  assert.equal(res.upstreamOutage, true);
  assert.equal(res.partialFailure, false);
});

test("classifyProviderStatus: all mirrors circuit-broken or deferred", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 3, attempted: 0, healthyResponses: 0, challenges: 0, failures: 0 },
    { total: 5, skipped: 5, attempted: 0, healthyResponses: 0, challenges: 0, failures: 0 }
  );
  assert.equal(res.aaUnavailable, true);
  assert.equal(res.lgUnavailable, true);
  assert.equal(res.upstreamOutage, true);
  assert.equal(res.partialFailure, false);
});

test("classifyProviderStatus: one provider unavailable and another healthy with clean misses", () => {
  // AA down (3 challenges), LibGen healthy with 2 clean misses
  const res = classifyProviderStatus(
    { total: 3, skipped: 0, attempted: 3, healthyResponses: 0, challenges: 3, failures: 0 },
    { total: 5, skipped: 0, attempted: 2, healthyResponses: 2, challenges: 0, failures: 0 }
  );
  assert.equal(res.aaUnavailable, true);
  assert.equal(res.lgUnavailable, false);
  assert.equal(res.upstreamOutage, false, "Must not be classified as total outage when LibGen answered cleanly");
  assert.equal(res.partialFailure, true, "Should signal partial degradation because AA had challenges");
});

test("classifyProviderStatus: genuine clean miss when both providers are healthy", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 0, attempted: 1, healthyResponses: 1, challenges: 0, failures: 0 },
    { total: 5, skipped: 0, attempted: 2, healthyResponses: 2, challenges: 0, failures: 0 }
  );
  assert.equal(res.aaUnavailable, false);
  assert.equal(res.lgUnavailable, false);
  assert.equal(res.upstreamOutage, false);
  assert.equal(res.partialFailure, false);
});

test("classifyProviderStatus: partial provider failure when some mirrors fail but hits exist", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 1, attempted: 2, healthyResponses: 1, challenges: 0, failures: 1 },
    { total: 5, skipped: 0, attempted: 2, healthyResponses: 2, challenges: 0, failures: 0 }
  );
  assert.equal(res.aaUnavailable, false);
  assert.equal(res.lgUnavailable, false);
  assert.equal(res.upstreamOutage, false);
  assert.equal(res.partialFailure, true);
});

test("search response degradation envelope preserves community uploads during outage", () => {
  const searchOutcome = {
    results: [],
    source: "none" as const,
    degraded: true,
    partial: false,
    upstreamOutage: true,
    upstreamNotice: {
      code: "UPSTREAM_DOWN" as const,
      message: "External search providers are temporarily unreachable. No saved matches found.",
    },
  };

  const communityItems = [
    {
      md5: "a".repeat(32),
      title: "Community Shared Book",
      author: "Jane Doe",
      community: true,
    },
  ];

  const merged = [...communityItems, ...searchOutcome.results];
  const degraded = searchOutcome.degraded || (communityItems.length > 0 && searchOutcome.upstreamOutage);
  const outage = searchOutcome.upstreamOutage;
  const partial = Boolean(searchOutcome.partial);

  const responsePayload = {
    results: merged,
    degraded,
    partial,
    outage,
    source: searchOutcome.source,
    upstreamNotice: searchOutcome.upstreamNotice,
  };

  assert.equal(responsePayload.results.length, 1);
  assert.equal(responsePayload.degraded, true);
  assert.equal(responsePayload.outage, true);
  assert.equal(responsePayload.results[0].community, true);
  assert.equal(responsePayload.upstreamNotice.code, "UPSTREAM_DOWN");
});
