"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, AlertTriangle, Zap, Eye, ShieldAlert, Sparkles, RefreshCw, X, Radio, Video, CheckCircle2, Sliders } from "lucide-react";

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

  // States
  const [hasWebcam, setHasWebcam] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useSimulatedCCTV, setUseSimulatedCCTV] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const [luminosity, setLuminosity] = useState(25);
  const [ambientBaseline, setAmbientBaseline] = useState(25);
  const [threshold, setThreshold] = useState(65); // Trigger threshold (65%)
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  // Mutable refs for high-frequency animation loop
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const alertTriggeredRef = useRef(alertTriggered);
  alertTriggeredRef.current = alertTriggered;

  const onEmergencyDetectedRef = useRef(onEmergencyDetected);
  onEmergencyDetectedRef.current = onEmergencyDetected;

  const isArmedRef = useRef(false);
  const warmupFramesRef = useRef(0);
  const consecutiveSpikesRef = useRef(0);
  const ambientBaselineRef = useRef<number>(25);
  const lastStateUpdateRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset alert and re-arm when fire is extinguished/reset
  useEffect(() => {
    if (!isFireActive) {
      setAlertTriggered(false);
      alertTriggeredRef.current = false;
      consecutiveSpikesRef.current = 0;
    }
  }, [isFireActive]);

  // Connect Camera Stream
  const initCamera = useCallback(async () => {
    try {
      setCameraError(null);
      setIsArmed(false);
      isArmedRef.current = false;
      warmupFramesRef.current = 0;
      consecutiveSpikesRef.current = 0;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API (getUserMedia) not supported in this browser");
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((e) => console.warn("Video play error:", e));
        };
      }
      setHasWebcam(true);
      setUseSimulatedCCTV(false);
    } catch (err: any) {
      console.warn("[OpticalSensorCamera] Live webcam unavailable, switching to simulated mode:", err);
      setHasWebcam(false);
      setCameraError(err.message || "Camera access denied or unavailable");
      setUseSimulatedCCTV(true);
    }
  }, []);

  useEffect(() => {
    if (!useSimulatedCCTV) {
      initCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [useSimulatedCCTV, initCamera]);

  // Optical analysis loop (samples frame brightness and detects sudden flares/flash)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    let simulatedTread = 25;

    const analyze = () => {
      animFrameRef.current = requestAnimationFrame(analyze);

      let currentAvgLum = 25;
      let isTorchFlash = false;

      const video = videoRef.current;
      const isVideoReady = hasWebcam && video && (video.readyState >= 2 || video.videoWidth > 0);

      if (isVideoReady && ctx && canvas) {
        // Draw frame onto downscaled 64x48 canvas for fast pixel processing
        ctx.drawImage(video, 0, 0, 64, 48);
        const imgData = ctx.getImageData(0, 0, 64, 48);
        const data = imgData.data;
        const totalPixels = data.length / 4;

        let sum = 0;
        let saturatedPixels = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Perceptual luminance ITU-R BT.601
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += lum;

          if (lum > 225) { // Highly saturated white pixels (>88%)
            saturatedPixels++;
          }
        }

        currentAvgLum = Math.round((sum / totalPixels / 255) * 100);
        const saturatedRatio = saturatedPixels / totalPixels;

        // WARMUP & AMBIENT CALIBRATION PHASE (first ~45 frames / ~1.5s):
        // Allow camera sensor auto-exposure and room lighting to stabilize before arming.
        if (warmupFramesRef.current < 45) {
          warmupFramesRef.current++;
          // Fast initial baseline convergence
          ambientBaselineRef.current = ambientBaselineRef.current * 0.85 + currentAvgLum * 0.15;
          if (warmupFramesRef.current >= 45) {
            isArmedRef.current = true;
            setIsArmed(true);
          }
        } else {
          // NORMAL MONITORING PHASE:
          // Slow continuous drift for natural room lighting changes (0.5% per frame)
          const ambient = ambientBaselineRef.current;
          ambientBaselineRef.current = ambient * 0.995 + currentAvgLum * 0.005;
          const deltaSpike = currentAvgLum - ambient;

          // MOBILE TORCH FLASH TRIGGER LOGIC:
          // A mobile torch pointed at the camera causes an unmistakable, rapid jump:
          // 1. Sudden massive jump: delta >= +24% above ambient room baseline, AND total brightness >= 50%
          // 2. OR high direct flashlight beam saturation: >= 6% of pixels blown-out white AND delta >= +15%
          // 3. OR total average frame brightness hits or exceeds user-configured threshold (default 65%)
          const thresh = thresholdRef.current;
          const isHighSpike = deltaSpike >= 24 && currentAvgLum >= 50;
          const isDirectBeam = saturatedRatio >= 0.06 && deltaSpike >= 15 && currentAvgLum >= 45;
          const isOverThreshold = currentAvgLum >= thresh && deltaSpike >= 12;

          if (isHighSpike || isDirectBeam || isOverThreshold) {
            consecutiveSpikesRef.current++;
            // Require 2 consecutive frames to prevent single-frame sensor noise glitches
            if (consecutiveSpikesRef.current >= 2) {
              isTorchFlash = true;
            }
          } else {
            consecutiveSpikesRef.current = 0;
          }
        }
      } else {
        // Simulated Venue CCTV Mode
        simulatedTread += (Math.random() - 0.5) * 2;
        simulatedTread = Math.max(18, Math.min(32, simulatedTread));
        currentAvgLum = Math.round(simulatedTread);
        if (!isArmedRef.current) {
          isArmedRef.current = true;
          setIsArmed(true);
        }
      }

      // Throttle React state update to ~15fps
      const now = performance.now();
      if (now - lastStateUpdateRef.current > 65) {
        lastStateUpdateRef.current = now;
        setLuminosity(currentAvgLum);
        setAmbientBaseline(Math.round(ambientBaselineRef.current));
      }

      // Trigger emergency when mobile torch flash occurs
      if (isTorchFlash && isArmedRef.current && !alertTriggeredRef.current) {
        alertTriggeredRef.current = true;
        setAlertTriggered(true);
        setAlertCount((c) => c + 1);
        onEmergencyDetectedRef.current?.(
          `Mobile Torch Optical Flare Detected (Luminance: ${currentAvgLum}%, Spiked +${Math.round(currentAvgLum - ambientBaselineRef.current)}% above ${Math.round(ambientBaselineRef.current)}% ambient room lighting)`,
          currentAvgLum
        );
      }
    };

    analyze();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hasWebcam]);

  const handleSimulateFlash = () => {
    setLuminosity(96);
    alertTriggeredRef.current = true;
    setAlertTriggered(true);
    setAlertCount((c) => c + 1);
    onEmergencyDetected?.(
      "SIMULATED HIGH-INTENSITY MOBILE TORCH FLASH AT CCTV SENSOR (96% LUMINANCE)",
      96
    );
  };

  const handleDismissAlert = () => {
    alertTriggeredRef.current = false;
    setAlertTriggered(false);
    consecutiveSpikesRef.current = 0;
  };

  const delta = Math.max(0, luminosity - ambientBaseline);
  const isTripped = alertTriggered || (isArmed && (delta >= 24 && luminosity >= 50 || luminosity >= threshold));

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3 backdrop-blur">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} width={64} height={48} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                !isArmed
                  ? "bg-amber-400 animate-pulse"
                  : hasWebcam
                  ? "bg-emerald-400 animate-ping"
                  : "bg-slate-500"
              }`}
            />
          </div>
          <div>
            <h3 className="font-semibold text-xs text-white flex items-center gap-1.5">
              Optical Mobile Torch Sensor
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                CAM-01
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              {!isArmed ? (
                <span className="text-amber-400">Calibrating Room Lighting...</span>
              ) : hasWebcam ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Armed · Waiting for Torch Flash
                </span>
              ) : (
                <span className="text-slate-400">CCTV Simulation Mode</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (useSimulatedCCTV) {
                initCamera();
              } else {
                setUseSimulatedCCTV(true);
                setHasWebcam(false);
              }
            }}
            title="Toggle between real Webcam and simulated 3D Venue CCTV feed"
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 border border-slate-700/60"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{hasWebcam ? "Switch to Sim" : "Connect Webcam"}</span>
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
              <div className="font-bold text-[11px] text-white">MOBILE TORCH FLASH DETECTED!</div>
              <div className="text-[10px] font-mono text-rose-300">
                Light jumped to {luminosity}% (+{delta}% spike above ambient) · Fire Outbreak Active!
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
                <div className="absolute inset-0 opacity-15 pointer-events-none bg-[repeating-linear-gradient(0deg,#000,#000_2px,transparent_2px,transparent_4px)]" />

                <div className="text-center space-y-2 relative z-10">
                  <Radio className="w-8 h-8 text-cyan-400 mx-auto animate-pulse" />
                  <div className="text-xs font-mono font-bold text-slate-200">
                    OPTICAL TORCH SENSOR
                  </div>
                  {cameraError ? (
                    <div className="text-[10px] text-amber-400 max-w-xs mx-auto">
                      {cameraError}
                    </div>
                  ) : null}
                  <button
                    onClick={initCamera}
                    className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold flex items-center gap-1.5 mx-auto shadow"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Allow / Enable Webcam
                  </button>
                </div>
              </div>
            )}

            {/* Live CCTV HUD Stamp */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-emerald-400 border border-emerald-900/50">
              <span className={`w-1.5 h-1.5 rounded-full ${isArmed ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
              {isArmed ? "ARMED · MONITORING" : "CALIBRATING"}
            </div>

            <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur px-2 py-0.5 rounded text-[9px] font-mono text-slate-300 border border-slate-800">
              {new Date().toLocaleTimeString()}
            </div>

            {/* Luminosity Overlay Gauge on Video */}
            <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 backdrop-blur p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Current: <strong className="text-slate-100">{luminosity}%</strong>
                  <span className="text-slate-500 ml-1">(Room: {ambientBaseline}%)</span>
                </span>
                <span
                  className={`font-bold px-1.5 py-0.5 rounded ${
                    isTripped
                      ? "bg-rose-950 text-rose-300 border border-rose-500 animate-pulse"
                      : delta >= 15
                      ? "text-amber-400"
                      : "text-cyan-400"
                  }`}
                >
                  {isTripped ? "🔥 TORCH FLASH DETECTED" : `Spike: +${delta}%`}
                </span>
              </div>

              {/* Progress Bar showing current vs threshold */}
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  style={{ width: `${Math.min(100, luminosity)}%` }}
                  className={`h-full transition-all duration-75 ${
                    isTripped
                      ? "bg-gradient-to-r from-amber-500 to-rose-500"
                      : "bg-gradient-to-r from-cyan-500 to-emerald-500"
                  }`}
                />
                {/* Threshold Pin */}
                <div
                  style={{ left: `${threshold}%` }}
                  className="absolute top-0 bottom-0 w-1 bg-rose-500 shadow-sm"
                  title={`Alarm Threshold: ${threshold}%`}
                />
              </div>
            </div>
          </div>

          {/* Controls: Sensitivity & Manual Simulation */}
          <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="text-slate-400">Flash Threshold:</span>
              <span className="font-mono font-bold text-cyan-300">{threshold}% (Spike +24% above room)</span>
            </div>
            <input
              type="range"
              min={45}
              max={85}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>More Sensitive (45%)</span>
              <span className="text-amber-400">Default: 65%</span>
              <span>Less Sensitive (85%)</span>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-relaxed bg-slate-950/60 p-2 rounded border border-slate-800/60">
              💡 <strong>Ready:</strong> Point your mobile phone flashlight at the webcam and turn it ON. The sudden surge in light will trigger the fire outbreak!
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSimulateFlash}
                className="flex-1 py-1.5 px-2.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                ⚡ Test Simulated Flash
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
