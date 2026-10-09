import test from "node:test";
import assert from "node:assert/strict";
import { canUseExportStudio } from "../app/lib/export-access.ts";

test("Production and preview cannot access exports, even with a forged localhost host", () => {
  for (const environment of ["production", "test", undefined]) for (const host of ["localhost:3001", "127.0.0.1", "desk.aawnetwork.co.uk", null]) assert.equal(canUseExportStudio(environment, host), false);
});
test("Development permits only explicit loopback host names", () => {
  for (const host of ["localhost:3001", "127.0.0.1:3001", "[::1]:3001"]) assert.equal(canUseExportStudio("development", host), true);
  for (const host of ["desk.aawnetwork.co.uk", "localhost.evil.test", "192.168.1.2:3001", null]) assert.equal(canUseExportStudio("development", host), false);
});
