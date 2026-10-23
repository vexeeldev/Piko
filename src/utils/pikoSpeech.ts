import { isTauri, invoke } from "@tauri-apps/api/core";
import type { MediaInfo, BatteryInfo, SystemStats } from "../types.ts";

export interface PikoMessage {
  id: number;
  text: string;
  category: "greeting" | "media" | "battery" | "poke" | "system";
}

export const PIKO_POKE_PHRASES: string[] = [
  "Hehe, that tickles! What are we working on today?",
  "Boop! Piko is fully charged and ready to roll!",
  "Hi bestie! You're doing incredible work today!",
  "Beep boop! Don't forget to take a sip of water!",
  "Piko is always happy when you poke me!",
  "Checking in! Everything looking good on your end?",
  "Aww, thanks for saying hi! Keep up the great pace!",
  "Yay! Double tap, high five! Let's conquer the day!",
  "I'm right here cheering for you, one click at a time!",
  "All systems running super smooth and fast!",
];

export const PIKO_IDLE_PHRASES: string[] = [
  "Watching your cursor fly across the screen like magic!",
  "Just admiring your setup from up here on the Dynamic Island~",
  "Take a deep breath and relax your shoulders for a second!",
  "Hmm, what exciting project are we building right now?",
  "Piko is on duty! Scanning for good vibes and high productivity!",
  "Remember to blink and rest your eyes for a moment!",
  "The Dynamic Island is super cozy today!",
  "La la la~ Loving the rhythm of your workflow!",
  "Everything is humming smoothly under the hood!",
  "You're making great progress! Keep going!",
];

// Sequential order trackers: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, then loop back from the top
let pokeSequenceIndex = 0;
let idleSequenceIndex = 0;

export function resetPhraseIndices(): void {
  pokeSequenceIndex = 0;
  idleSequenceIndex = 0;
}

export function getContextualPhrase(
  _media?: MediaInfo,
  battery?: BatteryInfo,
  _stats?: SystemStats,
  isAutonomous: boolean = false
): string {
  if (battery && battery.has_battery && !battery.is_charging && battery.percentage <= 20) {
    return `Battery is at ${battery.percentage}%. Time to plug in the charger! 🪫`;
  }

  // Sequential progression: 1 -> 2 -> ... -> 10 -> loop back to top
  if (isAutonomous) {
    const phrase = PIKO_IDLE_PHRASES[idleSequenceIndex % PIKO_IDLE_PHRASES.length];
    idleSequenceIndex = (idleSequenceIndex + 1) % PIKO_IDLE_PHRASES.length;
    return phrase;
  } else {
    const phrase = PIKO_POKE_PHRASES[pokeSequenceIndex % PIKO_POKE_PHRASES.length];
    pokeSequenceIndex = (pokeSequenceIndex + 1) % PIKO_POKE_PHRASES.length;
    return phrase;
  }
}

/**
 * Speak text clearly with AI Edge TTS (en-US-EmmaNeural)
 * Harsh synthesizer fallbacks (like espeak) and harsh oscillator beeps are completely eliminated.
 */
export function speakPikoTTS(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): () => void {
  onStart?.();

  // 1. Desktop Tauri Environment: Native edge-tts en-US-EmmaNeural AI model
  if (isTauri()) {
    invoke("speak_text", { text }).catch((err) => {
      console.warn("Failed to invoke speak_text in Tauri:", err);
    });
  } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
    // 2. Browser Environment: Only speak if a natural/non-robotic voice is available
    try {
      window.speechSynthesis.cancel();

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) =>
          !v.name.toLowerCase().includes("espeak") &&
          (v.name.includes("Emma") ||
            v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Microsoft"))
      );

      // Never use harsh robotic espeak synthesizers
      if (naturalVoice) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = naturalVoice;
        utterance.lang = "en-US";
        utterance.pitch = 1.05;
        utterance.rate = 1.05;

        utterance.onend = () => onEnd?.();
        utterance.onerror = () => onEnd?.();

        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Ignore
    }
  }

  // Duration proportional to words (approx 160 wpm ~ 375ms per word + 800ms buffer)
  const words = text.split(/\s+/).length;
  const durationMs = Math.max(3200, words * 400 + 800);

  const timer = setTimeout(() => {
    onEnd?.();
  }, durationMs);

  return () => {
    clearTimeout(timer);
    if (isTauri()) {
      invoke("cancel_speech").catch(() => {});
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  };
}
