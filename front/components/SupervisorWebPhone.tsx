import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useWebPhone } from "@/hooks/useWebPhone";

export function SupervisorWebPhone() {
  const { session } = useAuthStore();
  const sipExtension = (session?.user as any)?.sip_extension;
  const sipPassword = (session?.user as any)?.sip_password;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${window.location.hostname}/ws`;

  const { audioRef, status, hangup } = useWebPhone(sipExtension, sipPassword, wsUrl);

  // Expose methods via window for easy access from other components
  useEffect(() => {
    const handleHangupRequest = () => {
      if (status === 'incall' || status === 'calling') {
        hangup();
      }
    };
    
    // Update global status so UI knows if we are spying
    (window as any)._supervisorCallStatus = status;
    
    window.addEventListener('supervisor:hangup', handleHangupRequest);
    return () => {
      window.removeEventListener('supervisor:hangup', handleHangupRequest);
      (window as any)._supervisorCallStatus = undefined;
    };
  }, [status, hangup]);

  // Mantenemos esto invisible, su único propósito es auto-contestar llamadas de Spy/Whisper
  return (
    <audio
      ref={audioRef}
      autoPlay
      className="hidden"
      style={{ display: "none" }}
    />
  );
}
