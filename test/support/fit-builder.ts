/**
 * Minimal FIT file writer, used to craft binary fixtures for edge cases.
 * See https://developer.garmin.com/fit/protocol/
 */

export const BaseType = {
  enum: 0x00,
  uint8: 0x02,
  uint16: 0x84,
  sint32: 0x85,
  uint32: 0x86,
  string: 0x07,
} as const;

const SIZES: Partial<Record<number, number>> = {
  [BaseType.enum]: 1,
  [BaseType.uint8]: 1,
  [BaseType.uint16]: 2,
  [BaseType.sint32]: 4,
  [BaseType.uint32]: 4,
  [BaseType.string]: 1,
};

export const INVALID = {
  uint8: 0xff,
  uint16: 0xffff,
  sint32: 0x7fffffff,
  uint32: 0xffffffff,
} as const;

export const MesgNum = { fileId: 0, record: 20, event: 21 } as const;

export const RecordField = {
  latitude: 0,
  longitude: 1,
  altitude: 2,
  heartRate: 3,
  enhancedAltitude: 78,
  timestamp: 253,
} as const;

export interface FieldDef {
  num: number;
  /** usually a `BaseType`, any byte for invalid cases */
  baseType: number;
  /** defaults to the base type size */
  size?: number;
}

export interface DefinitionOptions {
  bigEndian?: boolean;
  /** sizes of developer fields appended to the data messages */
  developerFieldSizes?: number[];
}

interface Definition {
  fields: Required<FieldDef>[];
  bigEndian: boolean;
  developerFieldSizes: number[];
}

const GARMIN_EPOCH_S = 631065600;

/** Degrees to semicircles */
export const sc = (degrees: number): number => Math.round((degrees * 2 ** 31) / 180);
/** Meters to raw altitude (scale 5, offset 500) */
export const alt = (meters: number): number => Math.round((meters + 500) * 5);
/** Unix seconds to FIT timestamp */
export const ts = (unixSeconds: number): number => unixSeconds - GARMIN_EPOCH_S;

export class FitBuilder {
  private readonly records: number[] = [];
  private readonly definitions = new Map<number, Definition>();

  definition(localType: number, globalMesgNum: number, fields: FieldDef[], options: DefinitionOptions = {}): this {
    const bigEndian = options.bigEndian ?? false;
    const developerFieldSizes = options.developerFieldSizes ?? [];
    const fullFields = fields.map((f) => ({
      ...f,
      size: f.size ?? SIZES[f.baseType] ?? 1,
    }));
    const header = 0x40 | (developerFieldSizes.length ? 0x20 : 0) | localType;
    const gmn = bigEndian ? [globalMesgNum >> 8, globalMesgNum & 0xff] : [globalMesgNum & 0xff, globalMesgNum >> 8];
    this.records.push(header, 0, bigEndian ? 1 : 0, ...gmn, fullFields.length);
    for (const f of fullFields) {
      this.records.push(f.num, f.size, f.baseType);
    }
    if (developerFieldSizes.length) {
      this.records.push(developerFieldSizes.length);
      developerFieldSizes.forEach((size, i) => this.records.push(i, size, 0));
    }
    this.definitions.set(localType, { fields: fullFields, bigEndian, developerFieldSizes });
    return this;
  }

  /** Normal header data message. `values` follow the definition field order. */
  data(localType: number, values: number[]): this {
    this.records.push(localType & 0x0f);
    this.pushValues(localType, values);
    return this;
  }

  /** Compressed timestamp header data message (local types 0-3 only). */
  compressed(localType: number, timeOffset: number, values: number[]): this {
    this.records.push(0x80 | ((localType & 0x03) << 5) | (timeOffset & 0x1f));
    this.pushValues(localType, values);
    return this;
  }

  /** Appends raw bytes, e.g. to craft corrupted files. */
  raw(...bytes: number[]): this {
    this.records.push(...bytes);
    return this;
  }

  build({ headerSize = 14, dataSize }: { headerSize?: number; dataSize?: number } = {}): Uint8Array {
    const length = dataSize ?? this.records.length;
    const header = new Uint8Array(headerSize);
    const view = new DataView(header.buffer);
    header[0] = headerSize;
    header[1] = 0x20; // protocol version
    view.setUint16(2, 2132, true); // profile version
    view.setUint32(4, length, true);
    header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
    // CRCs are left to 0: the parser does not check them
    return new Uint8Array([...header, ...this.records, 0, 0]);
  }

  private pushValues(localType: number, values: number[]): void {
    const def = this.definitions.get(localType);
    if (!def) {
      throw new Error(`no definition for local type ${String(localType)}`);
    }
    if (values.length !== def.fields.length) {
      throw new Error(`expected ${String(def.fields.length)} values, got ${String(values.length)}`);
    }
    def.fields.forEach((field, i) => {
      const bytes = new Uint8Array(field.size);
      const view = new DataView(bytes.buffer);
      const value = values[i] ?? 0;
      const le = !def.bigEndian;
      switch (field.baseType) {
        case BaseType.uint16:
          view.setUint16(0, value, le);
          break;
        case BaseType.sint32:
          view.setInt32(0, value, le);
          break;
        case BaseType.uint32:
          view.setUint32(0, value, le);
          break;
        default:
          bytes.fill(value & 0xff);
      }
      this.records.push(...bytes);
    });
    for (const size of def.developerFieldSizes) {
      this.records.push(...new Array<number>(size).fill(0xaa));
    }
  }
}
