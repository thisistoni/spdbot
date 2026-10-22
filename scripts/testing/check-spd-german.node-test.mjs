import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureUrl, assertGerman } from "./check-spd-german.mjs";

test("QA accepts only the loopback fixture, never external or credential-bearing URLs", () => {
  assert.equal(fixtureUrl("http://127.0.0.1:4312/__spd-theme.html").port, "4312");
  for (const url of ["https://example.com/__spd-theme.html", "http://localhost:4312/__spd-theme.html", "http://user:password@127.0.0.1:4312/__spd-theme.html", "http://127.0.0.1:4312/pair#code=1234", "http://127.0.0.1:4312/__spd-theme.html#code=1234"]) {
    assert.throws(() => fixtureUrl(url));
  }
});

test("exact app-label assertions reject the screenshot-critical English regressions", () => {
  for (const [english, german] of [["Appearance", "Darstellung"], ["AI", "KI"], ["Computers", "Computer"], ["This computer", "Dieser Computer"], ["Opening workspace…", "Dein Arbeitsbereich wird geöffnet…"]]) {
    assert.doesNotThrow(() => assertGerman(german, german, english));
    assert.throws(() => assertGerman(english, german, english));
  }
  // A model or user supplied name containing English is not forbidden.
  assert.doesNotThrow(() => assertGerman("Mit My AI Computer verbinden", "Mit My AI Computer verbinden", "dynamic name"));
});
