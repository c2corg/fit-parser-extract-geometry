# fit-parser-extract-geometry

[![GitHub license](https://img.shields.io/github/license/c2corg/fit-parser-extract-geometry.svg)](https://github.com/c2corg/fit-parser-extract-geometry/blob/main/LICENSE) ![Continuous integration](https://github.com/c2corg/fit-parser-extract-geometry/workflows/Continuous%20integration/badge.svg?branch=main) ![Github Code scanning](https://github.com/c2corg/fit-parser-extract-geometry/workflows/Github%20Code%20scanning/badge.svg?branch=main) [![Codacy Badge](https://app.codacy.com/project/badge/Grade/937c8b91d70d4e03bb372a9b029ce166)](https://www.codacy.com/gh/c2corg/fit-parser-extract-geometry/dashboard?utm_source=github.com&utm_medium=referral&utm_content=c2corg/fit-parser-extract-geometry&utm_campaign=Badge_Grade) [![Codacy Badge](https://app.codacy.com/project/badge/Coverage/937c8b91d70d4e03bb372a9b029ce166)](https://www.codacy.com/gh/c2corg/fit-parser-extract-geometry/dashboard?utm_source=github.com&utm_medium=referral&utm_content=c2corg/fit-parser-extract-geometry&utm_campaign=Badge_Coverage)

Basic FIT parser that only focuses on extracting geometry from activities

## Installation

```sh
npm install @c2corg/fit-parser-extract-geometry
```

## Usage

```ts
import { extractGeometry } from '@c2corg/fit-parser-extract-geometry';

const bytes = [0x0e, 0x10, 0xd9, 0x07, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54, 0x91, 0x33, 0x00, 0x00];
const geometry = extractGeometry(new Uint8Array(bytes));
```

When an error is encountered, the parser stops silently and returns the coordinates already processed. Set `DEBUG` environment variable to `fit-parser-extract-geometry` to enable error messages (in a browser, set `localStorage.debug` instead, [more info](https://github.com/debug-js/debug)).

The package ships both ES module and CommonJS builds, and works in Node.js (>= 20.19) and browsers.

## Development

```sh
npm ci
npm test               # run the tests with Vitest
npm run test:coverage  # same, with a coverage report in reports/coverage
npm run lint           # ESLint, with fixes
npm run typecheck      # tsc --noEmit
npm run build          # build dist/ with tsdown
npm run check:package  # build, then validate the package with publint and arethetypeswrong
```
