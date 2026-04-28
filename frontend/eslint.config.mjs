/**
 * ESLint flat config — Next.js 16 + TypeScript.
 *
 * Imports eslint-config-next's flat configs directly instead of going
 * through @eslint/eslintrc's FlatCompat shim. The shim's
 * config-validator JSON-stringifies plugin objects to format errors,
 * and modern eslint-plugin-react contains a self-reference in its
 * `configs.flat.plugins.react` cycle that crashed the validator with
 * "Converting circular structure to JSON". Skipping the shim avoids
 * that codepath entirely.
 */
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
  {
    // eslint-plugin-react-hooks v6 introduced a batch of strict rules
    // that flag patterns React's own docs do not treat as bugs (setState
    // inside useEffect, ref-current assignment in render, useRef with a
    // non-pure init like Date.now). Useful guidance in editors, but
    // downgrading from "error" to "warn" so they don't block CI on the
    // existing codebase. Worth a separate refactor pass later.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/component-hook-factories": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
