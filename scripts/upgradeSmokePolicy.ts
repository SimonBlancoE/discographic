export type DockerSmokePlan =
  | {
      action: 'run';
      message: null;
    }
  | {
      action: 'skip' | 'error';
      message: string;
    };

export type DockerSmokePlanInput = {
  skipDocker: boolean;
  requireDocker: boolean;
  dockerAvailableOnPath: boolean;
  dockerDaemonReachable: boolean;
};

const defaultPortBindRaceAttempts = 3;

export function resolveDockerSmokePlan({
  skipDocker,
  requireDocker,
  dockerAvailableOnPath,
  dockerDaemonReachable,
}: DockerSmokePlanInput): DockerSmokePlan {
  if (requireDocker) {
    if (!dockerAvailableOnPath) {
      return {
        action: 'error',
        message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
      };
    }

    if (!dockerDaemonReachable) {
      return {
        action: 'error',
        message: 'Docker is required for upgrade smoke but the Docker daemon is not reachable.',
      };
    }

    return {
      action: 'run',
      message: null,
    };
  }

  if (skipDocker) {
    return {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=true.',
    };
  }

  if (!dockerAvailableOnPath) {
    return {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because `docker` is not available on PATH.',
    };
  }

  if (!dockerDaemonReachable) {
    return {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because the Docker daemon is not reachable.',
    };
  }

  return {
    action: 'run',
    message: null,
  };
}

function isPortBindRaceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /EADDRINUSE|address already in use|port is already allocated|Bind for .* failed/i.test(message);
}

export async function retryPortBindRace<Result>(
  run: () => Promise<Result>,
  attempts = defaultPortBindRaceAttempts
): Promise<Result> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !isPortBindRaceError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}
