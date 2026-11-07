const LIVE_AUDIO_CAPTURE_OPTIONS = Object.freeze({
  autoGainControl: true,
  channelCount: { ideal: 1 },
  echoCancellation: true,
  noiseSuppression: true,
  sampleRate: { ideal: 48_000 },
  voiceIsolation: { ideal: true },
});

export default LIVE_AUDIO_CAPTURE_OPTIONS;
