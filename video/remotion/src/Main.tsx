import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Background } from './components/Background';
import { Captions } from './components/Captions';
import { ArchitectureScene } from './scenes/Architecture';
import { ClipScene } from './scenes/ClipScene';
import { EndCardScene } from './scenes/EndCard';
import { IntroScene } from './scenes/Intro';
import { MarketScene } from './scenes/Market';
import { Seg, VideoProps } from './timeline';

const FADE = 8;

const SegmentView: React.FC<{ seg: Seg; props: VideoProps }> = ({ seg, props }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' });
  const captionPlacement = seg.kind === 'intro' ? 'left' : seg.kind === 'architecture' || seg.kind === 'market' ? 'bottom' : seg.kind === 'endcard' ? 'none' : 'panel';
  let scene: React.ReactNode;
  switch (seg.kind) {
    case 'intro': scene = <IntroScene seg={seg} clip={props.clip} />; break;
    case 'architecture': scene = <ArchitectureScene seg={seg} />; break;
    case 'endcard': scene = <EndCardScene info={props.endcard} />; break;
    case 'market': scene = <MarketScene seg={seg} />; break;
    default: scene = <ClipScene seg={seg} clip={props.clip} />;
  }
  return (
    <AbsoluteFill style={{ opacity }}>
      {scene}
      {captionPlacement !== 'none' && <Captions words={seg.words} placement={captionPlacement} />}
      {seg.audio && <Audio src={staticFile(seg.audio)} />}
    </AbsoluteFill>
  );
};

export const Main: React.FC<VideoProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const musicVolume = interpolate(frame, [0, 30, durationInFrames - 60, durationInFrames], [0, 0.12, 0.12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <Background />
      {props.segments.map((seg) => (
        <Sequence key={seg.id} from={seg.from} durationInFrames={seg.durationInFrames} name={seg.id}>
          <SegmentView seg={seg} props={props} />
        </Sequence>
      ))}
      {props.hasMusic && <Audio src={staticFile('music.mp3')} volume={musicVolume} />}
    </AbsoluteFill>
  );
};
