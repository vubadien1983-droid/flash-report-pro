import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Video, Square, RefreshCw, SwitchCamera, Check, RotateCcw, Mic, MicOff, Upload } from 'lucide-react';
import {
  pickRecorderMime, recordedFilename, formatDuration, readVideoInfo,
  RECORD_VIDEO_BPS, RECORD_AUDIO_BPS, MAX_RECORD_SECONDS, canRecordVideo,
} from '../services/videoMedia';

/**
 * Record a video straight from the device camera — v3.33.0
 *
 * Phone: the back camera by default, with a switch to the front one.
 * Laptop: the webcam. Live preview, a running clock, auto-stop at
 * MAX_RECORD_SECONDS, then a review screen (play it back, Use or Retake).
 *
 * The clip is recorded AT the storage budget (RECORD_VIDEO_BPS, 720p), so it
 * never has to be re-encoded afterwards — that is the whole reason this is
 * an in-app recorder and not the phone's own camera app, which records at
 * 15-40 MB a minute.
 *
 * When the camera cannot be opened (permission refused, no camera, an http://
 * page) the window says why and offers the phone's own camera / a file
 * instead, through `onFallbackFile` — those go through the normal compress
 * path.
 *
 * onDone(file, {duration, poster}) is called with a File; onClose() always.
 */
