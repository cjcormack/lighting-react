import globals from "globals"
import pluginJs from "@eslint/js"
import tseslint from "typescript-eslint"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      // Agent worktrees are full second checkouts of this repo, build output and
      // all, so linting them reports every issue twice over.
      ".claude/**",
      // Design-session scratch, kept as reference implementations next to the
      // rest of the docs. Outside `src/`, so tsc never sees it; the `.jsx`
      // files are TypeScript inside and the parser can't read them either.
      "docs/prototypes/**",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  // React 19's automatic JSX runtime — no `import React` needed in scope.
  pluginReact.configs.flat["jsx-runtime"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: { "react-hooks": pluginReactHooks },
    rules: {
      // The classic pair. v7's `recommended` preset also pulls in the React
      // Compiler rules, which this codebase hasn't been written against yet.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // TypeScript checks prop shapes; propTypes would be a second, weaker copy.
      "react/prop-types": "off",
      // A leading underscore is the project's marker for a deliberately unused
      // binding (required positional args, destructure-to-omit, ignored catches).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // react-three-fiber props (position, intensity, args, …) are not DOM
    // attributes; @react-three/fiber's own JSX types are what validate them.
    files: ["src/components/stage3d/**"],
    rules: { "react/no-unknown-property": "off" },
  },
  {
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
]
