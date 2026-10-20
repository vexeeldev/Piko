import React from "react";
import { CallInfo } from "../types";
import { IncomingCallView } from "./IncomingCallView";
import { ActiveCallView } from "./ActiveCallView";
import { OutgoingCallView } from "./OutgoingCallView";

interface CallsViewProps {
  call: CallInfo | null;
  onAnswer: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
}

export const CallsView: React.FC<CallsViewProps> = ({
  call,
  onAnswer,
  onDecline,
  onEndCall,
  onToggleMute,
}) => {
  const hasActiveCall = Boolean(call && call.state !== "idle" && call.state !== "ended");

  if (hasActiveCall && call) {
    if (call.direction === "incoming" && (call.state === "incoming" || call.state === "answering")) {
      return (
        <div className="w-full h-[128px] flex items-center justify-center">
          <IncomingCallView
            call={call}
            onAnswer={onAnswer}
            onDecline={onDecline}
            onToggleMute={onToggleMute}
          />
        </div>
      );
    }

    if (call.direction === "outgoing" && call.state !== "active") {
      return (
        <div className="w-full h-[128px] flex items-center justify-center">
          <OutgoingCallView call={call} onEndCall={onEndCall} />
        </div>
      );
    }

    return (
      <div className="w-full h-[128px] flex items-center justify-center">
        <ActiveCallView call={call} onEndCall={onEndCall} onToggleMute={onToggleMute} />
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between w-full h-[128px] p-1 select-none text-[#F5F5F5]">
      {/* Status banner */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[12px] font-semibold text-white tracking-tight">
            Call Bridge Service
          </span>
        </div>
        <span className="text-[10.5px] text-[#71717A] font-mono">Port 39871</span>
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-2 gap-2 my-auto">
        <div className="flex items-center gap-2.5 p-2 rounded-[10px] bg-white/[0.03] border border-white/[0.06]">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-bold">
            WA
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11.5px] font-medium text-white truncate">WhatsApp Web</span>
            <span className="text-[10px] text-[#A1A1AA]">Ready for calls</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-[10px] bg-white/[0.03] border border-white/[0.06]">
          <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[11px] font-bold">
            TG
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11.5px] font-medium text-white truncate">Telegram Web</span>
            <span className="text-[10px] text-[#A1A1AA]">Ready for calls</span>
          </div>
        </div>
      </div>

      <div className="text-center text-[10.5px] text-[#71717A]">
        Incoming calls pop up with swipe & button controls automatically
      </div>
    </div>
  );
};

