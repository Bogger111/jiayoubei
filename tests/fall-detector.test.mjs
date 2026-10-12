import assert from "node:assert/strict";
import test from "node:test";
import { FallDetector } from "../lib/cv/fall-detector.ts";

const pose = ({ hipY = .48, horizontal = false } = {}) => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  points[11] = { x: horizontal ? .2 : .44, y: horizontal ? hipY - .03 : hipY - .25, visibility: 1 };
  points[12] = { x: horizontal ? .25 : .56, y: horizontal ? hipY - .03 : hipY - .25, visibility: 1 };
  points[23] = { x: horizontal ? .52 : .46, y: hipY, visibility: 1 };
  points[24] = { x: horizontal ? .57 : .54, y: hipY, visibility: 1 };
  points[27] = { x: horizontal ? .8 : .46, y: horizontal ? hipY + .03 : .91, visibility: 1 };
  points[28] = { x: horizontal ? .85 : .54, y: horizontal ? hipY + .03 : .91, visibility: 1 };
  return points;
};
const standing = (detector, start = 0) => {
  let result;
  for (let t = start; t <= start + 1000; t += 100) result = detector.update(pose(), t);
  assert.equal(result.state, "tracking");
};
const falling = (detector, start = 1100) => {
  let result;
  for (let t = start; t <= start + 1200; t += 100) result = detector.update(pose({ hipY: .72, horizontal: true }), t);
  return result;
};
test("standing calibration and continuous fall create exactly one event", () => {
  const detector = new FallDetector(); standing(detector);
  const result = falling(detector);
  assert.equal(result.newEvent, true); assert.equal(result.state, "suspected_fall");
  assert.equal(detector.update(pose({ hipY: .72, horizontal: true }), 2400).newEvent, false);
});
test("a single upright frame cannot establish a standing baseline", () => {
  const detector = new FallDetector();
  assert.equal(detector.update(pose(), 0).state, "calibrating");
  assert.equal(falling(detector, 100).newEvent, false);
});
test("sitting and pre-existing lying do not create fall alerts", () => {
  const sitting = new FallDetector(); standing(sitting);
  for (let t = 1100; t <= 3000; t += 100) assert.equal(sitting.update(pose({ hipY: .68 }), t).newEvent, false);
  assert.equal(falling(new FallDetector(), 0).newEvent, false);
});
test("occlusion and long frame gaps cannot count toward a fall hold", () => {
  const detector = new FallDetector(); standing(detector);
  detector.update(pose({ hipY: .72, horizontal: true }), 1100);
  detector.update(undefined, 1200);
  assert.equal(detector.update(pose({ hipY: .72, horizontal: true }), 2300).newEvent, false);
  assert.equal(falling(detector, 2400).newEvent, false);
});
test("recovery needs a stable upright interval before another alert", () => {
  const detector = new FallDetector(); standing(detector); falling(detector);
  detector.update(pose(), 2400);
  assert.equal(falling(detector, 2500).newEvent, false);
  standing(detector, 3900);
  assert.equal(falling(detector, 5000).newEvent, true);
});
test("brief occlusion invalidates the old person's standing baseline", () => {
  const detector = new FallDetector(); standing(detector);
  detector.update(undefined, 1100);
  for (let time = 1200; time <= 2900; time += 100) {
    const observation = detector.update(pose({ hipY: .72, horizontal: true }), time);
    assert.equal(observation.calibrationProgress, 0);
    assert.equal(observation.newEvent, false);
  }
});
test("angles account for aspect ratio and invalidate resizing trajectories", () => {
  const points = pose(); points[11].x += .1; points[12].x += .1;
  assert.ok(new FallDetector().update(points, 0, 16/9).torsoAngle > new FallDetector().update(points, 0, 9/16).torsoAngle);
  const detector = new FallDetector(); standing(detector);
  const resized = detector.update(pose({ hipY: .72, horizontal: true }), 1100, 16/9);
  assert.equal(resized.calibrationProgress, 0); assert.equal(resized.newEvent, false);
});
test("invalid coordinates and duplicate timestamps are ignored", () => {
  const detector = new FallDetector(); const points = pose(); points[27].x = 1.2;
  assert.equal(detector.update(points, 0).state, "no_person");
  assert.equal(detector.update(pose(), 0).newEvent, false);
  assert.equal(detector.update(pose(), NaN).newEvent, false);
  assert.equal(detector.update(pose(), 100, 0).state, "no_person");
});
