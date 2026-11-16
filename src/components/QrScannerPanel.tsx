import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, QrCode } from 'lucide-react';

interface QrScannerPanelProps {
  onScan: (decodedText: string) => void;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }
}

export function QrScannerPanel({ onScan }: QrScannerPanelProps) {
  const [active, setActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ value: string; ts: number }>({ value: '', ts: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Browser ini tidak mendukung akses kamera. Gunakan input manual NIM/QR.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);

      // Wait for video element mount
      window.setTimeout(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const useNative = typeof window.BarcodeDetector === 'function';
        const detector = useNative
          ? new window.BarcodeDetector!({ formats: ['qr_code'] })
          : null;
        setEngineLabel(useNative ? 'BarcodeDetector' : 'jsQR Fallback');

        const scanLoop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          const v = videoRef.current;

          if (v.readyState >= 2 && v.videoWidth > 0) {
            let decoded: string | null = null;

            if (detector) {
              try {
                const barcodes = await detector.detect(v);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  decoded = barcodes[0].rawValue;
                }
              } catch {
                // Ignore transient frame detection errors
              }
            } else {
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = v.videoWidth;
                canvas.height = v.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const qr = jsQR(imgData.data, imgData.width, imgData.height, {
                    inversionAttempts: 'dontInvert',
                  });
                  if (qr?.data) decoded = qr.data;
                }
              }
            }

            if (decoded) {
              const now = Date.now();
              if (
                decoded !== lastScannedRef.current.value ||
                now - lastScannedRef.current.ts > 2500
              ) {
                lastScannedRef.current = { value: decoded, ts: now };
                onScanRef.current(decoded);
              }
            }
          }

          rafRef.current = requestAnimationFrame(scanLoop);
        };

        rafRef.current = requestAnimationFrame(scanLoop);
      }, 100);
    } catch {
      setErrorMsg('Izin kamera ditolak atau kamera tidak ditemukan. Gunakan input manual NIM/QR.');
      stopCamera();
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-[#EA6113]" />
          <h3 className="text-sm font-semibold text-stone-900">Pemindai QR Kamera</h3>
          {active && engineLabel && (
            <span className="font-mono text-[11px] text-stone-500">· {engineLabel}</span>
          )}
        </div>

        {!active ? (
          <button
            type="button"
            onClick={startCamera}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EA6113] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D1520B] whitespace-nowrap shrink-0"
          >
            <Camera className="h-3.5 w-3.5" />
            Aktifkan Kamera
          </button>
        ) : (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-[#FFE3B3]/25 whitespace-nowrap shrink-0"
          >
            <CameraOff className="h-3.5 w-3.5" />
            Matikan
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {errorMsg}
        </p>
      )}

      {active ? (
        <div className="relative mt-3 overflow-hidden rounded-lg border border-stone-200 bg-stone-950">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-video w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-lg border-2 border-[#FBB931] shadow-[0_0_0_9999px_rgba(28,25,23,0.4)]" />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#F88F22]/50 bg-[#FFE3B3]/15 text-center">
          <Camera className="h-6 w-6 text-[#EA6113]" />
          <p className="mt-1.5 text-xs text-stone-600">
            Arahkan kamera ke QR Code pada Kartu Ujian mahasiswa
          </p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
