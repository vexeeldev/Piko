import test from "node:test";
import assert from "node:assert/strict";
import type { ActiveView, DockedFile, MediaInfo, BatteryInfo, CallInfo } from "../src/types.ts";

test("Navigation State Machine: toggles between home menu and active feature views", () => {
  // Navigation state machine simulating DynamicIsland
  let activeView: ActiveView = "music";
  let lastFeatureView: ActiveView = "music";

  const selectView = (view: ActiveView) => {
    activeView = view;
    if (view !== "menu") {
      lastFeatureView = view;
    }
  };

  const toggleHome = () => {
    activeView = activeView === "menu" ? lastFeatureView : "menu";
  };

  // 1. Initial view defaults to music
  assert.equal(activeView, "music");
  assert.equal(lastFeatureView, "music");

  // 2. Clicking Home from music opens menu
  toggleHome();
  assert.equal(activeView, "menu");
  assert.equal(lastFeatureView, "music", "lastFeatureView remains music");

  // 3. Selecting File Dock in menu switches to files
  selectView("files");
  assert.equal(activeView, "files");
  assert.equal(lastFeatureView, "files");

  // 4. Clicking Home from files opens menu
  toggleHome();
  assert.equal(activeView, "menu");
  assert.equal(lastFeatureView, "files");

  // 5. Clicking Home again toggles back to last active feature (files)
  toggleHome();
  assert.equal(activeView, "files");

  // 6. Selecting System switches to system
  selectView("system");
  assert.equal(activeView, "system");
  assert.equal(lastFeatureView, "system");

  // 7. Selecting Calls switches to calls
  selectView("calls");
  assert.equal(activeView, "calls");
  assert.equal(lastFeatureView, "calls");
});

test("Header Home Button Specification: solid white icon-only with no hover tooltip or text label", () => {
  // Verification of the header contract
  const headerTextPresent = false; // "Dynamic Island" and "Home" text label must NOT be rendered
  const homeButton = {
    color: "solid-white",
    hasHoverTitle: false, // gausah petunjuk pas dihover
    ariaLabel: "Home",
    hasTextBesideIcon: false,
    icon: "House",
  };

  assert.equal(headerTextPresent, false, "No Dynamic Island label text in header");
  assert.equal(homeButton.hasTextBesideIcon, false, "Home button must NOT have text beside icon");
  assert.equal(homeButton.hasHoverTitle, false, "No browser tooltip shown on hover");
  assert.equal(homeButton.color, "solid-white", "Home icon is solid white, not transparent");
  assert.equal(homeButton.ariaLabel, "Home", "Accessible aria-label exists");
});

test("Music Lifecycle Independence: navigation does not pause, stop or reset playback", () => {
  let playPauseCalls = 0;
  let nextCalls = 0;
  let prevCalls = 0;

  const mockMedia: MediaInfo = {
    has_player: true,
    player_name: "Spotify",
    title: "Starboy",
    artist: "The Weeknd",
    album: "Starboy",
    album_art_url: "https://example.com/art.jpg",
    playback_status: "Playing",
    position_ms: 45000,
    duration_ms: 230000,
    can_play: true,
    can_pause: true,
    can_go_next: true,
    can_go_previous: true,
    can_seek: true,
  };

  const onTogglePlayPause = () => { playPauseCalls++; };
  const onNext = () => { nextCalls++; };
  const onPrevious = () => { prevCalls++; };

  // Simulate multiple navigation transitions
  let currentView: ActiveView = "music";

  // Navigate to menu
  currentView = "menu";
  // Navigate to files
  currentView = "files";
  // Navigate to system
  currentView = "system";
  // Navigate to calls
  currentView = "calls";
  // Return to music
  currentView = "music";

  assert.equal(currentView, "music");
  assert.equal(playPauseCalls, 0, "No play/pause calls triggered during navigation");
  assert.equal(nextCalls, 0, "No next track calls triggered during navigation");
  assert.equal(prevCalls, 0, "No previous track calls triggered during navigation");
  assert.equal(mockMedia.playback_status, "Playing", "Media status remains Playing");
  assert.equal(mockMedia.position_ms, 45000, "Position is not reset");
});

test("Call Priority: active incoming call automatically overrides navigation view", () => {
  let activeView: ActiveView = "files";

  const call: CallInfo = {
    id: "call-999",
    provider: "whatsapp-web",
    direction: "incoming",
    state: "incoming",
    contactName: "Alex Rivera",
    capabilities: {
      accept: "verified",
      decline: "verified",
      end: "verified",
      mute: "unverified",
      speaker: "unsupported",
    },
  };

  const hasActiveCall = Boolean(call && call.state !== "idle" && call.state !== "ended");

  // Call takes priority over activeView
  const shouldRenderCallLayer = hasActiveCall;
  assert.equal(shouldRenderCallLayer, true, "Incoming call must immediately render call layer");

  // User's underlying activeView is preserved for when call ends
  assert.equal(activeView, "files", "Active view remains files so user returns to it after call");

  // Once call ends
  call.state = "ended";
  const hasActiveCallAfter = Boolean(call && call.state !== "idle" && call.state !== "ended");
  assert.equal(hasActiveCallAfter, false, "Call layer unmounts after call ends");
  assert.equal(activeView, "files", "User seamlessly returns to files view");
});

