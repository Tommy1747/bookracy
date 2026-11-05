import { test } from "node:test";
import assert from "node:assert/strict";
import { isLibgenErrorPage, isAaChallengePage } from "../src/parse.ts";
import { classifyProviderStatus, buildSearchResponsePayload } from "../src/reliability.ts";

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

test("MD5 resolution: LibGen daemon-error HTML is classified as failure rather than clean miss", () => {
  const daemonErrorHtml = "<body>Could not connect to the database 9306. Too many connections</body>";
  assert.equal(isLibgenErrorPage(daemonErrorHtml), true);

  // If LibGen answered with this error on all attempts and AA failed/skipped:
  const res = classifyProviderStatus(
    { total: 3, skipped: 3, attempted: 0, healthyResponses: 0, challenges: 0, failures: 0 },
    { total: 5, skipped: 0, attempted: 1, healthyResponses: 0, challenges: 0, failures: 1 }
  );
  assert.equal(res.lgUnavailable, true);
  assert.equal(res.upstreamOutage, true);
});

test("MD5 resolution: healthy clean miss avoids outage classification", () => {
  const cleanMissHtml = "<html><body>No file record for md5</body></html>";
  assert.equal(isLibgenErrorPage(cleanMissHtml), false);

  const res = classifyProviderStatus(
    { total: 3, skipped: 3, attempted: 0, healthyResponses: 0, challenges: 0, failures: 0 },
    { total: 5, skipped: 0, attempted: 2, healthyResponses: 2, challenges: 0, failures: 0 }
  );
  assert.equal(res.lgUnavailable, false);
  assert.equal(res.upstreamOutage, false);
  assert.equal(res.partialFailure, true); // AA was skipped
});

test("MD5 resolution: timeout on all candidates results in upstream outage", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 0, attempted: 3, healthyResponses: 0, challenges: 0, failures: 3 },
    { total: 5, skipped: 0, attempted: 5, healthyResponses: 0, challenges: 0, failures: 5 }
  );
  assert.equal(res.upstreamOutage, true);
  assert.equal(res.aaUnavailable, true);
  assert.equal(res.lgUnavailable, true);
});

test("MD5 resolution: successful resolution when one provider is unavailable", () => {
  const res = classifyProviderStatus(
    { total: 3, skipped: 3, attempted: 0, healthyResponses: 0, challenges: 0, failures: 0 },
    { total: 5, skipped: 0, attempted: 1, healthyResponses: 1, challenges: 0, failures: 0 }
  );
  assert.equal(res.upstreamOutage, false);
  assert.equal(res.partialFailure, true);
});

test("buildSearchResponsePayload: complete upstream outage with community results", () => {
  const searchOutcome = {
    source: "none" as const,
    degraded: true,
    partial: false,
    upstreamOutage: true,
    upstreamNotice: {
      code: "UPSTREAM_DOWN" as const,
      message: "External search providers are temporarily unreachable. No saved matches found.",
    },
  };

  const communityItem = { md5: "c".repeat(32), title: "Community Book", community: true };
  const payload = buildSearchResponsePayload(searchOutcome, [communityItem], []);

  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].community, true);
  assert.equal(payload.outage, true);
  assert.equal(payload.degraded, true);
  assert.equal(payload.upstreamNotice?.code, "UPSTREAM_DOWN");
});

test("buildSearchResponsePayload: complete upstream outage without community results", () => {
  const searchOutcome = {
    source: "none" as const,
    degraded: true,
    partial: false,
    upstreamOutage: true,
  };

  const payload = buildSearchResponsePayload(searchOutcome, [], []);

  assert.equal(payload.results.length, 0);
  assert.equal(payload.outage, true);
  assert.equal(payload.degraded, true);
  assert.equal(payload.upstreamNotice?.code, "UPSTREAM_DOWN");
});

test("buildSearchResponsePayload: partial degradation with community and upstream results", () => {
  const searchOutcome = {
    source: "live" as const,
    degraded: true,
    partial: true,
    upstreamOutage: false,
    upstreamNotice: {
      code: "UPSTREAM_DEGRADED" as const,
      message: "Some external search mirrors are experiencing delays.",
    },
  };

  const communityItem = { md5: "1".repeat(32), title: "User Upload", community: true };
  const upstreamItem = { md5: "2".repeat(32), title: "Live Provider Book" };

  const payload = buildSearchResponsePayload(searchOutcome, [communityItem], [upstreamItem]);

  assert.equal(payload.results.length, 2);
  assert.equal(payload.partial, true);
  assert.equal(payload.degraded, true);
  assert.equal(payload.outage, false);
  assert.equal(payload.upstreamNotice?.code, "UPSTREAM_DEGRADED");
});

test("buildSearchResponsePayload: dedupes community and upstream results by md5", () => {
  const searchOutcome = {
    source: "live" as const,
    degraded: false,
    partial: false,
    upstreamOutage: false,
  };

  const sharedMd5 = "d".repeat(32);
  const communityItem = { md5: sharedMd5, title: "Community Priority", community: true };
  const upstreamItem = { md5: sharedMd5, title: "Upstream Duplicate" };

  const payload = buildSearchResponsePayload(searchOutcome, [communityItem], [upstreamItem]);

  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].title, "Community Priority");
  assert.equal(payload.results[0].community, true);
  assert.equal(payload.outage, false);
  assert.equal(payload.degraded, false);
});
