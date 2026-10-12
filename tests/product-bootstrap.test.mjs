import assert from "node:assert/strict";
import test from "node:test";
import { validateProductBootstrap } from "../src/api/bootstrapSchema.ts";
import {
  mockFamily,
  mockUser,
  mockMembers,
  mockEvents,
  mockTasks,
  mockDevices,
  mockAuthorizations,
  mockServices,
  mockNotifications,
  mockAuditLogs,
} from "../lib/product-mocks.ts";

const complete = {
  family: mockFamily,
  user: mockUser,
  members: mockMembers,
  events: mockEvents,
  tasks: mockTasks,
  authorizations: mockAuthorizations,
  devices: mockDevices,
  services: mockServices,
  notifications: mockNotifications,
  auditLogs: mockAuditLogs,
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
test("malformed identities, enum values and duplicate records are rejected", () => {
  for (const patch of [
    { family: {} },
    { user: [] },
    { family: { ...mockFamily, timezone: "not-a-timezone" } },
    { tasks: [{ ...mockTasks[0], status: "made-up-status" }] },
    { devices: [{ ...mockDevices[0], online: "true" }] },
    { members: [mockMembers[0], mockMembers[0]] },
  ])
    assert.equal(validateProductBootstrap({ ...complete, ...patch }), false);
});
test("nested associations and timelines must have their actual display shape", () => {
  for (const patch of [
    { events: [{ ...mockEvents[0], relatedTasks: {} }] },
    { events: [{ ...mockEvents[0], timeline: ["invalid-entry"] }] },
    { members: [{ ...mockMembers[0], permissions: "all" }] },
    { notifications: [{ ...mockNotifications[0], read: 1 }] },
  ])
    assert.equal(validateProductBootstrap({ ...complete, ...patch }), false);
});
test("a real family may legitimately have empty collections", () => {
  const empty = {
    family: { ...mockFamily, mode: "real" },
    user: mockUser,
    members: [],
    events: [],
    tasks: [],
    authorizations: [],
    devices: [],
    services: [],
    notifications: [],
    auditLogs: [],
  };
  assert.equal(validateProductBootstrap(empty), true);
});
