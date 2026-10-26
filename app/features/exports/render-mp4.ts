import { REEL_FPS, REEL_SECONDS } from './reel-renderer';

/** H.264 in a real MP4 container, generated entirely on the operator's computer. */
export async function renderMp4(
  canvas: HTMLCanvasElement,
  paint: (seconds: number) => void,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser cannot encode H.264 video. Try an up-to-date Chrome or Edge on the Windows PC.');
  }
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality } = await import('mediabunny');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: canvas.width === 1080 ? 9_000_000 : 5_000_000 }),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(video, { frameRate: REEL_FPS });
  let done = false;
  try {
    if (signal?.aborted) throw new DOMException('Video export cancelled.', 'AbortError');
    await output.start();
    const frames = REEL_SECONDS * REEL_FPS;
    for (let index = 0; index < frames; index++) {
      if (signal?.aborted) throw new DOMException('Video export cancelled.', 'AbortError');
      paint(index / REEL_FPS);
      // Await backpressure: do not queue hundreds of raw 1080p frames on an older Mac.
      await video.add(index / REEL_FPS, 1 / REEL_FPS, { keyFrame: index % (2 * REEL_FPS) === 0 });
      if (index % 6 === 0) {
        onProgress(index / frames);
        // Give React a chance to paint progress without tying video duration to wall time.
        // requestAnimationFrame pauses in background tabs; exports must keep progressing.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    video.close();
    onProgress(0.98);
    await output.finalize();
    done = true;
    const bytes = target.buffer;
    if (!bytes || bytes.byteLength < 256) throw new Error('The MP4 encoder returned an empty file.');
    const signature = new Uint8Array(bytes, 4, 4);
    if (String.fromCharCode(...signature) !== 'ftyp') throw new Error('The encoder did not produce a valid MP4 container.');
    onProgress(1);
    return new Blob([bytes], { type: 'video/mp4' });
  } catch (error) {
    if (!done) await output.cancel().catch(() => {});
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const detail = error instanceof Error ? error.message : 'Video encoding failed.';
    throw new Error(`MP4 export failed: ${detail}`);
  }
}
