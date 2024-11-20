// @ts-check

import eslint from '@eslint/js';
import pluginSecurity from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['reports/**', 'node_modules/**', 'bin/**', '*.sh'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  pluginSecurity.configs.recommended,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/camelcase': 'off',
    },
  },
);
