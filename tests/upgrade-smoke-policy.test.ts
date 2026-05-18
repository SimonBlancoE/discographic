import { describe, expect, it } from 'vitest';
import {
  retryPortBindRace,
  resolveDockerSmokePlan,
  type DockerSmokePlan,
  type DockerSmokePlanInput,
} from '../scripts/upgradeSmokePolicy.js';

type DockerSmokePlanCase = {
  name: string;
  input: DockerSmokePlanInput;
  expected: DockerSmokePlan;
};

const dockerSmokePlanCases: DockerSmokePlanCase[] = [
  {
    name: 'skips when Docker is optional and not available on PATH',
    input: {
      skipDocker: false,
      requireDocker: false,
      dockerAvailableOnPath: false,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because `docker` is not available on PATH.',
    },
  },
  {
    name: 'errors when Docker is required but not available on PATH',
    input: {
      skipDocker: false,
      requireDocker: true,
      dockerAvailableOnPath: false,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    },
  },
  {
    name: 'keeps required Docker authoritative over the skip flag when Docker is not available',
    input: {
      skipDocker: true,
      requireDocker: true,
      dockerAvailableOnPath: false,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    },
  },
  {
    name: 'skips when Docker is optional and the daemon is unreachable',
    input: {
      skipDocker: false,
      requireDocker: false,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because the Docker daemon is not reachable.',
    },
  },
  {
    name: 'errors when Docker is required and the daemon is unreachable',
    input: {
      skipDocker: false,
      requireDocker: true,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'error',
      message: 'Docker is required for upgrade smoke but the Docker daemon is not reachable.',
    },
  },
  {
    name: 'keeps required Docker authoritative over the skip flag when the daemon is unreachable',
    input: {
      skipDocker: true,
      requireDocker: true,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: false,
    },
    expected: {
      action: 'error',
      message: 'Docker is required for upgrade smoke but the Docker daemon is not reachable.',
    },
  },
  {
    name: 'honors the explicit skip flag when Docker is optional and usable',
    input: {
      skipDocker: true,
      requireDocker: false,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: true,
    },
    expected: {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=true.',
    },
  },
  {
    name: 'runs when optional Docker is usable',
    input: {
      skipDocker: false,
      requireDocker: false,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: true,
    },
    expected: {
      action: 'run',
      message: null,
    },
  },
  {
    name: 'runs when required Docker is usable even if the skip flag is set',
    input: {
      skipDocker: true,
      requireDocker: true,
      dockerAvailableOnPath: true,
      dockerDaemonReachable: true,
    },
    expected: {
      action: 'run',
      message: null,
    },
  },
];

describe('upgrade smoke docker policy', () => {
  for (const testCase of dockerSmokePlanCases) {
    it(testCase.name, () => {
      expect(resolveDockerSmokePlan(testCase.input)).toEqual(testCase.expected);
    });
  }
});

describe('upgrade smoke port binding retry policy', () => {
  it('retries transient EADDRINUSE failures before succeeding', async () => {
    let attempts = 0;

    await expect(
      retryPortBindRace(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('listen EADDRINUSE: address already in use 127.0.0.1:3801');
        }
        return 'ok';
      })
    ).resolves.toBe('ok');

    expect(attempts).toBe(2);
  });

  it('does not retry unrelated smoke failures', async () => {
    let attempts = 0;

    await expect(
      retryPortBindRace(async () => {
        attempts += 1;
        throw new Error('compiled runtime: expected dashboard totals.total_records=2');
      })
    ).rejects.toThrow('expected dashboard totals');

    expect(attempts).toBe(1);
  });
});
