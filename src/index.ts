// This code was originally inspired from https://github.com/backfit/backfit, under MIT license
// The FIT format specification: https://developer.garmin.com/fit/protocol/

import debug from 'debug';

/** `[longitude, latitude, altitude, time]`: degrees, meters, seconds since the Unix epoch (0 when unknown). */
export type Point = [longitude: number, latitude: number, altitude: number, time: number];

const log = debug('fit-parser-extract-geometry');

/** Record header bit: compressed timestamp header */
const COMPRESSED_HEADER_MASK = 0x80;
/** Normal record header bit: definition message, else data message */
const DEFINITION_MESSAGE_MASK = 0x40;
/** Normal record header bit: the definition message has developer fields */
const DEVELOPER_DATA_MASK = 0x20;
/** Normal record header: local message type, 0-15 */
const LOCAL_MESSAGE_TYPE_MASK = 0x0f;
/** Compressed timestamp header: local message type, 0-3, in bits 5-6 */
const COMPRESSED_LOCAL_MESSAGE_TYPE_MASK = 0x60;
/** Compressed timestamp header: time offset in seconds, in bits 0-4 */
const COMPRESSED_TIME_MASK = 0x1f;

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z) */
const FIT_EPOCH_OFFSET = 631065600;
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;
const ALTITUDE_SCALE = 5;
const ALTITUDE_OFFSET = 500;

const RECORD_MESSAGE_NUMBER = 20;
/** Field number of `timestamp`, the same in every message */
const TIMESTAMP_FIELD = 253;

/** Base type numbers, without the endian ability bit */
const BaseType = { uint16: 0x04, sint32: 0x05, uint32: 0x06 } as const;
type BaseType = (typeof BaseType)[keyof typeof BaseType];
const BASE_TYPE_NUMBER_MASK = 0x1f;

interface FieldOfInterest {
  baseType: BaseType;
  size: number;
  invalid: number;
}

const UINT16: FieldOfInterest = { baseType: BaseType.uint16, size: 2, invalid: 0xffff };
const SINT32: FieldOfInterest = { baseType: BaseType.sint32, size: 4, invalid: 0x7fffffff };
const UINT32: FieldOfInterest = { baseType: BaseType.uint32, size: 4, invalid: 0xffffffff };

const RecordField = { latitude: 0, longitude: 1, altitude: 2, enhancedAltitude: 78 } as const;

const RECORD_FIELDS = new Map<number, FieldOfInterest>([
  [RecordField.latitude, SINT32],
  [RecordField.longitude, SINT32],
  [RecordField.altitude, UINT16],
  [RecordField.enhancedAltitude, UINT32],
  [TIMESTAMP_FIELD, UINT32],
]);
const OTHER_MESSAGE_FIELDS = new Map<number, FieldOfInterest>([[TIMESTAMP_FIELD, UINT32]]);

interface FieldDefinition {
  number: number;
  size: number;
  baseType: number;
}

interface MessageDefinition {
  littleEndian: boolean;
  fields: FieldDefinition[];
  fieldsOfInterest: Map<number, FieldOfInterest>;
  isRecord: boolean;
  /** Size of the data messages, record header excluded */
  dataSize: number;
}

interface ParsedPoint {
  longitude: number;
  latitude: number;
  altitude: number | undefined;
  time: number;
}

const readValue = (view: DataView, offset: number, field: FieldOfInterest, littleEndian: boolean): number => {
  switch (field.baseType) {
    case BaseType.uint16:
      return view.getUint16(offset, littleEndian);
    case BaseType.sint32:
      return view.getInt32(offset, littleEndian);
    case BaseType.uint32:
      return view.getUint32(offset, littleEndian);
  }
};

/**
 * Reads a definition message, located after its record header.
 * Returns the definition and its size, record header excluded.
 */
const readDefinition = (
  view: DataView,
  offset: number,
  hasDeveloperData: boolean,
): { definition: MessageDefinition; size: number } => {
  // byte 0 is reserved
  const littleEndian = view.getUint8(offset + 1) === 0;
  const globalMessageNumber = view.getUint16(offset + 2, littleEndian);
  const fieldCount = view.getUint8(offset + 4);

  const fields: FieldDefinition[] = [];
  let cursor = offset + 5;
  for (let i = 0; i < fieldCount; i++, cursor += 3) {
    fields.push({
      number: view.getUint8(cursor),
      size: view.getUint8(cursor + 1),
      baseType: view.getUint8(cursor + 2),
    });
  }

  // developer fields are skipped, only their size matters
  let developerDataSize = 0;
  if (hasDeveloperData) {
    const developerFieldCount = view.getUint8(cursor);
    cursor += 1;
    for (let i = 0; i < developerFieldCount; i++, cursor += 3) {
      developerDataSize += view.getUint8(cursor + 1);
    }
  }

  const isRecord = globalMessageNumber === RECORD_MESSAGE_NUMBER;
  return {
    definition: {
      littleEndian,
      fields,
      fieldsOfInterest: isRecord ? RECORD_FIELDS : OTHER_MESSAGE_FIELDS,
      isRecord,
      dataSize: fields.reduce((total, field) => total + field.size, developerDataSize),
    },
    size: cursor - offset,
  };
};

