import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  VINYL_SPIN_HOVER_DPS,
  VINYL_SPIN_IDLE_DPS,
  advanceSpinMotion
} from '../src/components/VinylBadge.js';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

describe('vinyl badge motion', () => {
  it('eases record speed toward hover and idle targets without jumping', () => {
    const accelerating = advanceSpinMotion({
      angle: 0,
      speed: VINYL_SPIN_IDLE_DPS,
      targetSpeed: VINYL_SPIN_HOVER_DPS,
      deltaMs: 16
    });

    expect(accelerating.speed).toBeGreaterThan(VINYL_SPIN_IDLE_DPS);
    expect(accelerating.speed).toBeLessThan(VINYL_SPIN_HOVER_DPS);

    const decelerating = advanceSpinMotion({
      angle: accelerating.angle,
      speed: VINYL_SPIN_HOVER_DPS,
      targetSpeed: VINYL_SPIN_IDLE_DPS,
      deltaMs: 16
    });

    expect(decelerating.speed).toBeLessThan(VINYL_SPIN_HOVER_DPS);
    expect(decelerating.speed).toBeGreaterThan(VINYL_SPIN_IDLE_DPS);
  });

  it('uses hover pulse waves instead of abrupt animation-duration changes', () => {
    expect(css).not.toMatch(/brand-lockup:hover\s+\.vinyl-record[\s\S]*animation-duration/);
    expect(css).toContain('@keyframes vinyl-wave-pulse');
    expect(css).toMatch(/\.vinyl-badge::before,\s*\.vinyl-badge::after/);
    expect(css).toMatch(/brand-lockup:hover\s+\.vinyl-badge/);
    expect(css).toMatch(/--vinyl-wave-opacity:\s*1/);
  });
});
