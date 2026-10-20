/**
 * Dynamic Island - Extension Background Service Worker
 *
 * Runs in extension background context with host permissions for 127.0.0.1:14425.
 * Bypasses webpage Mixed Content, Brave Shields, and Private Network Access limitations.
 */

importScripts("bridge-client.js");

const bridge = new DynamicIslandBridgeClient();
let actionPollIntervalId = null;

// Keep token refreshed from storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.bridgeToken || changes.bridgePort)) {
    bridge.loadToken();
  }
});

// Start action polling loop
function startBackgroundActionPolling() {
  if (actionPollIntervalId) return;

  actionPollIntervalId = setInterval(async () => {
    try {
      const actionItem = await bridge.pollAction();
      if (!actionItem) return;

      console.log("[DI-Background] Action received from desktop bridge:", actionItem.action);

      // Find WhatsApp Web tabs
      const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
      if (tabs.length === 0) {
        await bridge.sendAck(actionItem.action_id, actionItem.call_id, "tab_not_found", "No WhatsApp Web tab found");
        return;
      }

      const targetTab = tabs.find((t) => t.active) || tabs[0];

      // Store current active tab so we can restore focus if user is declining in background
      let previousTabId = null;
      let previousWindowId = null;
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id !== targetTab.id) {
          previousTabId = activeTab.id;
          previousWindowId = activeTab.windowId;
        }
      } catch (_) {}

      // Bring WhatsApp Web tab into focus so call modal is mounted in DOM
      try {
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
          await chrome.windows.update(targetTab.windowId, { focused: true });
        }
      } catch (_) {}

      // Forward action to content script in WhatsApp Web tab
      chrome.tabs.sendMessage(targetTab.id, {
        type: "DI_TRIGGER_ACTION",
        actionItem,
      });

      // If user declined from background, restore previous tab/window after click processes
      if (actionItem.action === "decline" && previousTabId) {
        setTimeout(async () => {
          try {
            await chrome.tabs.update(previousTabId, { active: true });
            if (previousWindowId) {
              await chrome.windows.update(previousWindowId, { focused: true });
            }
          } catch (_) {}
        }, 600);
      }
    } catch (err) {
      console.warn("[DI-Background] Error in background action poll:", err);
    }
  }, 350);
}

function stopBackgroundActionPolling() {
  if (actionPollIntervalId) {
    clearInterval(actionPollIntervalId);
    actionPollIntervalId = null;
  }
  bridge.stopPolling();
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case "DI_SEND_CALL_EVENT": {
      console.log("[DI-Background] Forwarding call event to desktop bridge:", message.data);
      bridge.sendEvent(message.data).then((ok) => {
        sendResponse({ ok });
        if (ok && message.data.state === "incoming") {
          startBackgroundActionPolling();
        } else if (message.data.state === "ended") {
          stopBackgroundActionPolling();
        }
      });
      return true; // Keep sendResponse asynchronous
    }

    case "DI_CHECK_HEALTH": {
      bridge.checkHealth().then((ok) => {
        sendResponse({ ok, tokenLoaded: Boolean(bridge.token) });
      });
      return true;
    }

    case "DI_SEND_ACK": {
      const { actionId, callId, status, detail } = message;
      bridge.sendAck(actionId, callId, status, detail || "").then((ok) => {
        sendResponse({ ok });
      });
      return true;
    }

    case "DI_STOP_POLLING": {
      stopBackgroundActionPolling();
      sendResponse({ ok: true });
      return false;
    }
  }
});

