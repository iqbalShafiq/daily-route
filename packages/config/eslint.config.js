import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * One shared flat ESLint config for every workspace package.
 *
 * It is deliberately non-type-aware: the type checker owns type correctness
 * (`pnpm typecheck`), ESLint owns code correctness. Running a second,
 * slower type-aware pass would duplicate the compiler and slow every lint.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/drizzle/meta/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase is `type: module` everywhere; CommonJS globals are a bug.
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      // A console statement is legitimate in a server or a CLI; what matters
      // is that it is not used to debug from the browser.
      "no-console": ["warn", { allow: ["warn", "error", "info", "log"] }],
      "object-shorthand": ["error", "always"],
      "prefer-template": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // A test may assert on a value it has just checked is present.
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
);