export default function VideoRecorderModal({ isOpen, onClose, onDone, onFallbackFile }) {
  const liveRef = useRef(null);
  const reviewRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const partsRef = useRef([]);
  const tickRef = useRef(null);
  const startedAtRef = useRef(0);
  const fallbackInputRef = useRef(null);

  const [facing, setFacing] = useState('environment');
  const [withSound, setWithSound] = useState(true);
  const [phase, setPhase] = useState('starting'); // starting | ready | recording | review | error
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState(null);        // { blob, url, mime }
  const [hasManyCameras, setHasManyCameras] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async () => {
    stopStream();
    setError('');
    setPhase('starting');
    if (!canRecordVideo()) {
      setError(window.isSecureContext === false
        ? 'The camera only works on a secure (https://) page.'
        : 'This browser cannot record video here.');
      setPhase('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: withSound,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        liveRef.current.play().catch(() => {});
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHasManyCameras(devices.filter((d) => d.kind === 'videoinput').length > 1);
      } catch { /* ignore */ }
      setPhase('ready');
    } catch (err) {
      const name = err?.name || '';
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access was refused. Allow the camera (and microphone) for this site in the browser settings, then try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera was found on this device.'
          : name === 'NotReadableError'
          ? 'The camera is being used by another app. Close it and try again.'
          : `The camera could not be opened (${err?.message || name || 'unknown error'}).`
      );
      setPhase('error');
    }
  }, [facing, withSound, stopStream]);

  // Open on show, release on hide — the camera light must never stay on.
  useEffect(() => {
    if (!isOpen) return undefined;
    setClip(null);
    setElapsed(0);
    openCamera();
    return () => {
      clearInterval(tickRef.current);
      try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch { /* ignore */ }
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, facing, withSound]);

  useEffect(() => () => { if (clip?.url) URL.revokeObjectURL(clip.url); }, [clip]);

  // The preview element is re-created after a Retake; re-attach the stream.
  useEffect(() => {
    const el = liveRef.current;
    if ((phase === 'ready' || phase === 'recording') && el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, [phase]);

  const stopRecording = useCallback(() => {
    clearInterval(tickRef.current);
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickRecorderMime((t) => window.MediaRecorder.isTypeSupported(t));
    let rec;
    try {
      rec = new window.MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORD_VIDEO_BPS,
        audioBitsPerSecond: RECORD_AUDIO_BPS,
      });
    } catch (err) {
      setError(`Recording could not start (${err?.message || err}).`);
      setPhase('error');
      return;
    }
    partsRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partsRef.current.push(e.data); };
    rec.onstop = () => {
      const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(partsRef.current, { type });
      stopStream();
      if (!blob.size) {
        setError('Nothing was recorded. Try again.');
        setPhase('error');
        return;
      }
      setClip({ blob, url: URL.createObjectURL(blob), mime: type, seconds: (Date.now() - startedAtRef.current) / 1000 });
      setPhase('review');
    };
    recRef.current = rec;
    rec.start(1000);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');
    tickRef.current = setInterval(() => {
      const s = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(s);
      if (s >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
  };

  const retake = () => {
    setClip(null);
    setElapsed(0);
    openCamera();
  };

  const useClip = async () => {
    if (!clip) return;
    const name = recordedFilename(clip.mime);
    const file = new File([clip.blob], name, { type: clip.mime });
    const info = await readVideoInfo(file);
    onDone?.(file, { duration: info.duration || clip.seconds, poster: info.poster });
    onClose?.();
  };

  if (!isOpen) return null;

  const left = Math.max(0, MAX_RECORD_SECONDS - elapsed);

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-950 flex flex-col text-white" onClick={(e) => e.stopPropagation()}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 bg-slate-900/90 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Video className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span className="text-sm font-bold truncate">Record video</span>
          {phase === 'recording' && (
            <span className="ml-1 inline-flex items-center gap-1.5 text-[12px] font-mono font-bold text-rose-300">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              {formatDuration(elapsed) || '0:00'} · {formatDuration(left) || '0:00'} left
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { stopRecording(); stopStream(); onClose?.(); }}
          title="Close"
          className="p-2 rounded-lg hover:bg-white/10"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black">
        {phase !== 'review' && (
          <video
            ref={liveRef}
            muted
            playsInline
            autoPlay
            className={`max-w-full max-h-full ${facing === 'user' ? '-scale-x-100' : ''} ${phase === 'error' ? 'hidden' : ''}`}
          />
        )}
        {phase === 'review' && clip && (
          <video ref={reviewRef} src={clip.url} controls autoPlay playsInline className="max-w-full max-h-full" />
        )}
        {phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/80 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin" /> Opening the camera…
          </div>
        )}
        {phase === 'error' && (
          <div className="max-w-sm text-center px-6 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <Video className="w-8 h-8 text-rose-300" />
            </div>
            <p className="text-[13.5px] text-white/85">{error}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={openCamera}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold inline-flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
              {onFallbackFile && (
                <button type="button" onClick={() => fallbackInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-sm font-bold inline-flex items-center gap-1.5">
                  <Upload className="w-4 h-4" /> Use the phone camera / a file
                </button>
              )}
            </div>
            <input
              ref={fallbackInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) { onFallbackFile?.(f); onClose?.(); }
              }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 bg-slate-900/90 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-6">
        {phase === 'review' ? (
          <>
            <button type="button" onClick={retake}
              className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-bold inline-flex items-center gap-2">
              <RotateCcw className="w-5 h-5" /> Retake
            </button>
            <button type="button" onClick={useClip}
              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-sm font-bold inline-flex items-center gap-2">
              <Check className="w-5 h-5" /> Use video
              {clip?.blob?.size ? <span className="font-normal text-white/80">({(clip.blob.size / 1048576).toFixed(1)} MB)</span> : null}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={phase === 'recording'}
              onClick={() => setWithSound((s) => !s)}
              title={withSound ? 'Sound on — tap to record without sound' : 'Sound off'}
              className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
            >
              {withSound ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            {phase === 'recording' ? (
              <button type="button" onClick={stopRecording} title="Stop"
                className="w-[4.5rem] h-[4.5rem] rounded-full border-4 border-white flex items-center justify-center">
                <Square className="w-7 h-7 fill-rose-500 text-rose-500" />
              </button>
            ) : (
              <button type="button" onClick={startRecording} disabled={phase !== 'ready'} title="Start recording"
                className="w-[4.5rem] h-[4.5rem] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30">
                <span className="w-12 h-12 rounded-full bg-rose-500" />
              </button>
            )}

            <button
              type="button"
              disabled={phase === 'recording' || !hasManyCameras}
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              title="Switch camera"
              className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
