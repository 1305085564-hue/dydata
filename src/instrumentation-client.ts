import * as Sentry from "@sentry/nextjs";

import { getSentryEnvironment, getSentryRelease, sentryClientPrivacyOptions } from "@/lib/sentry/privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: getSentryEnvironment(),
  release: getSentryRelease(),
  ...sentryClientPrivacyOptions,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
