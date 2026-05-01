import { describe, expect, it } from 'vitest';
import { resolveDockerSmokePlan } from '../scripts/upgradeSmokePolicy.js';

describe('upgrade smoke docker policy', () => {
  it('skips unavailable Docker by default but can require it explicitly', () => {
    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: false,
        dockerAvailable: false,
      })
    ).toEqual({
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because `docker` is not available on PATH.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: true,
        dockerAvailable: false,
      })
    ).toEqual({
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    });
  });
});
