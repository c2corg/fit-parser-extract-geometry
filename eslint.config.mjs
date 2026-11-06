// @ts-check

import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import pluginSecurity from 'eslint-plugin-security';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['reports/', 'dist/', 'coverage/'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  pluginSecurity.configs.recommended,
  {
    rules: {
      // bitwise lookups by numeric index are the core of a binary parser
      'security/detect-object-injection': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
    },
  },
  {
    files: ['test/**'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // tests read sample files from computed paths
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  prettier,
);
