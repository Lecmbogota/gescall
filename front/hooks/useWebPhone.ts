import { useState, useEffect, useRef } from 'react';
import { UA, WebSocketInterface } from 'jssip';

export function useWebPhone(extension?: string, password?: string, wsUrl?: string) {
  const [ua, setUa] = useState<UA | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'register_failed' | 'registered' | 'calling' | 'incall'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [callerId, setCallerId] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  useEffect(() => {
    const ext = extension != null ? String(extension).trim() : '';
    const pass = password != null ? String(password).trim() : '';
    if (!ext || !pass || !wsUrl) return;

    setError(null);

    const socket = new WebSocketInterface(wsUrl);
    const configuration = {
      sockets: [socket],
      uri: `sip:${ext}@${wsUrl.split('/')[2].split(':')[0]}`,
      password: pass,
      authorization_user: ext,
      register: true
    };

    const newUa = new UA(configuration);

    newUa.on('connecting', () => setStatus('connecting'));
    newUa.on('connected', () => setStatus('connected'));
    newUa.on('disconnected', () => setStatus('disconnected'));
    newUa.on('registered', () => {
      setError(null);
      setStatus('registered');
    });
    newUa.on('registrationFailed', (e) => {
      console.error('Registration failed:', e?.cause || 'unknown');
      setError('Error de registro SIP');
      setStatus('register_failed');
    });

    newUa.on('newRTCSession', (e) => {
      const newSession = e.session;
      
      newSession.on('progress', () => setStatus('calling'));
      const setAudioStream = () => {
        const stream = newSession.connection?.getReceivers().find(r => r.track?.kind === 'audio')?.track;
        if (stream && audioRef.current) {
          const currentStream = audioRef.current.srcObject as MediaStream;
          if (!currentStream || currentStream.getTracks()[0] !== stream) {
            audioRef.current.srcObject = new MediaStream([stream]);
            audioRef.current.play().catch(console.error);
          }
        }
      };

      newSession.on('confirmed', () => {
        setStatus('incall');
        setAudioStream();
      });

      const cleanupMedia = () => {
        if (newSession.connection) {
          const senders = newSession.connection.getSenders();
          senders.forEach(sender => {
            if (sender.track) {
              sender.track.stop();
            }
          });
        }
        if (audioRef.current && audioRef.current.srcObject) {
          const stream = audioRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          audioRef.current.srcObject = null;
        }
      };

      if (newSession.connection) {
        newSession.connection.addEventListener('track', setAudioStream);
        setAudioStream(); // Check immediately for incoming calls
      }
      newSession.on('ended', () => {
        cleanupMedia();
        setSession(null);
        setStatus('registered');
      });
      newSession.on('failed', () => {
        cleanupMedia();
        setSession(null);
        setStatus('registered');
      });

      if (e.originator === 'remote') {
        const remoteId = newSession.remote_identity?.uri?.user || 'Desconocido';
        setCallerId(remoteId);

        // Handle incoming call - auto answer for agents
        setSession(newSession);
        setStatus('calling');
        
        // Auto-answer almost immediately
        setTimeout(() => {
          newSession.answer({
            mediaConstraints: { audio: true, video: false }
          });
          setStatus('incall');
        }, 500);
      }
    });

    newUa.start();
    setUa(newUa);

    return () => {
      newUa.stop();
    };
  }, [extension, password, wsUrl]);

  const call = (target: string) => {
    if (ua && target) {
      const eventHandlers = {
        progress: () => setStatus('calling'),
        confirmed: () => setStatus('incall'),
        ended: () => { setSession(null); setStatus('registered'); },
        failed: () => { setSession(null); setStatus('registered'); }
      };
      
      const options = {
        eventHandlers,
        mediaConstraints: { audio: true, video: false }
      };
      
      const newSession = ua.call(`sip:${target}@${wsUrl!.split('/')[2].split(':')[0]}`, options);
      setSession(newSession as any);
    }
  };

  const answer = () => {
    if (session) {
      session.answer({
        mediaConstraints: { audio: true, video: false }
      });
    }
  };

  const hangup = () => {
    if (session) {
      if (session.connection) {
        session.connection.getSenders().forEach((s: any) => {
          if (s.track) s.track.stop();
        });
      }
      if (audioRef.current && audioRef.current.srcObject) {
        (audioRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        audioRef.current.srcObject = null;
      }
      session.terminate();
      setSession(null);
      setStatus('registered');
    }
  };

  const mute = (isMuted: boolean) => {
    if (session) {
      if (isMuted) session.mute();
      else session.unmute();
    }
  };

  return { status, error, call, answer, hangup, mute, session, audioRef, callerId };
}
