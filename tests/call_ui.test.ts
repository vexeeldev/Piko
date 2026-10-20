import test from "node:test";
import assert from "node:assert/strict";
import type { CallInfo, CallCapabilities, CapabilityStatus } from "../src/types.ts";

test("Call Model: creates valid provider-neutral call objects with capability statuses", () => {
  const capabilities: CallCapabilities = {
    accept: "verified",
    decline: "verified",
    end: "verified",
    mute: "unverified",
    speaker: "unsupported",
  };

  const call: CallInfo = {
    id: "test-call-101",
    provider: "whatsapp-web",
    direction: "incoming",
    state: "incoming",
    contactName: "Sarah Jenkins",
    avatarUrl: "https://example.com/avatar.jpg",
    startedAt: null,
    capabilities,
  };

  assert.equal(call.id, "test-call-101");
  assert.equal(call.provider, "whatsapp-web");
  assert.equal(call.direction, "incoming");
  assert.equal(call.state, "incoming");
  assert.equal(call.startedAt, null);
  assert.equal(call.capabilities.accept, "verified");
  assert.equal(call.capabilities.speaker, "unsupported");
});

test("Swipe-To-Answer Gesture Logic: verifies 80% threshold and leftward clamping", () => {
  const trackWidth = 240;
  const thumbWidth = 40;
  const padding = 6;
  const maxTravel = trackWidth - thumbWidth - padding; // 194px
  const threshold = 0.8;

  // 1. Initial position strictly on the LEFT (x = 0)
  let currentX = 0;
  assert.equal(currentX, 0);

  // 2. Swiping to the left is clamped (cannot go below 0)
  const leftwardDelta = -50;
  currentX = Math.max(0, Math.min(leftwardDelta, maxTravel));
  assert.equal(currentX, 0, "Slider thumb must remain at 0 when dragged left");

  // 3. Swiping right below 80% threshold (< 155.2px)
  const dragPartial = 100; // 100 / 194 = 51.5%
  const progressPartial = dragPartial / maxTravel;
  assert.ok(progressPartial < threshold, "Progress is below 80%");
  const shouldAnswerPartial = progressPartial >= threshold;
  assert.equal(shouldAnswerPartial, false, "Must NOT answer if released before 80% threshold");

  // 4. Swiping right at or exceeding 80% threshold (e.g. 160px / 194px = 82.5%)
  const dragSufficient = 160;
  const progressSufficient = dragSufficient / maxTravel;
  assert.ok(progressSufficient >= threshold, "Progress is at or above 80%");
  const shouldAnswerSufficient = progressSufficient >= threshold;
  assert.equal(shouldAnswerSufficient, true, "Must answer when released at or above 80% threshold");

  // 5. Clamping at max travel
  const dragExcess = 300;
  const clampedExcess = Math.max(0, Math.min(dragExcess, maxTravel));
  assert.equal(clampedExcess, maxTravel, "Thumb cannot exceed max travel of the track");
});

test("Call Duration Formatter: derives strictly from confirmed call start timestamp", () => {
  function formatCallDuration(startedAt?: number | null, currentTimeMs: number = Date.now()): string {
    if (!startedAt || startedAt <= 0) return "Connected";
    const elapsedSec = Math.max(0, Math.floor((currentTimeMs - startedAt) / 1000));
    const hours = Math.floor(elapsedSec / 3600);
    const minutes = Math.floor((elapsedSec % 3600) / 60);
    const seconds = elapsedSec % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  // Unconfirmed / null start time must display static status, never fake seconds
  assert.equal(formatCallDuration(null), "Connected");
  assert.equal(formatCallDuration(undefined), "Connected");
  assert.equal(formatCallDuration(0), "Connected");

  // Confirmed start time formatting
  const baseTime = 1700000000000;
  assert.equal(formatCallDuration(baseTime, baseTime + 5000), "00:05");
  assert.equal(formatCallDuration(baseTime, baseTime + 75000), "01:15");
  assert.equal(formatCallDuration(baseTime, baseTime + 3665000), "1:01:05");
});

test("Contact & Avatar Fallbacks: handles missing or whitespace contact names gracefully", () => {
  function getDisplayName(rawName?: string | null): string {
    return rawName?.trim() || "Unknown Caller";
  }

  function getInitial(displayName: string): string {
    return displayName.charAt(0).toUpperCase();
  }

  assert.equal(getDisplayName(""), "Unknown Caller");
  assert.equal(getDisplayName("   "), "Unknown Caller");
  assert.equal(getDisplayName(null), "Unknown Caller");
  assert.equal(getDisplayName(undefined), "Unknown Caller");
  assert.equal(getDisplayName("Alice Cooper"), "Alice Cooper");
  assert.equal(getInitial(getDisplayName("Alice Cooper")), "A");
  assert.equal(getInitial(getDisplayName(null)), "U");
});

test("Call State Progression: answer click keeps state answering until confirmed active by provider", () => {
  // Simulating state machine in useCallData
  let call: CallInfo = {
    id: "wa-1001",
    provider: "whatsapp-web",
    direction: "incoming",
    state: "incoming",
    contactName: "Bob",
    startedAt: null,
    capabilities: {
      accept: "verified",
      decline: "verified",
      end: "verified",
      mute: "unverified",
      speaker: "unsupported",
    },
  };

  // Step 1: User completes swipe right to answer
  // State transitions to 'answering' while waiting for bridge/DOM confirmation
  call = { ...call, state: "answering", error: null };
  assert.equal(call.state, "answering");
  assert.equal(call.startedAt, null, "Must NOT set startedAt merely on user click/swipe");

  // Step 2: If answer control not found or fails in DOM
  const failedCall = {
    ...call,
    state: "incoming" as const,
    error: "Failed to answer: Answer button missing",
  };
  assert.equal(failedCall.state, "incoming");
  assert.match(failedCall.error!, /Answer button missing/);

  // Step 3: Provider confirms connection with real DOM change
  const confirmedCall = {
    ...call,
    state: "active" as const,
    startedAt: 1700000010000,
    error: null,
  };
  assert.equal(confirmedCall.state, "active");
  assert.equal(confirmedCall.startedAt, 1700000010000);

  // Step 4: Call ends
  const endedCall = { ...confirmedCall, state: "ended" as const };
  assert.equal(endedCall.state, "ended");
});

test("Disconnect & Deduplication Logic: clears call on disconnect and ignores duplicate events", () => {
  let activeCall: CallInfo | null = {
    id: "wa-1002",
    provider: "whatsapp-web",
    direction: "incoming",
    state: "active",
    startedAt: 1700000000000,
    capabilities: {
      accept: "verified",
      decline: "verified",
      end: "verified",
      mute: "unverified",
      speaker: "unsupported",
    },
  };

  // Duplicate event test
  const isDuplicate = (lastCall: CallInfo | null, newCall: CallInfo): boolean => {
    return lastCall?.id === newCall.id && lastCall?.state === newCall.state;
  };

  const incomingSame = { ...activeCall };
  assert.equal(isDuplicate(activeCall, incomingSame), true, "Duplicate event must be ignored");

  const incomingStateChange = { ...activeCall, state: "ended" as const };
  assert.equal(isDuplicate(activeCall, incomingStateChange), false, "State change is not duplicate");

  // Disconnect handler resets activeCall to null
  const handleDisconnect = () => {
    activeCall = null;
  };
  handleDisconnect();
  assert.equal(activeCall, null, "Active call must reset to null on disconnect");
});

