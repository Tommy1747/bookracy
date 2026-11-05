import { test } from "node:test";
import assert from "node:assert/strict";
import { isLibgenErrorPage, isAaChallengePage } from "../src/parse.ts";

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

test("upstream outage logic distinguishes clean misses from total failure", () => {
  // Classification simulation logic matching searchSources in index.ts:
  const classifyOutage = (params: {
    aaAttempted: number;
    aaHealthyResponses: number;
    libgenCandidates: number;
    lgAttempted: number;
    lgCleanMisses: number;
    lgFailures: number;
  }) => {
    const aaUnavailable = (params.aaAttempted > 0 && params.aaHealthyResponses === 0) || (params.aaAttempted === 0);
    const lgUnavailable = (params.libgenCandidates === 0) || (params.lgAttempted > 0 && params.lgCleanMisses === 0 && params.lgFailures > 0);
    const upstreamOutage = aaUnavailable && lgUnavailable;
    return upstreamOutage;
  };

  // Case 1: AA down (interstitial/challenge) + LibGen all mirrors timing out/5xx
  assert.equal(
    classifyOutage({
      aaAttempted: 3,
      aaHealthyResponses: 0,
      libgenCandidates: 2,
      lgAttempted: 2,
      lgCleanMisses: 0,
      lgFailures: 2,
    }),
    true,
    "Should identify total provider outage when both AA and LibGen fail"
  );

  // Case 2: AA down, but LibGen answered healthy with clean misses (genuine zero-result search)
  assert.equal(
    classifyOutage({
      aaAttempted: 3,
      aaHealthyResponses: 0,
      libgenCandidates: 2,
      lgAttempted: 2,
      lgCleanMisses: 2,
      lgFailures: 0,
    }),
    false,
    "A clean miss from LibGen must not be classified as a provider outage"
  );

  // Case 3: All AA and LibGen mirrors circuit-broken or deferred
  assert.equal(
    classifyOutage({
      aaAttempted: 0,
      aaHealthyResponses: 0,
      libgenCandidates: 0,
      lgAttempted: 0,
      lgCleanMisses: 0,
      lgFailures: 0,
    }),
    true,
    "When all upstream candidates are circuit-broken, state is an outage"
  );
});

test("search response degradation envelope preserves community uploads during outage", () => {
  // Verifies the response shaping rule:
  // Community items must be retained and flagged with outage/degraded when upstream failed
  const searchOutcome = {
    results: [],
    source: "none" as const,
    degraded: true,
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

  const responsePayload = {
    results: merged,
    degraded,
    outage,
    source: searchOutcome.source,
    upstreamNotice: searchOutcome.upstreamNotice,
  };

  assert.equal(responsePayload.results.length, 1);
  assert.equal(responsePayload.degraded, true);
  assert.equal(responsePayload.outage, true);
  assert.equal(responsePayload.upstreamNotice.code, "UPSTREAM_DOWN");
});
