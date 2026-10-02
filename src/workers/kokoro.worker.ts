import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const FEMALE_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah'] as const;
type KokoroVoice = typeof FEMALE_VOICES[number];
let model: KokoroTTS | null = null;
let loading: Promise<KokoroTTS> | null = null;
const cancelledJobs = new Set<number>();

self.onmessage = async (event: MessageEvent<{ id: number; type: 'load' | 'synthesize' | 'cancel'; text?: string; voice?: KokoroVoice }>) => {
  const { id, type, text = '', voice = 'af_heart' } = event.data;
  if (type === 'cancel') { cancelledJobs.add(id); return; }
  try {
    if (!model) {
      loading ??= KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: 'q8',
        device: typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm',
        progress_callback: (progress) => self.postMessage({ type: 'progress', progress }),
      });
      model = await loading;
      loading = null;
      self.postMessage({ id, type: 'loaded' });
      return;
    }
    if (type === 'load') { self.postMessage({ id, type: 'loaded' }); return; }
    const audio = await model.generate(text, { voice });
    if (cancelledJobs.delete(id)) return;
    const blob = audio.toBlob();
    self.postMessage({ id, type: 'audio', blob });
  } catch (error) {
    loading = null;
    self.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
