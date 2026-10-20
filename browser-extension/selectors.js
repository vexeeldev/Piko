/**
 * WhatsApp Web DOM Selectors Module
 *
 * WhatsApp Web frequently updates its obfuscated CSS class names, so selectors
 * rely primarily on stable attributes:
 * - data-testid
 * - data-icon
 * - role="dialog" / role="region"
 * - aria-label (case-insensitive fallback)
 * - structural hierarchy
 */

const WhatsAppSelectors = {
  // Modal container for incoming or active calls
  callModal: [
    'div[data-testid="call-modal"]',
    'div[data-testid="audio-call-modal"]',
    'div[data-testid="video-call-modal"]',
    'div[data-testid*="call" i]',
    'div[role="dialog"][aria-label*="call" i]',
    'div[role="dialog"][aria-label*="panggilan" i]',
    'div[role="dialog"]',
    'div[role="alertdialog"]',
    'div[data-animate-modal-popup="true"]',
    'div[class*="call" i]',
  ],

  // Answer / Accept incoming call button
  answerButton: [
    'button[data-testid="audio-call-accept"]',
    'button[data-testid="video-call-accept"]',
    'button[data-testid*="call-accept" i]',
    'button[data-testid*="accept-call" i]',
    'button[data-testid*="accept" i]',
    'div[role="button"][data-testid*="accept" i]',
    '[data-icon="phone-call"]',
    '[data-icon="audio-call"]',
    '[data-icon="video-call"]',
    '[data-icon="phone"]',
    'button[aria-label*="Accept" i]',
    'button[aria-label*="Answer" i]',
    'button[aria-label*="Terima" i]',
    'button[aria-label*="Jawab" i]',
    '[role="button"][aria-label*="Accept" i]',
    '[role="button"][aria-label*="Answer" i]',
    '[role="button"][aria-label*="Terima" i]',
    '[role="button"][aria-label*="Jawab" i]',
  ],

  // Decline / Reject incoming call button
  declineButton: [
    'button[data-testid="audio-call-decline"]',
    'button[data-testid="video-call-decline"]',
    'button[data-testid*="call-decline" i]',
    'button[data-testid*="decline-call" i]',
    'button[data-testid*="decline" i]',
    'button[data-testid*="reject" i]',
    'div[role="button"][data-testid*="decline" i]',
    'button[aria-label*="Decline" i]',
    'button[aria-label*="Reject" i]',
    'button[aria-label*="Tolak" i]',
    '[role="button"][aria-label*="Decline" i]',
    '[role="button"][aria-label*="Reject" i]',
    '[role="button"][aria-label*="Tolak" i]',
    '[data-icon="x"]',
    '[data-icon="x-alt"]',
  ],

  // End active call button (hang up)
  endCallButton: [
    'button[data-testid="audio-call-end"]',
    'button[data-testid="video-call-end"]',
    'button[data-testid="call-end-button"]',
    'button[data-testid*="call-end" i]',
    'button[data-testid*="end-call" i]',
    '[data-icon="phone-call-end"]',
    '[data-icon="call-end"]',
    'button[aria-label*="End call" i]',
    'button[aria-label*="Akhiri" i]',
    'button[aria-label*="Tutup" i]',
    'button[aria-label*="Hang up" i]',
    'div[role="button"][data-testid*="end" i]',
    '[role="button"][aria-label*="End" i]',
  ],

  // Mute microphone button
  muteButton: [
    'button[data-testid="audio-call-mute"]',
    'button[data-testid*="mute" i]',
    'button[data-icon="mic-off"]',
    'button[data-icon="microphone-off"]',
    '[data-icon="mic-off"]',
    '[data-icon="microphone-off"]',
    'button[aria-label*="Mute" i]',
    'button[aria-label*="Bisukan" i]',
  ],

  // Caller Contact Name
  contactName: [
    'div[data-testid="call-modal"] span[title]',
    'div[data-testid="call-modal"] h2',
    'div[role="dialog"] span[title]',
    'div[role="dialog"] h2',
    'div[data-testid="call-modal"] div[dir="auto"]',
    'div[role="dialog"] div[dir="auto"]',
    'span[title]',
    'h2',
    'div[dir="auto"]',
  ],

  // Caller Profile Picture / Avatar
  avatarImg: [
    'div[data-testid="call-modal"] img[src*="whatsapp.net"]',
    'div[role="dialog"] img[src*="whatsapp.net"]',
    'div[data-testid="call-modal"] img',
    'div[role="dialog"] img',
    'img[src*="whatsapp.net"]',
    'img[src*="blob:"]',
  ],

  // Active call duration indicator element
  callDuration: [
    'div[data-testid="call-modal"] span[data-testid="call-timer"]',
    'div[role="dialog"] span[data-testid="call-timer"]',
    'div[data-testid="call-modal"] span[dir="auto"]',
    'span[data-testid="call-timer"]',
  ],
};

