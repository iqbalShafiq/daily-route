import config from "@daily-route/config/eslint";

export default [
  ...config,
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/db/drizzle/meta/**",
      "data/raw/**",
    ],
  },
];