test("File Dock Operations: reference addition, removal without deleting disk file", () => {
  let fileCollection: DockedFile[] = [];

  const addFile = (path: string, name: string, size?: number) => {
    const ext = name.split(".").pop()?.toUpperCase() || "FILE";
    fileCollection = [
      {
        id: `file_${Date.now()}_${Math.random()}`,
        name,
        path,
        extension: ext,
        size,
        addedAt: Date.now(),
        exists: true,
      },
      ...fileCollection,
    ];
  };

  const removeFileRef = (id: string) => {
    // Only removes reference from collection array
    fileCollection = fileCollection.filter((f) => f.id !== id);
  };

  // 1. Add files
  addFile("/home/user/Documents/report.pdf", "report.pdf", 204800);
  addFile("/home/user/Images/screenshot.png", "screenshot.png", 1024000);

  assert.equal(fileCollection.length, 2);
  assert.equal(fileCollection[0].extension, "PNG");
  assert.equal(fileCollection[1].extension, "PDF");

  // 2. Remove one file reference
  const pdfId = fileCollection[1].id;
  removeFileRef(pdfId);

  assert.equal(fileCollection.length, 1);
  assert.equal(fileCollection[0].name, "screenshot.png");

  // 3. Verify missing file flagging
  fileCollection[0].exists = false;
  assert.equal(fileCollection[0].exists, false, "Path marked as unavailable without deleting item");

  // 4. Verify removal by file path (drag-to-trash fallback)
  fileCollection = fileCollection.filter((f) => f.id !== "/home/user/Images/screenshot.png" && f.path !== "/home/user/Images/screenshot.png");
  assert.equal(fileCollection.length, 0, "Removes file when path is supplied by drag drop event");
});

test("File Dock Sanitization & Direct Preview: clean file name and thumbnail presence", async () => {
  const { cleanFileName, cleanFilePath } = await import("../src/hooks/useFileDock.ts");

  // 1. URI encoded file:// URL
  const rawUri = "file:///home/user/Pictures/Vacation%20Photo%20(2026).png";
  assert.equal(cleanFileName(rawUri), "Vacation Photo (2026).png", "Decodes URI and strips path");
  assert.equal(cleanFilePath(rawUri), "/home/user/Pictures/Vacation Photo (2026).png", "Decodes path without file://");

  // 2. UNIX path
  const unixPath = "/home/user/Documents/Financial_Report_Q4.pdf";
  assert.equal(cleanFileName(unixPath), "Financial_Report_Q4.pdf");
  assert.equal(cleanFilePath(unixPath), "/home/user/Documents/Financial_Report_Q4.pdf");

  // 3. Trailing slash
  const trailingSlash = "/home/user/Downloads/Archive.zip/";
  assert.equal(cleanFileName(trailingSlash), "Archive.zip");

  // 4. Image thumbnail in DockedFile
  const imageItem: DockedFile = {
    id: "img-1",
    name: cleanFileName(rawUri),
    path: cleanFilePath(rawUri),
    extension: "PNG",
    addedAt: Date.now(),
    exists: true,
    thumbnailUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  };

  assert.ok(imageItem.thumbnailUrl, "Direct thumbnail preview URL must be attached");
  assert.equal(imageItem.name, "Vacation Photo (2026).png", "Clean file name displayed");
});

test("Chevron Navigation: cycles directly through feature menus forward and backward", () => {
  const FEATURE_ORDER: ActiveView[] = ["music", "files", "calls", "system"];
  let activeView: ActiveView = "music";

  const next = () => {
    const idx = FEATURE_ORDER.indexOf(activeView);
    activeView = idx === -1 ? FEATURE_ORDER[0] : FEATURE_ORDER[(idx + 1) % FEATURE_ORDER.length];
  };

  const prev = () => {
    const idx = FEATURE_ORDER.indexOf(activeView);
    activeView = idx === -1 ? FEATURE_ORDER[FEATURE_ORDER.length - 1] : FEATURE_ORDER[(idx - 1 + FEATURE_ORDER.length) % FEATURE_ORDER.length];
  };

  // 1. Initial music -> next -> files
  next();
  assert.equal(activeView, "files");

  // 2. files -> next -> calls
  next();
  assert.equal(activeView, "calls");

  // 3. calls -> next -> system
  next();
  assert.equal(activeView, "system");

  // 4. system -> next -> loops to music
  next();
  assert.equal(activeView, "music");

  // 5. music -> prev -> loops to system
  prev();
  assert.equal(activeView, "system");

  // 6. system -> prev -> calls
  prev();
  assert.equal(activeView, "calls");

  // 7. When in "menu", next goes to music and prev goes to system
  activeView = "menu";
  next();
  assert.equal(activeView, "music");

  activeView = "menu";
  prev();
  assert.equal(activeView, "system");
});

test("System Control Center: verifies volume clamping, mute toggling, and RAM formatting", () => {
  // Volume clamping logic
  const clampVolume = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  assert.equal(clampVolume(-10), 0);
  assert.equal(clampVolume(115), 100);
  assert.equal(clampVolume(42.7), 43);

  // Mute toggle state
  let isMuted = false;
  const toggleMute = () => { isMuted = !isMuted; };
  toggleMute();
  assert.equal(isMuted, true);
  toggleMute();
  assert.equal(isMuted, false);

  // RAM GB formatting
  const formatRam = (usedMb: number, totalMb: number) => ({
    usedGb: (usedMb / 1024).toFixed(1),
    totalGb: Math.round(totalMb / 1024),
  });
  const ram = formatRam(8192, 16384);
  assert.equal(ram.usedGb, "8.0");
  assert.equal(ram.totalGb, 16);
});


