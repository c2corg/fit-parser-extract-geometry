# fit-parser-extract-geometry

[![npm](https://img.shields.io/npm/v/@c2corg/fit-parser-extract-geometry)](https://www.npmjs.com/package/@c2corg/fit-parser-extract-geometry)
[![Continuous integration](https://github.com/c2corg/fit-parser-extract-geometry/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/c2corg/fit-parser-extract-geometry/actions/workflows/build.yml)
[![Code scanning](https://github.com/c2corg/fit-parser-extract-geometry/actions/workflows/codeql-analysis.yml/badge.svg?branch=main)](https://github.com/c2corg/fit-parser-extract-geometry/actions/workflows/codeql-analysis.yml)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/937c8b91d70d4e03bb372a9b029ce166)](https://app.codacy.com/gh/c2corg/fit-parser-extract-geometry/dashboard)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/937c8b91d70d4e03bb372a9b029ce166)](https://app.codacy.com/gh/c2corg/fit-parser-extract-geometry/dashboard)
[![License](https://img.shields.io/github/license/c2corg/fit-parser-extract-geometry)](LICENSE)

Small, dependency-light parser that extracts the track of a
[FIT](https://developer.garmin.com/fit/protocol/) activity file (Garmin, Coros,
Suunto, Wahoo…) as a list of `[longitude, latitude, altitude, time]` points.

It only reads what a track needs: `record` messages with their position,
altitude and timestamp. Everything else (sessions, laps, heart rate, developer
fields…) is skipped. To decode whole FIT files, use the
[Garmin FIT SDK](https://github.com/garmin/fit-javascript-sdk) instead.

It is used by [camptocamp.org](https://www.camptocamp.org) to display FIT files
on maps ([c2c_ui](https://github.com/c2corg/c2c_ui)) and to import activities
from tracking services ([c2c_tracking](https://github.com/c2corg/c2c_tracking)).

## Installation

```sh
npm install @c2corg/fit-parser-extract-geometry
```

The package ships ES module and CommonJS builds, with TypeScript types. It runs
in Node.js >= 20.19 and in browsers.

## Usage

In Node.js:

```ts
import { readFile } from 'node:fs/promises';

import { extractGeometry } from '@c2corg/fit-parser-extract-geometry';

const geometry = extractGeometry(await readFile('activity.fit'));
```

In a browser, from a file input or a download:

```ts
import { extractGeometry } from '@c2corg/fit-parser-extract-geometry';

const response = await fetch('activity.fit');
const geometry = extractGeometry(new Uint8Array(await response.arrayBuffer()));
```

As a GeoJSON geometry:

```ts
const lineString = { type: 'LineString', coordinates: extractGeometry(bytes) };
```

## API

### `extractGeometry(blob: Uint8Array): Point[]`

Returns one point per `record` message with a position, in file order. Any
`Uint8Array` works, including a Node.js `Buffer` or a view on a larger buffer.

### `Point`

```ts
type Point = [longitude: number, latitude: number, altitude: number, time: number];
```

- `longitude` and `latitude`: degrees (WGS 84).
- `altitude`: meters, from `enhanced_altitude`, else from `altitude`. A record
  without altitude takes the previous known one. Leading records take the
  first known one, and all records get 0 when the file has no altitude.
- `time`: seconds since the Unix epoch, from the record timestamp or its
  compressed timestamp header. 0 when unknown.

Records at exactly (0, 0) are skipped, as some devices write them without GPS
fix. So are positions out of range, which only corrupted data can contain.

### Errors

`extractGeometry` throws only when the input is too small to contain a FIT
header (less than 12 bytes).

It returns an empty array when the header is not a FIT header. When the data
is corrupted or truncated, it stops silently and returns the points read so
far.

To log why parsing stopped, enable the `fit-parser-extract-geometry` namespace
of [debug](https://github.com/debug-js/debug):

```sh
DEBUG=fit-parser-extract-geometry node app.js
```

In a browser, run `localStorage.debug = 'fit-parser-extract-geometry'` in the
console, then reload the page.

### Limits

- File and header CRCs are not checked.
- Only the first FIT file of a chained FIT file is read.
- Files with a data size of 0 in their header, as written by some unfinished
  recordings, return an empty array.

## Development

```sh
npm ci
npm test               # tests, with Vitest
npm run test:coverage  # tests, with a coverage report in reports/coverage
npm run lint           # ESLint, with fixes
npm run format         # Prettier
npm run typecheck      # tsc --noEmit
npm run build          # build dist/ with tsdown
npm run check:package  # build, then check with publint and arethetypeswrong
```

Tests craft FIT files for edge cases with `test/support/fit-builder.ts`, and
read the sample files in `samples/`. Coverage must stay at 100%.

## Release

Bump the version and push the tag:

```sh
npm version minor  # or patch, major
git push --follow-tags
```

The `v*` tag triggers the release workflow: it creates the GitHub release with
generated notes, then publishes the package to npm with provenance.

## Credits

The parser was first inspired by [backfit](https://github.com/backfit/backfit),
under MIT license.

## License

[MIT](LICENSE)
