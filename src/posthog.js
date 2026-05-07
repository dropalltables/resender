import { PostHog } from 'posthog-node';

function createPostHogClient(env) {
  return new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
}

export async function captureEvent(env, distinctId, event, properties = {}) {
  if (!env.POSTHOG_API_KEY) return;
  const posthog = createPostHogClient(env);
  posthog.capture({ distinctId, event, properties });
  await posthog.shutdown();
}

export async function captureException(env, error, distinctId) {
  if (!env.POSTHOG_API_KEY) return;
  const posthog = createPostHogClient(env);
  posthog.captureException(error, distinctId);
  await posthog.shutdown();
}
