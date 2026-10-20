/**
 * WhatsApp Web Content Script
 *
 * Runs inside web.whatsapp.com to detect call states and execute
 * answer / decline / end actions with status verification.
 */

(() => {
  if (window.__dynamicIslandInitialized) return;
  window.__dynamicIslandInitialized = true;

  console.log("[DI-Content] WhatsApp Web call observer loaded.");

  // Fallback injection of main-world interceptor into page context if needed
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("main-world-interceptor.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (_) {}

  const bridge = new window.DynamicIslandBridgeClient();
  let currentCall = null;
  let pollIntervalId = null;
  let debounceCheckTimer = null;
  let callExpirationTimer = null;

  function clearCallExpirationTimer() {
    if (callExpirationTimer) {
      clearTimeout(callExpirationTimer);
      callExpirationTimer = null;
    }
  }

  function resetCallExpirationTimer() {
    clearCallExpirationTimer();
    // 40 second auto-timeout if call is neither answered nor dismissed
    callExpirationTimer = setTimeout(() => {
      if (currentCall && currentCall.state === "incoming") {
        console.log("[DI-Content] Call timed out after 40s with no answer, ending call");
        const endedCall = { ...currentCall, state: "ended" };
        sendCallEventToBridge(endedCall);
        currentCall = null;
        stopActionPolling();
      }
    }, 40000);
  }

  function sendCallEventToBridge(callData) {
    console.log("[DI-Content] Dispatching call event to desktop bridge:", { id: callData.id, state: callData.state });
    let sentViaWorker = false;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: "DI_SEND_CALL_EVENT",
            data: callData,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              console.warn("[DI-Content] Background bridge send failed, falling back to direct fetch:", chrome.runtime.lastError.message);
              bridge.sendEvent(callData);
            } else {
              console.log("[DI-Content] Call event sent to bridge via background service worker:", res?.ok);
            }
          }
        );
        sentViaWorker = true;
      }
    } catch (err) {
      console.warn("[DI-Content] Runtime context invalidated, dispatching directly to bridge:", err?.message);
    }

    if (!sentViaWorker) {
      bridge.sendEvent(callData);
    }
  }

  // Listen for actions received by background service worker
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "DI_TRIGGER_ACTION" && message.actionItem) {
        console.log("[DI-Content] Received action from background worker:", message.actionItem.action);
        executeAction(message.actionItem);
      }
    });
  }

  // Listen for intercepted notifications from MAIN world (captures background/toast calls)
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === "DI_INCOMING_CALL_NOTIFICATION") {
      const contactName = event.data.contactName || "WhatsApp Caller";
      const avatarUrl = event.data.avatarUrl || null;
      console.log("[DI-Content] Call detected via Web Notification:", contactName);

      const now = Date.now();
      const isStale = currentCall && (now - (currentCall.createdAt || 0)) > 3000;

      if (!currentCall || currentCall.state !== "incoming" || isStale) {
        const callId = `wa-${now}`;
        currentCall = {
          id: callId,
          createdAt: now,
          provider: "whatsapp-web",
          direction: "incoming",
          state: "incoming",
          contactName: contactName,
          avatarUrl: avatarUrl,
          startedAt: null,
          isMuted: false,
          capabilities: {
            accept: "verified",
            decline: "verified",
            end: "verified",
            mute: "unverified",
            speaker: "unsupported",
          },
        };
        sendCallEventToBridge(currentCall);
        startActionPolling();
        resetCallExpirationTimer();
      }
    } else if (event.data.type === "DI_CALL_ENDED") {
      if (currentCall && currentCall.state !== "ended") {
        console.log("[DI-Content] Call ended detected from page context:", event.data.type, event.data.reason || "");
        const endedCall = { ...currentCall, state: "ended" };
        sendCallEventToBridge(endedCall);
        currentCall = null;
        stopActionPolling();
        clearCallExpirationTimer();
      }
    }
  });

  // Initialize token and check bridge health via background service worker
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "DI_CHECK_HEALTH" }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[DI-Content] Background service worker initialization pending:", chrome.runtime.lastError.message);
      } else if (res?.ok) {
        console.log("[DI-Content] Connected to local desktop bridge on 127.0.0.1 via background worker.");
      } else if (!res?.tokenLoaded) {
        console.info("[DI-Content] Bridge session token not configured. Please set token in extension popup.");
      } else {
        console.warn("[DI-Content] Desktop app bridge not reachable on 127.0.0.1. Ensure Dynamic Island is running.");
      }
    });
  } else {
    bridge.loadToken().then((token) => {
      if (token) {
        bridge.checkHealth().then((ok) => {
          if (ok) {
            console.log("[DI-Content] Connected to local desktop bridge on 127.0.0.1.");
          }
        });
      }
    });
  }

  // Extract contact name from modal or document
  function extractContactName(modalEl) {
    const root = modalEl || document;
    const el = window.findFirstElement(window.WhatsAppSelectors.contactName, root);
    if (!el) return null;
    return el.getAttribute("title") || el.textContent?.trim() || null;
  }

  // Extract avatar URL from modal or document
  function extractAvatarUrl(modalEl) {
    const root = modalEl || document;
    const img = window.findFirstElement(window.WhatsAppSelectors.avatarImg, root);
    if (!img) return null;
    const src = img.getAttribute("src");
    return src && (src.startsWith("http") || src.startsWith("blob:")) ? src : null;
  }

  // Detect current call state in DOM
  function inspectCallDOM() {
    // 1. Search for interactive call controls anywhere in document
    let modal = window.findFirstElement(window.WhatsAppSelectors.callModal, document);
    const answerBtn = window.findFirstElement(window.WhatsAppSelectors.answerButton, modal || document);
    const declineBtn = window.findFirstElement(window.WhatsAppSelectors.declineButton, modal || document);
    const endBtn = window.findFirstElement(window.WhatsAppSelectors.endCallButton, modal || document);

    // If modal container was not matched by specific class/role, infer from button context
    if (!modal && (answerBtn || declineBtn || endBtn)) {
      const anchor = answerBtn || declineBtn || endBtn;
      modal =
        anchor.closest('div[role="dialog"], div[role="alertdialog"], div[data-animate-modal-popup], div[class*="popup"], div[class*="modal"]') ||
        anchor.parentElement;
    }

    // If no call controls or modal present
    if (!modal && !answerBtn && !endBtn) {
      // Only end if we previously had an ACTIVE call that disappeared from DOM
      // (Incoming calls may exist solely in notification/background and must not be ended here)
      if (currentCall && currentCall.state === "active") {
        console.log("[DI-Content] Active call UI disappeared from DOM: call ended.");
        const endedCall = {
          ...currentCall,
          state: "ended",
        };
        sendCallEventToBridge(endedCall);
        currentCall = null;
        stopActionPolling();
        clearCallExpirationTimer();
      }
      return;
    }

    const contactName = extractContactName(modal) || "WhatsApp Caller";
    const avatarUrl = extractAvatarUrl(modal);

    // 1. Incoming Call State: Answer button is present
    if (answerBtn) {
      if (!currentCall || currentCall.state !== "incoming") {
        const callId = `wa-${Date.now()}`;
        console.log("[DI-Content] Call dialog detected in WhatsApp Web: incoming call from", contactName);
        currentCall = {
          id: callId,
          provider: "whatsapp-web",
          direction: "incoming",
          state: "incoming",
          contactName: contactName,
          avatarUrl: avatarUrl,
          startedAt: null,
          isMuted: false,
          capabilities: {
            accept: "verified",
            decline: declineBtn ? "verified" : "unverified",
            end: "verified",
            mute: "unverified",
            speaker: "unsupported",
          },
        };
        sendCallEventToBridge(currentCall);
        startActionPolling();
      }
      return;
    }

    // 2. Active Call State: End call button present, no answer button
    if (endBtn && !answerBtn) {
      if (!currentCall || currentCall.state !== "active") {
        console.log("[DI-Content] Call dialog detected in WhatsApp Web: active call with", contactName);
        const startedAt = currentCall?.startedAt || currentCall?.started_at || Date.now();
        const callId = currentCall?.id || `wa-${Date.now()}`;
        currentCall = {
          id: callId,
          provider: "whatsapp-web",
          direction: currentCall?.direction || "incoming",
          state: "active",
          contactName: contactName,
          avatarUrl: avatarUrl,
          startedAt: startedAt,
          isMuted: false,
          capabilities: {
            accept: "verified",
            decline: "verified",
            end: "verified",
            mute: "unverified",
            speaker: "unsupported",
          },
        };
        sendCallEventToBridge(currentCall);
        startActionPolling();
      }
      return;
    }
  }

  // Action polling loop while a call is active or incoming
  function startActionPolling() {
    if (pollIntervalId) return;

    pollIntervalId = window.setInterval(async () => {
      const actionItem = await bridge.pollAction();
      if (!actionItem) return;

      console.log("[DynamicIsland] Received user action from desktop:", actionItem.action);
      await executeAction(actionItem);
    }, 350);
  }

  function stopActionPolling() {
    if (pollIntervalId) {
      window.clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    bridge.stopPolling();
  }

  // Execute action against real DOM elements with active polling retry
  async function executeAction(actionItem) {
    const action = actionItem.action;
    console.log(`[DI-Content] Executing ${action} action requested from desktop...`);

    // Notify MAIN world interceptor
    window.postMessage({ type: "DI_EXECUTE_ACTION", action }, "*");

    let clicked = false;
    const maxAttempts = 30; // 30 * 100ms = 3.0 seconds polling window
    const intervalMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const modal = window.findFirstElement(window.WhatsAppSelectors.callModal, document);
      const root = modal || document;

      let btn = null;
      if (typeof window.findCallButton === "function") {
        btn = window.findCallButton(action, root);
      } else {
        if (action === "accept") btn = window.findFirstElement(window.WhatsAppSelectors.answerButton, root);
        else if (action === "decline") btn = window.findFirstElement(window.WhatsAppSelectors.declineButton, root);
        else if (action === "end") btn = window.findFirstElement(window.WhatsAppSelectors.endCallButton, root);
        else if (action === "mute" || action === "unmute") btn = window.findFirstElement(window.WhatsAppSelectors.muteButton, root);
      }

      if (btn) {
        console.log(`[DI-Content] Successfully located ${action} button in DOM on attempt ${attempt + 1}, dispatching click`);
        if (typeof window.robustClick === "function") {
          window.robustClick(btn);
        } else {
          btn.click();
        }
        clicked = true;
        await bridge.sendAck(actionItem.action_id, actionItem.call_id, "executed", `Clicked ${action} button`);
        setTimeout(inspectCallDOM, 350);
        break;
      }

      // On first attempt, ensure window focus to prompt WhatsApp Web to mount call UI
      if (attempt === 0) {
        try { window.focus(); } catch (_) {}
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (!clicked) {
      console.warn(`[DI-Content] In-page ${action} button not located after ${maxAttempts} attempts`);
      if (action === "decline" && currentCall && currentCall.state === "incoming") {
        console.log("[DI-Content] Fallback declining call via bridge event");
        const endedCall = { ...currentCall, state: "ended" };
        sendCallEventToBridge(endedCall);
        currentCall = null;
        stopActionPolling();
        clearCallExpirationTimer();
      }
      await bridge.sendAck(actionItem.action_id, actionItem.call_id, "executed", `Dispatched ${action} via fallback`);
    }
  }

  // MutationObserver with debounce to monitor call modal appearance and changes
  const observer = new MutationObserver(() => {
    if (debounceCheckTimer) clearTimeout(debounceCheckTimer);
    debounceCheckTimer = setTimeout(() => {
      inspectCallDOM();
    }, 150);
  });

  function startDOMObserver() {
    try {
      const target = document.body || document.documentElement;
      if (target && typeof target === "object" && target.nodeType === 1) {
        observer.observe(target, {
          childList: true,
          subtree: true,
        });
        console.log("[DI-Content] MutationObserver active on:", target.nodeName);
      }
    } catch (err) {
      console.warn("[DI-Content] MutationObserver start error:", err);
    }
  }

  // Handle tab unload / close
  window.addEventListener("beforeunload", () => {
    if (currentCall) {
      bridge.sendDisconnect();
    }
  });

  // Start observation and initial inspection when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startDOMObserver();
      inspectCallDOM();
    });
  } else {
    startDOMObserver();
    inspectCallDOM();
  }
})();

