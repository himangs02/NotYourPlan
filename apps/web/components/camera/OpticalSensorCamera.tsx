"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, AlertTriangle, Zap, Eye, ShieldAlert, Sparkles, RefreshCw, X, Radio } from "lucide-react";

interface OpticalSensorCameraProps {
  onEmergencyDetected?: (reason: string, intensity: number) => void;
  isFireActive?: boolean;
}

export default function OpticalSensorCamera({
  onEmergencyDetected,
  isFireActive = false,
}: OpticalSensorCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [hasWebcam, setHasWebcam] = useState(false);
  const [useSimulatedCCTV, setUseSimulatedCCTV] = useState(false);
  const [luminosity, setLuminosity] = useState(25);
  const [threshold, setThreshold] = useState(72);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [consecutiveSpikes, setConsecutiveSpikes] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize camera stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("getUserMedia not supported");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setHasWebcam(true);
        }
      } catch (err) {
        console.info("[OpticalSensorCamera] Live webcam unavailable, using Venue CCTV stream simulation:", err);
        setHasWebcam(false);
        setUseSimulatedCCTV(true);
      }
    }

    if (!useSimulatedCCTV) {
      initCamera();
    }

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [useSimulatedCCTV]);

  // Optical analysis loop (samples frame brightness)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    let simulatedTread = 28;

    const analyze = () => {
      animFrameRef.current = requestAnimationFrame(analyze);

      let currentLum = 25;

      if (hasWebcam && videoRef.current && ctx && canvas && videoRef.current.readyState === 4) {
        ctx.drawImage(videoRef.current, 0, 0, 48, 36);
        const imgData = ctx.getImageData(0, 0, 48, 36);
        const data = imgData.data;
        let sum = 0;
        const totalPixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
          // Standard ITU-R BT.601 perceptual luminance
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
        }

        const avg = sum / totalPixels;
        currentLum = Math.round((avg / 255) * 100);
      } else {
        // Simulated Venue CCTV Optical Noise
        simulatedTread += (Math.random() - 0.5) * 4;
        simulatedTread = Math.max(18, Math.min(42, simulatedTread));
        currentLum = Math.round(simulatedTread);
      }

      setLuminosity(currentLum);

      // Flash detection threshold evaluation
      if (currentLum >= threshold) {
        setConsecutiveSpikes((prev) => {
          const next = prev + 1;
          if (next >= 3 && !alertTriggered) {
            setAlertTriggered(true);
            setAlertCount((c) => c + 1);
            onEmergencyDetected?.(
              `Sudden intense optical flash detected at CCTV Sensor 01 (${currentLum}% luminance exceeding ${threshold}% threshold)`,
              currentLum
            );
          }
          return next;
        });
      } else {
        setConsecutiveSpikes(0);
      }
    };

    analyze();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hasWebcam, threshold, alertTriggered, onEmergencyDetected]);

  const handleSimulateFlash = () => {
    setLuminosity(98);
    setAlertTriggered(true);
    setAlertCount((c) => c + 1);
    onEmergencyDetected?.(
      "SIMULATED HIGH-INTENSITY OPTICAL FLASH / FIRE HAZARD FLARE AT CCTV-01 (98% LUMINANCE)",
      98
    );
  };

  const handleDismissAlert = () => {
    setAlertTriggered(false);
  };

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3 backdrop-blur">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} width={48} height={36} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <h3 className="font-semibold text-xs text-white flex items-center gap-1.5">
              CCTV Optical Sensor
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                CAM-01
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              {hasWebcam ? "Live Camera Video Feed" : "3D Venue CCTV Staging Stream"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setUseSimulatedCCTV((p) => !p)}
            title="Toggle between real Webcam and simulated 3D Venue CCTV feed"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">{hasWebcam ? "CCTV Sim" : "Webcam"}</span>
          </button>
          <button
            onClick={() => setIsMinimized((p) => !p)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isMinimized ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Alert Banner when light spike trips alarm */}
      {alertTriggered && (
        <div className="p-2.5 rounded-lg bg-rose-950/90 border border-rose-600 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg shadow-rose-900/30 animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
            <div>
              <div className="font-bold text-[11px] text-white">EMERGENCY OPTICAL FLASH DETECTED</div>
              <div className="text-[10px] font-mono text-rose-300">
                Light flare spiked to {luminosity}% (Threshold: {threshold}%)
              </div>
            </div>
          </div>
          <button
            onClick={handleDismissAlert}
            className="text-xs px-2 py-0.5 rounded bg-rose-900 hover:bg-rose-800 text-white font-medium shrink-0"
          >
            Acknowledge
          </button>
        </div>
      )}

      {!isMinimized && (
        <>
          {/* Video Preview & Overlay */}
          <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
            {hasWebcam ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Simulated CCTV Static Scanlines */}
                <div className="absolute inset-0 opacity-15 pointer-events-none bg-[repeating-linear-gradient(0deg,#000,#000_2px,transparent_2px,transparent_4px)]" />

                <div className="text-center space-y-1 relative z-10">
                  <Radio className="w-8 h-8 text-cyan-400 mx-auto animate-pulse" />
                  <div className="text-xs font-mono font-bold text-slate-200">
                    VENUE HIGH-ANGLE CCTV #1
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    AUDITORIUM ROOF &amp; ROAD 17 SECTOR
                  </div>
                </div>

                {/* Simulated Flash Flare Effect */}
                {luminosity > 70 && (
                  <div className="absolute inset-0 bg-white/40 animate-ping pointer-events-none" />
                )}
              </div>
            )}

            {/* Live CCTV HUD Stamp */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-emerald-400 border border-emerald-900/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE · REC
            </div>

            <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-slate-300 border border-slate-800">
              {new Date().toLocaleTimeString()}
            </div>

            {/* Luminosity Overlay Gauge on Video */}
            <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 backdrop-blur p-2 rounded-lg border border-slate-800 flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Optical Intensity:
                </span>
                <span
                  className={`font-bold ${
                    luminosity >= threshold
                      ? "text-rose-400 animate-pulse"
                      : luminosity >= 50
                      ? "text-amber-400"
                      : "text-cyan-400"
                  }`}
                >
                  {luminosity}% {luminosity >= threshold && "⚠ FLARE / SPIKE"}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  style={{ width: `${Math.min(100, luminosity)}%` }}
                  className={`h-full transition-all duration-100 ${
                    luminosity >= threshold
                      ? "bg-gradient-to-r from-amber-500 to-rose-500"
                      : "bg-gradient-to-r from-cyan-500 to-emerald-500"
                  }`}
                />
                {/* Threshold Marker Pin */}
                <div
                  style={{ left: `${threshold}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-sm"
                  title={`Alarm Threshold: ${threshold}%`}
                />
              </div>
            </div>
          </div>

          {/* Controls: Threshold slider & Manual simulation button */}
          <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="text-slate-400">Trigger Threshold:</span>
              <span className="font-mono font-bold text-slate-200">{threshold}% light intensity</span>
            </div>
            <input
              type="range"
              min={40}
              max={95}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <p className="text-[9px] text-slate-500 font-mono">
              Shining a flashlight or bright light toward the camera trips the alarm.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSimulateFlash}
                className="flex-1 py-1.5 px-2.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                ⚡ Simulate Light Flare Flash
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
