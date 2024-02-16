module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module', // Allows for the use of imports,
  },
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'prettier', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
    'plugin:security/recommended-legacy',
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  rules: {
    'security/detect-object-injection': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, destructuredArrayIgnorePattern: '^_' }],
  },
};
