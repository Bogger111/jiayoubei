import assert from "node:assert/strict";
import test from "node:test";
import { validateProductBootstrap } from "../src/api/bootstrapSchema.ts";

const complete = {
  family: {}, user: {}, members: [], events: [], tasks: [], authorizations: [], devices: [],
  services: [], notifications: [], auditLogs: [],
};

test("complete bootstrap payload is accepted", () => {
  assert.equal(validateProductBootstrap(complete), true);
});

test("partial bootstrap payload is rejected instead of keeping mock records", () => {
  const partial = { ...complete };
  delete partial.devices;
  assert.equal(validateProductBootstrap(partial), false);
});

test("bootstrap collection fields must be arrays", () => {
  assert.equal(validateProductBootstrap({ ...complete, events: null }), false);
  assert.equal(validateProductBootstrap({ ...complete, tasks: {} }), false);
});
