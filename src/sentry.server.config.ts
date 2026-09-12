import * as Sentry from "@sentry/nextjs";

import { getSentryEnvironment, getSentryRelease, sentryPrivacyOptions } from "@/lib/sentry/privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: getSentryEnvironment(),
  release: getSentryRelease(),
  includeLocalVariables: false,
  ...sentryPrivacyOptions,
});