/** Reads the valid values of the fields of interest of a data message, located after its record header. */
const readData = (view: DataView, offset: number, definition: MessageDefinition): Map<number, number> => {
  // fail early on truncated data, as fields of interest may not be read
  if (offset + definition.dataSize > view.byteLength) {
    throw new RangeError('Truncated data message');
  }

  const values = new Map<number, number>();
  let cursor = offset;
  for (const field of definition.fields) {
    const fieldOfInterest = definition.fieldsOfInterest.get(field.number);
    if (fieldOfInterest) {
      // arrays are allowed, only their first value is used
      if ((field.baseType & BASE_TYPE_NUMBER_MASK) === fieldOfInterest.baseType && field.size >= fieldOfInterest.size) {
        const value = readValue(view, cursor, fieldOfInterest, definition.littleEndian);
        if (value !== fieldOfInterest.invalid) {
          values.set(field.number, value);
        }
      } else {
        log(
          `Unexpected base type ${String(field.baseType)} or size ${String(field.size)} for field ${String(field.number)}`,
        );
      }
    }
    cursor += field.size;
  }
  return values;
};

const isFitFile = (view: DataView, headerSize: number): boolean => {
  if (headerSize !== 12 && headerSize !== 14) {
    log(`Incorrect FIT header size: ${String(headerSize)}`);
    return false;
  }
  // ".FIT" in ASCII
  if (view.getUint32(8, false) !== 0x2e464954) {
    log("Missing '.FIT' in header");
    return false;
  }
  return true;
};

const toAltitude = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : value / ALTITUDE_SCALE - ALTITUDE_OFFSET;

/**
 * Altitude is often missing on the first records, or on some of them.
 * Missing altitudes take the previous known one, leading ones the first known one, else 0.
 */
const fillAltitudes = (points: ParsedPoint[]): Point[] => {
  let altitude = points.find((point) => point.altitude !== undefined)?.altitude ?? 0;
  return points.map((point) => {
    altitude = point.altitude ?? altitude;
    return [point.longitude, point.latitude, altitude, point.time];
  });
};

/**
 * Extracts the track of a FIT activity file, from its `record` messages.
 *
 * When an error is encountered, parsing stops silently and the points already read are returned.
 * @throws when the input is too small to contain a FIT header
 */
export const extractGeometry = (blob: Uint8Array): Point[] => {
  if (blob.byteLength < 12) {
    throw new Error('File too small to be a FIT file');
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  const headerSize = view.getUint8(0);
  if (!isFitFile(view, headerSize)) {
    return [];
  }
  /** End of the data records, the CRC that follows is not checked */
  const end = headerSize + view.getUint32(4, true);

  const definitions: (MessageDefinition | undefined)[] = [];
  const points: ParsedPoint[] = [];
  /** Last full timestamp, the reference for compressed timestamp headers */
  let timestamp: number | undefined;
  /** Last altitude read, used to fill missing ones */
  let lastAltitude: number | undefined;

  try {
    let offset = headerSize;
    while (offset < end) {
      const header = view.getUint8(offset);
      offset += 1;

      if (!(header & COMPRESSED_HEADER_MASK) && header & DEFINITION_MESSAGE_MASK) {
        const { definition, size } = readDefinition(view, offset, (header & DEVELOPER_DATA_MASK) !== 0);
        definitions[header & LOCAL_MESSAGE_TYPE_MASK] = definition;
        offset += size;
        continue;
      }

      const isCompressed = (header & COMPRESSED_HEADER_MASK) !== 0;
      const localMessageType = isCompressed
        ? (header & COMPRESSED_LOCAL_MESSAGE_TYPE_MASK) >> 5
        : header & LOCAL_MESSAGE_TYPE_MASK;
      const definition = definitions[localMessageType];
      if (!definition) {
        throw new Error(`Missing definition for local message type ${String(localMessageType)}`);
      }

      const values = readData(view, offset, definition);
      offset += definition.dataSize;

      if (isCompressed) {
        if (timestamp !== undefined) {
          // the offset is relative to the 5 lowest bits of the reference, and rolls over every 32 seconds
          timestamp += ((header & COMPRESSED_TIME_MASK) - (timestamp & COMPRESSED_TIME_MASK)) & COMPRESSED_TIME_MASK;
        }
      } else {
        timestamp = values.get(TIMESTAMP_FIELD) ?? timestamp;
      }

      if (!definition.isRecord) {
        continue;
      }

      lastAltitude =
        toAltitude(values.get(RecordField.enhancedAltitude) ?? values.get(RecordField.altitude)) ?? lastAltitude;

      const latitude = values.get(RecordField.latitude);
      const longitude = values.get(RecordField.longitude);
      // (0, 0) is written by some devices without a GPS fix
      if (latitude === undefined || longitude === undefined || (latitude === 0 && longitude === 0)) {
        continue;
      }
      const lon = longitude * SEMICIRCLES_TO_DEGREES;
      const lat = latitude * SEMICIRCLES_TO_DEGREES;
      // semicircles can encode up to ±180°, only corrupted data goes beyond ±90° in latitude
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        log(`Position out of range: ${String(lat)}, ${String(lon)}`);
        continue;
      }
      const time = isCompressed ? timestamp : values.get(TIMESTAMP_FIELD);
      points.push({
        longitude: lon,
        latitude: lat,
        altitude: lastAltitude,
        time: time === undefined ? 0 : time + FIT_EPOCH_OFFSET,
      });
    }
  } catch (error: unknown) {
    log(error);
  }

  return fillAltitudes(points);
};
