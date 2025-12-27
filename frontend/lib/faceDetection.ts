export type FaceDetectionResult = {
  faceCount: number | null;
  /**
   * Area of the first face bounding box divided by full image area.
   * Useful to detect close-ups vs full-body shots.
   */
  faceAreaRatio: number | null;
};

// MediaPipe Tasks Vision (lazy-loaded) singleton
let mpDetectorPromise: Promise<{
  detect: (image: ImageBitmap) => Promise<FaceDetectionResult>;
}> | null = null;

function safeBoxAreaRatio(
  box: { width?: number; height?: number } | null | undefined,
  imgW: number,
  imgH: number
): number | null {
  const w = typeof box?.width === "number" ? box.width : null;
  const h = typeof box?.height === "number" ? box.height : null;
  if (!w || !h || !imgW || !imgH) return null;
  return (w * h) / (imgW * imgH);
}

async function getMediaPipeDetector() {
  if (mpDetectorPromise) return mpDetectorPromise;

  mpDetectorPromise = (async () => {
    // Lazy import so normal users don't pay bundle cost unless they upload.
    const { FaceDetector: MPFaceDetector, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );

    // Pin to the installed npm version in `package.json` to avoid “latest” drift.
    // These assets are fetched at runtime from CDN.
    const wasmBase =
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
    const modelUrl =
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

    const vision = await FilesetResolver.forVisionTasks(wasmBase);
    const detector = await MPFaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    });

    return {
      detect: async (image: ImageBitmap): Promise<FaceDetectionResult> => {
        try {
          const res = detector.detect(image);
          const detections = (res as unknown as { detections?: any[] })
            .detections;
          const faceCount = Array.isArray(detections) ? detections.length : 0;
          const first = Array.isArray(detections) ? detections[0] : null;
          const box =
            first?.boundingBox ||
            first?.bounding_box ||
            first?.locationData?.relativeBoundingBox ||
            null;
          return {
            faceCount,
            faceAreaRatio: safeBoxAreaRatio(box, image.width, image.height),
          };
        } catch {
          return { faceCount: null, faceAreaRatio: null };
        }
      },
    };
  })();

  return mpDetectorPromise;
}

export async function detectFacesBestEffort(
  image: ImageBitmap
): Promise<FaceDetectionResult> {
  // 1) Prefer built-in Shape Detection API if available (fast, no downloads).
  try {
    const FaceDetectorCtor = (window as unknown as { FaceDetector?: any })
      .FaceDetector;
    if (FaceDetectorCtor) {
      const detector = new FaceDetectorCtor({
        fastMode: true,
        maxDetectedFaces: 3,
      });
      const faces = await detector.detect(image);
      if (Array.isArray(faces)) {
        const faceCount = faces.length;
        const first = faces[0];
        const box = first?.boundingBox;
        return {
          faceCount,
          faceAreaRatio: safeBoxAreaRatio(box, image.width, image.height),
        };
      }
    }
  } catch {
    // ignore and fall through
  }

  // 2) Fallback: MediaPipe (works on iOS Safari).
  try {
    const mp = await getMediaPipeDetector();
    return await mp.detect(image);
  } catch {
    return { faceCount: null, faceAreaRatio: null };
  }
}