// Helper: Query first matching element from selector candidates list
function findFirstElement(selectors, parent = document) {
  if (!parent) return null;
  for (const selector of selectors) {
    try {
      const el = parent.querySelector(selector);
      if (el) {
        const clickable = el.closest('button, [role="button"], a, [tabindex="0"]');
        return clickable || el;
      }
    } catch {
      // Ignore invalid selector syntax
    }
  }
  return null;
}

// Helper: Robust multi-stage call button resolver with color and SVG fallbacks
function findCallButton(actionType, parent = document) {
  const root = parent || document;

  // Stage 1: Standard selector match
  let targetSelectors = [];
  if (actionType === "accept") targetSelectors = WhatsAppSelectors.answerButton;
  else if (actionType === "decline") targetSelectors = WhatsAppSelectors.declineButton;
  else if (actionType === "end") targetSelectors = WhatsAppSelectors.endCallButton;
  else if (actionType === "mute") targetSelectors = WhatsAppSelectors.muteButton;

  const standardBtn = findFirstElement(targetSelectors, root);
  if (standardBtn) return standardBtn;

  // Stage 2: Color and SVG icon fallback within dialog / call container
  const candidates = root.querySelectorAll('button, [role="button"], [tabindex="0"], div[class*="button" i]');
  for (const el of candidates) {
    try {
      const text = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor || "";

      if (actionType === "accept") {
        // Look for accept/terima/jawab keywords
        if (text.includes("accept") || text.includes("answer") || text.includes("terima") || text.includes("jawab")) {
          return el;
        }
        // Green background button (WhatsApp green #00a884, #25d366, rgb(0, 168, 132), etc.)
        if (bg.includes("0, 168, 132") || bg.includes("37, 211, 102") || bg.includes("34, 197, 94")) {
          return el;
        }
      } else if (actionType === "decline") {
        // Look for decline/reject/tolak keywords
        if (text.includes("decline") || text.includes("reject") || text.includes("tolak")) {
          return el;
        }
        // Red background button (#ea0038, #ef4444, rgb(234, 0, 56), etc.)
        if (bg.includes("234, 0, 56") || bg.includes("239, 68, 68") || bg.includes("220, 38, 38")) {
          return el;
        }
      }
    } catch (_) {}
  }

  return null;
}

// Helper: Dispatches full mouse event chain to trigger React 18 synthetic listeners reliably
function robustClick(element) {
  if (!element) return false;
  try {
    element.focus();
  } catch (_) {}

  const mouseEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  for (const eventName of mouseEvents) {
    try {
      const evt = new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 1,
      });
      element.dispatchEvent(evt);
    } catch (_) {}
  }

  try {
    if (typeof element.click === "function") {
      element.click();
    }
  } catch (_) {}

  return true;
}

// Export to global scope for content script
window.WhatsAppSelectors = WhatsAppSelectors;
window.findFirstElement = findFirstElement;
window.findCallButton = findCallButton;
window.robustClick = robustClick;

