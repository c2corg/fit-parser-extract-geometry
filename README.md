# fit-parser-extract-geometry

Basic FIT parser that only focuses on extracting geometry from activities

## Installation

```sh
npm install @c2corg/fit-parser-extract-geometry
```

## Usage

```ts
import { extractGeometry } from '@c2corg/fit-parser-extract-geometry';

const bytes = [0x0E, 0x10, 0xD9, 0x07, 0x00, 0x00, 0x00, 0x00, 0x2E, 0x46, 0x49, 0x54, 0x91, 0x33, 0x00, 0x00];
const geometry = extractGeometry(new Uint8Array(bytes)npm);
```

When an error is encountered, the parser stops silently and returns the corrdinates already processed. Set `DEBUG` environment variable to `fit-parser-extract-geometry` to enable error messages ([more info](https://github.com/debug-js/debug)).
