import { describe, expect, it } from 'vitest';
import { resolveDockerSmokePlan } from '../scripts/upgradeSmokePolicy.js';

describe('upgrade smoke docker policy', () => {
  it('skips unavailable or unusable Docker by default but makes the explicit Docker gate authoritative', () => {
    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: false,
        dockerAvailableOnPath: false,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because `docker` is not available on PATH.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: true,
        dockerAvailableOnPath: false,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: true,
        requireDocker: true,
        dockerAvailableOnPath: false,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: false,
        dockerAvailableOnPath: true,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because the Docker daemon is not reachable.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: false,
        requireDocker: true,
        dockerAvailableOnPath: true,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'error',
      message: 'Docker is required for upgrade smoke but the Docker daemon is not reachable.',
    });

    expect(
      resolveDockerSmokePlan({
        skipDocker: true,
        requireDocker: true,
        dockerAvailableOnPath: true,
        dockerDaemonReachable: false,
      })
    ).toEqual({
      action: 'error',
      message: 'Docker is required for upgrade smoke but the Docker daemon is not reachable.',
    });
  });
});
