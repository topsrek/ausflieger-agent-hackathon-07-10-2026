import React from 'react';
import { CalculateMetadataFunction, Composition, staticFile } from 'remotion';
import { Main } from './Main';
import { FPS } from './theme';
import { buildTimeline, ClipManifest, EndcardInfo, MAX_SECONDS, VideoProps, VoManifest } from './timeline';

async function getJson<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(staticFile(file));
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    const res = await fetch(staticFile(file), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

const calculateMetadata: CalculateMetadataFunction<VideoProps> = async () => {
  const [vo, clip, endcard, hasMusic] = await Promise.all([
    getJson<VoManifest>('vo/manifest.json'),
    getJson<ClipManifest>('clips/manifest.json'),
    getJson<EndcardInfo>('endcard.json'),
    exists('music.mp3'),
  ]);
  const { segments, totalFrames, totalSec } = buildTimeline(vo);
  if (totalSec > MAX_SECONDS) {
    console.warn(`Timeline is ${totalSec.toFixed(1)} s, over the ${MAX_SECONDS} s limit. Shorten script.json.`);
  }
  return {
    durationInFrames: totalFrames,
    props: {
      segments,
      clip,
      endcard: endcard ?? { url: 'https://PLACEHOLDER.invalid', shortlink: 'PLACEHOLDER.link/ausflieger', placeholder: true },
      hasMusic,
    },
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Ausflieger"
    component={Main}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={FPS * 110}
    defaultProps={{ segments: [], clip: null, endcard: { url: '', shortlink: '', placeholder: true }, hasMusic: false } as VideoProps}
    calculateMetadata={calculateMetadata}
  />
);
