/**
 * WhatsApp Web Main World Call Interceptor
 *
 * Runs directly in WhatsApp Web page context (MAIN world) to intercept:
 * 1. ServiceWorkerRegistration.prototype.showNotification (Brave/Chrome call notifications)
 * 2. window.Notification (Standard notifications)
 * 3. Dispatches detected incoming calls to the content script via window.postMessage
 * 4. Executes actions (accept, decline, end) by interacting with notification objects or tab
 */

(() => {
  if (window.__dynamicIslandInterceptorLoaded) return;
  window.__dynamicIslandInterceptorLoaded = true;

  console.log("[DI-Interceptor] WhatsApp Web Main World Interceptor active.");

  function isMissedCallNotification(title, options = {}) {
    const text = (String(title || "") + " " + String(options.body || "")).toLowerCase();
    return (
      text.includes("missed") ||
      text.includes("terlewat") ||
      text.includes("tak terjawab") ||
      text.includes("tidak terjawab")
    );
  }

  function isCallNotification(title, options = {}) {
    if (isMissedCallNotification(title, options)) return false;

    const titleStr = String(title || "").toLowerCase();
    const bodyStr = String(options.body || "").toLowerCase();
    const actions = Array.isArray(options.actions) ? options.actions : [];

    const hasCallKeyword =
      titleStr.includes("call") ||
      titleStr.includes("panggilan") ||
      bodyStr.includes("call") ||
      bodyStr.includes("panggilan") ||
      bodyStr.includes("voice") ||
      bodyStr.includes("video");

    const hasCallActions = actions.some((a) => {
      const act = String(a.action || "").toLowerCase();
      const actTitle = String(a.title || "").toLowerCase();
      return (
        act.includes("accept") ||
        act.includes("decline") ||
        act.includes("answer") ||
        act.includes("terima") ||
        act.includes("tolak") ||
        actTitle.includes("accept") ||
        actTitle.includes("decline") ||
        actTitle.includes("answer") ||
        actTitle.includes("terima") ||
        actTitle.includes("tolak")
      );
    });

    return hasCallKeyword || hasCallActions;
  }

  let isRingtonePlaying = false;

  function notifyExtension(title, options = {}) {
    const contactName = String(title || "").trim() || "WhatsApp Caller";
    const avatarUrl = options.icon || options.badge || options.image || null;

    console.log("[DI-Interceptor] Incoming call notification captured:", {
      contactName,
      body: options.body,
    });

    window.postMessage(
      {
        type: "DI_INCOMING_CALL_NOTIFICATION",
        contactName,
        body: options.body || "Incoming call",
        avatarUrl,
        hasAccept: true,
        hasDecline: true,
        tag: options.tag || null,
      },
      "*"
    );
  }

  // 1. Intercept ServiceWorkerRegistration.prototype.showNotification (where call actions live)
  if (
    typeof ServiceWorkerRegistration !== "undefined" &&
    ServiceWorkerRegistration.prototype &&
    ServiceWorkerRegistration.prototype.showNotification
  ) {
    const origShowNotification = ServiceWorkerRegistration.prototype.showNotification;
    ServiceWorkerRegistration.prototype.showNotification = function (...args) {
      try {
        const title = args[0];
        const options = args[1] || {};
        if (isMissedCallNotification(title, options)) {
          console.log("[DI-Interceptor] Missed call notification detected, ending call");
          window.postMessage({ type: "DI_CALL_ENDED", reason: "missed_call" }, "*");
        } else if (isCallNotification(title, options)) {
          notifyExtension(title, options);
        }
      } catch (err) {
        console.warn("[DI-Interceptor] showNotification inspection error:", err);
      }
      return origShowNotification.apply(this, args);
    };
  }

  // 2. Wrap window.Notification with transparent Proxy to preserve maxActions and avoid Illegal invocation
  if (typeof window.Notification !== "undefined") {
    const OrigNotification = window.Notification;
    try {
      window.Notification = new Proxy(OrigNotification, {
        get(target, prop, receiver) {
          if (prop === "maxActions") return OrigNotification.maxActions;
          if (prop === "permission") return OrigNotification.permission;
          const val = Reflect.get(target, prop, receiver);
          return typeof val === "function" ? val.bind(target) : val;
        },
        construct(target, args) {
          try {
            const title = args[0];
            const options = args[1] || {};
            if (isMissedCallNotification(title, options)) {
              window.postMessage({ type: "DI_CALL_ENDED", reason: "missed_call" }, "*");
            } else if (isCallNotification(title, options)) {
              notifyExtension(title, options);
            }
          } catch (err) {
            console.warn("[DI-Interceptor] Notification inspection error:", err);
          }
          return Reflect.construct(target, args, OrigNotification);
        },
      });
    } catch (_) {
      // Keep native Notification untouched if Proxy fails
    }
  }

  // 3. Intercept HTMLAudioElement.prototype.play & pause to detect incoming call ringtone
  if (typeof HTMLAudioElement !== "undefined" && HTMLAudioElement.prototype && HTMLAudioElement.prototype.play) {
    const origPlay = HTMLAudioElement.prototype.play;
    const origPause = HTMLAudioElement.prototype.pause;

    HTMLAudioElement.prototype.play = function () {
      try {
        const src = String(this.currentSrc || this.src || "").toLowerCase();
        // WhatsApp Web ringtones play continuously with loop=true or have audio sources
        if (this.loop || src.includes("ringtone") || src.includes("call") || (src.includes("blob:") && this.loop)) {
          isRingtonePlaying = true;
          console.log("[DI-Interceptor] WhatsApp ringtone audio started playing:", { src, loop: this.loop });
          const cleanedTitle = document.title.replace(/\(\d+\)\s*/, "").replace(/whatsapp/i, "").trim();
          notifyExtension(cleanedTitle || "WhatsApp Caller", {
            body: "Incoming voice call",
          });
        }
      } catch (err) {
        console.warn("[DI-Interceptor] Audio play inspection error:", err);
      }
      return origPlay.apply(this, arguments);
    };

    HTMLAudioElement.prototype.pause = function () {
      try {
        if (this.loop || isRingtonePlaying) {
          isRingtonePlaying = false;
          console.log("[DI-Interceptor] WhatsApp ringtone audio paused (call remains active in Dynamic Island)");
        }
      } catch (_) {}
      return origPause.apply(this, arguments);
    };
  }

  // 4. Helper: Dispatch mouse event sequence to trigger React synthetic handlers
  function triggerClick(element) {
    if (!element) return false;
    try { element.focus(); } catch (_) {}
    const mouseEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    for (const name of mouseEvents) {
      try {
        element.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
      } catch (_) {}
    }
    try {
      if (typeof element.click === "function") element.click();
    } catch (_) {}
    return true;
  }

  // 5. Helper: Find decline button directly in MAIN world DOM
  function findDeclineButton() {
    const selectors = [
      'button[data-testid*="decline" i]',
      'button[data-testid*="reject" i]',
      'button[data-testid*="audio-call-decline" i]',
      'button[data-testid*="video-call-decline" i]',
      'div[role="button"][data-testid*="decline" i]',
      'button[aria-label*="Decline" i]',
      'button[aria-label*="Reject" i]',
      'button[aria-label*="Tolak" i]',
      'button[aria-label*="Tutup" i]',
      'button[aria-label*="Batal" i]',
      '[role="button"][aria-label*="Decline" i]',
      '[role="button"][aria-label*="Reject" i]',
      '[role="button"][aria-label*="Tolak" i]',
      '[data-icon="x"]',
      '[data-icon="x-alt"]',
      '[data-icon="phone-call-end"]',
      '[data-icon="call-end"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const btn = el.closest('button, [role="button"]') || el;
        return btn;
      }
    }
    // Check all dialogs for red button or non-green button in 2-button modal
    const dialogs = document.querySelectorAll('div[role="dialog"], div[role="alertdialog"], div[data-testid*="call" i]');
    for (const dialog of dialogs) {
      const buttons = dialog.querySelectorAll('button, [role="button"], [tabindex="0"]');
      for (const b of buttons) {
        const style = window.getComputedStyle(b);
        const bg = style.backgroundColor || "";
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        if (
          bg.includes("234, 0, 56") ||
          bg.includes("239, 68, 68") ||
          bg.includes("220, 38, 38") ||
          aria.includes("tolak") ||
          aria.includes("decline") ||
          aria.includes("reject")
        ) {
          return b;
        }
      }
      // If 2 buttons in call dialog, the one that is not green is decline
      if (buttons.length === 2) {
        for (const b of buttons) {
          const bg = window.getComputedStyle(b).backgroundColor || "";
          if (!bg.includes("0, 168, 132") && !bg.includes("37, 211, 102") && !bg.includes("34, 197, 94")) {
            return b;
          }
        }
      }
    }
    return null;
  }

  // 6. Listen for commands from content.js (accept, decline, end)
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.type !== "DI_EXECUTE_ACTION") return;
    const { action } = event.data;
    console.log("[DI-Interceptor] Received action execution request from content script:", action);

    if (action === "accept") {
      try {
        window.focus();
      } catch (_) {}

      // Try finding accept button in main world
      const acceptSelectors = [
        'button[data-testid*="accept" i]',
        'button[data-testid*="answer" i]',
        'button[data-testid*="audio-call-accept" i]',
        'button[data-testid*="video-call-accept" i]',
        'div[role="button"][data-testid*="accept" i]',
        'button[aria-label*="Accept" i]',
        'button[aria-label*="Answer" i]',
        'button[aria-label*="Terima" i]',
        'button[aria-label*="Jawab" i]',
        '[data-icon="phone-call"]',
        '[data-icon="audio-call"]',
        '[data-icon="phone"]',
      ];
      for (const sel of acceptSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const btn = el.closest('button, [role="button"]') || el;
          triggerClick(btn);
          break;
        }
      }

      // Dismiss the notification if active
      if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              if (isCallNotification(n.title, n)) {
                n.close();
              }
            });
          });
        });
      }
    } else if (action === "decline") {
      console.log("[DI-Interceptor] Executing hard decline across DOM, Audio, and Notification...");

      // 1. Immediately silence and pause all ringtones playing in the page
      try {
        const audios = document.querySelectorAll("audio");
        audios.forEach((a) => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch (_) {}
        });
      } catch (_) {}

      // 2. Click in-page decline button if present
      const declineBtn = findDeclineButton();
      if (declineBtn) {
        console.log("[DI-Interceptor] Successfully clicked decline button in MAIN world");
        triggerClick(declineBtn);
      } else {
        // Retry for up to 1.5 seconds in main world
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const btn = findDeclineButton();
          if (btn) {
            console.log(`[DI-Interceptor] Found and clicked decline button in MAIN world on attempt ${attempts}`);
            triggerClick(btn);
            clearInterval(interval);
          } else if (attempts >= 15) {
            clearInterval(interval);
          }
        }, 100);
      }

      // 3. Check WhatsApp internal Call model in Store
      try {
        if (window.Store && window.Store.Call) {
          const calls = window.Store.Call.getModelsArray
            ? window.Store.Call.getModelsArray()
            : window.Store.Call.models || [];
          for (const c of calls) {
            console.log("[DI-Interceptor] Invoking WhatsApp Store.Call reject/end method");
            if (typeof c.reject === "function") c.reject();
            else if (typeof c.rejectCall === "function") c.rejectCall();
            else if (typeof c.end === "function") c.end();
          }
        }
      } catch (err) {
        console.warn("[DI-Interceptor] Store.Call rejection attempt error:", err);
      }

      // 4. Dismiss any active notification
      if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              if (isCallNotification(n.title, n)) {
                n.close();
              }
            });
          });
        });
      }
    }
  });
})();

