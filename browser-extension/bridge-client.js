/**
 * Local Bridge Client Module
 *
 * Communicates with the local Dynamic Island Rust server at 127.0.0.1:14425
 * using HTTP JSON endpoints secured with the random session token.
 */

const DEFAULT_BRIDGE_TOKEN = "18dfda7461531687002609595a17c011";

class DynamicIslandBridgeClient {
  constructor() {
    this.baseUrl = "http://127.0.0.1:14425";
    this.token = DEFAULT_BRIDGE_TOKEN;
    this.isConnected = false;
    this.pollAbortController = null;
  }

  async loadToken() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get(["bridgeToken", "bridgePort"]);
        this.token = data.bridgeToken || DEFAULT_BRIDGE_TOKEN;
        if (data.bridgePort) {
          this.baseUrl = `http://127.0.0.1:${data.bridgePort}`;
        }
      }
    } catch (_) {
      this.token = DEFAULT_BRIDGE_TOKEN;
    }
    return this.token || DEFAULT_BRIDGE_TOKEN;
  }

  async setToken(token, port = 14425) {
    this.token = token.trim();
    this.baseUrl = `http://127.0.0.1:${port}`;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({
        bridgeToken: this.token,
        bridgePort: port,
      });
    }
  }

  getHeaders() {
    return {
      "Content-Type": "application/json",
      "X-Dynamic-Island-Token": this.token || "",
    };
  }

  async checkHealth() {
    if (!this.token) await this.loadToken();
    if (!this.token) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  async sendEvent(eventData) {
    if (!this.token) await this.loadToken();
    if (!this.token) {
      console.warn("[DI-Content] Cannot send call event: Bridge token not configured.");
      return false;
    }

    try {
      console.log("[DI-Content] Sending call event to local bridge:", {
        id: eventData.id,
        state: eventData.state,
        provider: eventData.provider,
        direction: eventData.direction,
      });
      const res = await fetch(`${this.baseUrl}/api/call/event`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(eventData),
      });
      console.log("[DI-Content] Bridge event response status:", res.status, res.statusText);
      return res.ok;
    } catch (err) {
      console.warn("[DI-Content] Failed to send call event to local bridge:", err.message);
      return false;
    }
  }

  async pollAction() {
    if (!this.token) await this.loadToken();
    if (!this.token) return null;

    try {
      this.pollAbortController = new AbortController();
      const res = await fetch(`${this.baseUrl}/api/call/action`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: this.pollAbortController.signal,
      });

      if (res.status === 204) {
        return null; // No pending actions
      }

      if (res.status === 200) {
        return await res.json();
      }

      return null;
    } catch (err) {
      if (err.name === "AbortError") return null;
      return null;
    }
  }

  async sendAck(actionId, callId, status, detail = "") {
    if (!this.token) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/call/ack`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          action_id: actionId,
          call_id: callId,
          status,
          detail,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async sendDisconnect() {
    if (!this.token) return;

    try {
      await fetch(`${this.baseUrl}/api/call/disconnect`, {
        method: "POST",
        headers: this.getHeaders(),
        keepalive: true,
      });
    } catch {
      // Ignored on unload
    }
  }

  stopPolling() {
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }
}

const globalScope =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
    ? window
    : this;

globalScope.DynamicIslandBridgeClient = DynamicIslandBridgeClient;

