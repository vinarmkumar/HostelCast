export const VIDEO_FILTERS = [
  { id: "natural", label: "Natural", css: "none" },
  { id: "balanced-exposure", label: "Face light", css: "brightness(1.08) contrast(.82) saturate(.94)" },
  { id: "soft", label: "Soft light", css: "brightness(1.08) contrast(.92) saturate(.92)" },
  { id: "glow", label: "Beauty glow", css: "brightness(1.12) contrast(.94) saturate(1.05)" },
  { id: "bright-beauty", label: "Bright beauty", css: "brightness(1.18) contrast(.9) saturate(.88)" },
  { id: "soft-glam", label: "Soft glam", css: "brightness(1.1) contrast(.93) saturate(1.12) sepia(.04)" },
  { id: "rosy", label: "Rosy", css: "brightness(1.06) contrast(.96) saturate(1.18) sepia(.08)" },
  { id: "warm", label: "Warm", css: "sepia(.14) saturate(1.12) brightness(1.04)" },
  { id: "cool", label: "Cool", css: "saturate(.88) hue-rotate(9deg) brightness(1.03)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.28) contrast(1.06)" },
  { id: "vintage", label: "Vintage", css: "sepia(.28) saturate(.86) contrast(.94)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.08)" },
];

export const CAMERA_QUALITIES = [
  { id: "720p", label: "720p · Smooth", width: 1280, height: 720 },
  { id: "1080p", label: "1080p · Best", width: 1920, height: 1080 },
];

export async function createVideoEffects(mediaStream) {
  const [cameraTrack] = mediaStream.getVideoTracks();
  if (!cameraTrack || cameraTrack.readyState !== "live") {
    throw new Error("A live camera track is required to start a broadcast.");
  }

  const { width = 0, height = 0 } = cameraTrack.getSettings();
  if (!width || !height) {
    throw new Error("The camera did not provide a usable video resolution.");
  }

  const capabilities = cameraTrack.getCapabilities?.();
  if (capabilities?.exposureMode?.includes("continuous")) {
    try {
      await cameraTrack.applyConstraints({ advanced: [{ exposureMode: "continuous" }] });
    } catch (error) {
      console.warn("Camera auto-exposure could not be enabled:", error.message);
    }
  }

  return {
    stream: new MediaStream([cameraTrack]),
    width,
    height,
    setFilter(filterId) {
      if (!VIDEO_FILTERS.some((filter) => filter.id === filterId)) {
        throw new Error("Select a valid live video filter.");
      }
      return cameraTrack;
    },
    stop() {},
  };
}
