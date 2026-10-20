import { useState, useEffect, useCallback, useRef } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CallInfo } from "../types";

// Helper to normalize both camelCase and snake_case payloads from Rust bridge
function normalizeCallPayload(raw: unknown): CallInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.id || !r.provider || !r.state || !r.direction) return null;

  return {
    id: String(r.id),
    provider: r.provider as CallInfo["provider"],
    direction: r.direction as CallInfo["direction"],
    state: r.state as CallInfo["state"],
    contactName: (r.contactName as string) || (r.contact_name as string) || null,
    avatarUrl: (r.avatarUrl as string) || (r.avatar_url as string) || null,
    startedAt: typeof r.startedAt === "number" ? r.startedAt : typeof r.started_at === "number" ? r.started_at : null,
    isMuted: typeof r.isMuted === "boolean" ? r.isMuted : typeof r.is_muted === "boolean" ? r.is_muted : false,
    capabilities: (r.capabilities as CallInfo["capabilities"]) || {
      accept: "unverified",
      decline: "unverified",
      end: "unverified",
      mute: "unsupported",
      speaker: "unsupported",
    },
    error: (r.error as string) || null,
  };
}

export function useCallData() {
  const [call, setCall] = useState<CallInfo | null>(null);
  const endTimeoutRef = useRef<number | null>(null);

  const clearEndTimeout = useCallback(() => {
    if (endTimeoutRef.current !== null) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
  }, []);

  // Listen to Tauri call events from local bridge if running in desktop app
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenFn: (() => void) | null = null;
    listen<unknown>("call-state-changed", (event) => {
      clearEndTimeout();
      const normalized = normalizeCallPayload(event.payload);

      console.log("[DI-Frontend] Call event received by useCallData:", {
        hasPayload: Boolean(event.payload),
        id: normalized?.id,
        state: normalized?.state,
        provider: normalized?.provider,
        direction: normalized?.direction,
        contactName: normalized?.contactName,
      });

      if (!normalized || normalized.state === "idle" || normalized.state === "ended") {
        if (normalized?.state === "ended") {
          setCall(normalized);
          endTimeoutRef.current = window.setTimeout(() => {
            setCall(null);
            endTimeoutRef.current = null;
          }, 1500);
        } else {
          setCall(null);
        }
      } else {
        setCall(normalized);
      }
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch((err) => {
      console.warn("[DI-Frontend] Failed to listen to call-state-changed:", err);
    });

    return () => {
      clearEndTimeout();
      if (unlistenFn) unlistenFn();
    };
  }, [clearEndTimeout]);

  // Answer call action: requests provider adapter to answer
  const answerCall = useCallback(async () => {
    if (!call || call.state !== "incoming") return;

    // Transition to answering state while waiting for provider confirmation
    setCall((prev) =>
      prev ? { ...prev, state: "answering", error: null } : null
    );

    const isMock = call.id.startsWith("mock-");

    // If in Tauri desktop app and call is from real bridge, invoke native call bridge command
    if (isTauri() && !isMock) {
      try {
        await invoke("bridge_call_action", {
          callId: call.id,
          action: "accept",
        });
      } catch (err: unknown) {
        console.error("bridge_call_action accept error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setCall((prev) =>
          prev
            ? {
                ...prev,
                state: "incoming",
                error: `Failed to answer: ${errMsg}`,
              }
            : null
        );
      }
    } else {
      // In web/mock test mode: simulate provider confirmation after 600ms
      setTimeout(() => {
        setCall((prev) =>
          prev && prev.state === "answering"
            ? {
                ...prev,
                state: "active",
                startedAt: Date.now(),
                error: null,
              }
            : prev
        );
      }, 600);
    }
  }, [call]);

  // Decline call action: requests provider adapter to decline
  const declineCall = useCallback(async () => {
    if (!call) return;

    const isMock = call.id.startsWith("mock-");

    if (isTauri() && !isMock) {
      try {
        await invoke("bridge_call_action", {
          callId: call.id,
          action: "decline",
        });
      } catch (err: unknown) {
        console.error("bridge_call_action decline error:", err);
      }
    }

    setCall((prev) => (prev ? { ...prev, state: "ended" } : null));
    clearEndTimeout();
    endTimeoutRef.current = window.setTimeout(() => {
      setCall(null);
      endTimeoutRef.current = null;
    }, 1200);
  }, [call, clearEndTimeout]);

  // End active call action
  const endCall = useCallback(async () => {
    if (!call) return;

    setCall((prev) => (prev ? { ...prev, state: "ending" } : null));

    if (isTauri()) {
      try {
        await invoke("bridge_call_action", {
          callId: call.id,
          action: "end",
        });
      } catch (err: unknown) {
        console.error("bridge_call_action end error:", err);
      }
    }

    setCall((prev) => (prev ? { ...prev, state: "ended" } : null));
    clearEndTimeout();
    endTimeoutRef.current = window.setTimeout(() => {
      setCall(null);
      endTimeoutRef.current = null;
    }, 1200);
  }, [call, clearEndTimeout]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (!call || call.capabilities.mute === "unsupported") return;

    const nextMute = !call.isMuted;
    setCall((prev) => (prev ? { ...prev, isMuted: nextMute } : null));

    if (isTauri()) {
      try {
        await invoke("bridge_call_action", {
          callId: call.id,
          action: nextMute ? "mute" : "unmute",
        });
      } catch (err) {
        console.error("bridge_call_action mute error:", err);
      }
    }
  }, [call]);

  // --- MOCK TESTING HELPERS ---
  const triggerMockIncomingCall = useCallback(
    (options?: Partial<CallInfo>) => {
      clearEndTimeout();
      setCall({
        id: `mock-${Date.now()}`,
        provider: options?.provider || "whatsapp-web",
        direction: "incoming",
        state: "incoming",
        contactName: options?.contactName || "Sarah Jenkins",
        avatarUrl:
          options?.avatarUrl ||
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
        startedAt: null,
        capabilities: {
          accept: "verified",
          decline: "verified",
          end: "verified",
          mute: "verified",
          speaker: "unsupported",
          ...options?.capabilities,
        },
        error: null,
      });
    },
    [clearEndTimeout]
  );

  const triggerMockOutgoingCall = useCallback(
    (options?: Partial<CallInfo>) => {
      clearEndTimeout();
      setCall({
        id: `mock-${Date.now()}`,
        provider: options?.provider || "telegram-web",
        direction: "outgoing",
        state: "incoming", // initial calling state
        contactName: options?.contactName || "Alex Rivera",
        avatarUrl:
          options?.avatarUrl ||
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        startedAt: null,
        capabilities: {
          accept: "unsupported",
          decline: "unsupported",
          end: "verified",
          mute: "verified",
          speaker: "unsupported",
          ...options?.capabilities,
        },
        error: null,
      });
    },
    [clearEndTimeout]
  );

  const triggerMockCallEnded = useCallback(() => {
    setCall((prev) => (prev ? { ...prev, state: "ended" } : null));
    clearEndTimeout();
    endTimeoutRef.current = window.setTimeout(() => {
      setCall(null);
      endTimeoutRef.current = null;
    }, 1000);
  }, [clearEndTimeout]);

  return {
    call,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    // Testing mock triggers
    triggerMockIncomingCall,
    triggerMockOutgoingCall,
    triggerMockCallEnded,
  };
}
