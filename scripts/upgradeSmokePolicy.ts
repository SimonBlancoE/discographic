export type DockerSmokePlan =
  | {
      action: 'run';
      message: null;
    }
  | {
      action: 'skip' | 'error';
      message: string;
    };

export function resolveDockerSmokePlan({
  skipDocker,
  requireDocker,
  dockerAvailable,
}: {
  skipDocker: boolean;
  requireDocker: boolean;
  dockerAvailable: boolean;
}): DockerSmokePlan {
  if (requireDocker) {
    if (dockerAvailable) {
      return {
        action: 'run',
        message: null,
      };
    }

    return {
      action: 'error',
      message: 'Docker is required for upgrade smoke but `docker` is not available on PATH.',
    };
  }

  if (skipDocker) {
    return {
      action: 'skip',
      message: 'Skipping Docker upgrade smoke because DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=true.',
    };
  }

  if (dockerAvailable) {
    return {
      action: 'run',
      message: null,
    };
  }

  return {
    action: 'skip',
    message: 'Skipping Docker upgrade smoke because `docker` is not available on PATH.',
  };
}
