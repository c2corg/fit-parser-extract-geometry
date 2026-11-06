import { describe, expect, it } from 'vitest';

import { extractGeometry } from '../src/index.ts';
import { BaseType, FitBuilder, INVALID, MesgNum, RecordField, alt, sc, ts } from './support/fit-builder.ts';

const T0 = 1_700_000_000; // 2023-11-14T22:13:20Z

const LAT = { num: RecordField.latitude, baseType: BaseType.sint32 };
const LON = { num: RecordField.longitude, baseType: BaseType.sint32 };
const ALT = { num: RecordField.altitude, baseType: BaseType.uint16 };
const ENHANCED_ALT = { num: RecordField.enhancedAltitude, baseType: BaseType.uint32 };
const TIME = { num: RecordField.timestamp, baseType: BaseType.uint32 };
const HR = { num: RecordField.heartRate, baseType: BaseType.uint8 };

/** A record definition with timestamp, position and altitude on local type 0 */
const withRecordDefinition = (options?: { bigEndian?: boolean }): FitBuilder =>
  new FitBuilder().definition(0, MesgNum.record, [TIME, LAT, LON, ALT], options);

const expectPoint = (actual: number[] | undefined, expected: [number, number, number, number]): void => {
  expect(actual).toBeDefined();
  const [lon, lat, altitude, time] = actual ?? [];
  expect(lon).toBeCloseTo(expected[0], 6);
  expect(lat).toBeCloseTo(expected[1], 6);
  expect(altitude).toBeCloseTo(expected[2], 6);
  expect(time).toBe(expected[3]);
};

describe('extractGeometry', () => {
  describe('records', () => {
    it('returns [longitude, latitude, altitude, time] for each record', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(1234.4)])
        .data(0, [ts(T0 + 1), sc(45.6), sc(-6.25), alt(-12)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(2);
      expectPoint(geometry[0], [6.25, 45.5, 1234.4, T0]);
      expectPoint(geometry[1], [-6.25, 45.6, -12, T0 + 1]);
    });

    it('reads big-endian messages', () => {
      const fit = withRecordDefinition({ bigEndian: true })
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(1234.4)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 1234.4, T0]);
    });

    it('accepts the legacy 12 bytes header', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .build({ headerSize: 12 });

      expect(extractGeometry(fit)).toHaveLength(1);
    });

    it('accepts any Uint8Array view, e.g. a Node.js Buffer', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .build();
      const padded = new Uint8Array(fit.length + 10);
      padded.set(fit, 7);

      expect(extractGeometry(padded.subarray(7, 7 + fit.length))).toHaveLength(1);
      expect(extractGeometry(Buffer.from(fit))).toHaveLength(1);
    });

    it('skips records without a position', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), INVALID.sint32, INVALID.sint32, alt(100)])
        .data(0, [ts(T0 + 1), sc(45.5), INVALID.sint32, alt(100)])
        .data(0, [ts(T0 + 2), sc(45.5), sc(6.25), alt(100)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(1);
      expectPoint(geometry[0], [6.25, 45.5, 100, T0 + 2]);
    });

    it('keeps positions on the equator or the prime meridian', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), 0, alt(100)])
        .data(0, [ts(T0 + 1), 0, sc(6.25), alt(100)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(2);
      expectPoint(geometry[0], [0, 45.5, 100, T0]);
      expectPoint(geometry[1], [6.25, 0, 100, T0 + 1]);
    });

    it('skips (0, 0) positions, written by devices without a GPS fix', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), 0, 0, alt(100)])
        .data(0, [ts(T0 + 1), sc(45.5), sc(6.25), alt(100)])
        .build();

      expect(extractGeometry(fit)).toHaveLength(1);
    });

    it('sets time to 0 when records have no timestamp', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [LAT, LON, ALT])
        .data(0, [sc(45.5), sc(6.25), alt(100)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 100, 0]);
    });

    it('skips fields and messages it does not need', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.fileId, [
          { num: 0, baseType: BaseType.enum },
          { num: 4, baseType: BaseType.uint32 },
        ])
        .data(0, [4, ts(T0)])
        .definition(1, MesgNum.record, [HR, TIME, { num: 42, baseType: BaseType.string, size: 7 }, LAT, LON, ALT])
        .data(1, [150, ts(T0), 0x41, sc(45.5), sc(6.25), alt(100)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(1);
      expectPoint(geometry[0], [6.25, 45.5, 100, T0]);
    });

    it('skips developer fields', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON, ALT], { developerFieldSizes: [1, 4] })
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .data(0, [ts(T0 + 1), sc(45.6), sc(6.26), alt(101)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(2);
      expectPoint(geometry[1], [6.26, 45.6, 101, T0 + 1]);
    });

    it('skips positions out of range', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), 0x7ffffffe, sc(6.25), alt(100)])
        .data(0, [ts(T0 + 1), sc(45.5), sc(6.25), alt(100)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(1);
      expectPoint(geometry[0], [6.25, 45.5, 100, T0 + 1]);
    });

    it('sets time to 0 for records without timestamp, after records with one', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .data(0, [INVALID.uint32, sc(45.6), sc(6.26), alt(100)])
        .build();

      expect(extractGeometry(fit).map((p) => p[3])).toEqual([T0, 0]);
    });

    it('skips developer fields of other messages', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.event, [TIME], { developerFieldSizes: [3] })
        .data(0, [ts(T0)])
        .definition(1, MesgNum.record, [LAT, LON])
        .data(1, [sc(45.5), sc(6.25)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 0, 0]);
    });

    it('uses the latest definition of a local message type', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .definition(0, MesgNum.record, [LON, LAT])
        .data(0, [sc(7), sc(46)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(2);
      expectPoint(geometry[1], [7, 46, 100, 0]);
    });

    it('reads the first value of array fields', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [{ ...LAT, size: 8 }, LON])
        .data(0, [sc(45.5), sc(6.25)])
        .build();

      // the builder writes the first value, and zeros for the rest of the array
      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 0, 0]);
    });
  });

  describe('altitude', () => {
    it('prefers enhanced altitude over altitude', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON, ALT, ENHANCED_ALT])
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100), alt(5000)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 5000, T0]);
    });

    it('falls back to altitude when enhanced altitude is invalid', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON, ALT, ENHANCED_ALT])
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100), INVALID.uint32])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 100, T0]);
    });

    it('reads enhanced altitude alone', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON, ENHANCED_ALT])
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(8848)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 8848, T0]);
    });

    it('fills missing altitudes with the previous one, including from records without position', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .data(0, [ts(T0 + 1), sc(45.5), sc(6.25), INVALID.uint16])
        .data(0, [ts(T0 + 2), INVALID.sint32, INVALID.sint32, alt(120)])
        .data(0, [ts(T0 + 3), sc(45.5), sc(6.25), INVALID.uint16])
        .build();

      expect(extractGeometry(fit).map((p) => p[2])).toEqual([100, 100, 120]);
    });

    it('fills leading missing altitudes with the first known one', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), INVALID.uint16])
        .data(0, [ts(T0 + 1), sc(45.5), sc(6.25), INVALID.uint16])
        .data(0, [ts(T0 + 2), sc(45.5), sc(6.25), alt(120)])
        .build();

      expect(extractGeometry(fit).map((p) => p[2])).toEqual([120, 120, 120]);
    });

    it('keeps a real 0 m altitude', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(0)])
        .data(0, [ts(T0 + 1), sc(45.5), sc(6.25), alt(10)])
        .build();

      expect(extractGeometry(fit).map((p) => p[2])).toEqual([0, 10]);
    });

    it('sets altitude to 0 when no record has one', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [LAT, LON])
        .data(0, [sc(45.5), sc(6.25)])
        .build();

      expect(extractGeometry(fit)).toEqual([[expect.closeTo(6.25, 6), expect.closeTo(45.5, 6), 0, 0]]);
    });
  });

  describe('compressed timestamp headers', () => {
    it('computes time from the last full timestamp', () => {
      const t = ts(T0);
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON])
        .data(0, [t, sc(45.5), sc(6.25)])
        .definition(1, MesgNum.record, [LAT, LON])
        .compressed(1, (t + 3) & 0x1f, [sc(45.6), sc(6.26)])
        .compressed(1, (t + 40) & 0x1f, [sc(45.7), sc(6.27)])
        .build();

      expect(extractGeometry(fit).map((p) => p[3])).toEqual([T0, T0 + 3, T0 + 40 - 32]);
    });

    it('handles the 5 bits offset rollover', () => {
      const t = ts(T0) - (ts(T0) & 0x1f) + 30; // offset 30
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [TIME, LAT, LON])
        .data(0, [t, sc(45.5), sc(6.25)])
        .compressed(0, 2, [INVALID.uint32, sc(45.6), sc(6.26)])
        .build();

      const unix = t + 631065600;
      expect(extractGeometry(fit).map((p) => p[3])).toEqual([unix, unix + 4]);
    });

    it.each([0, 1, 2, 3])('reads local message type %i', (localType) => {
      const t = ts(T0);
      const fit = new FitBuilder()
        .definition(localType, MesgNum.record, [TIME, LAT, LON])
        .data(localType, [t, sc(45.5), sc(6.25)])
        .compressed(localType, (t + 1) & 0x1f, [INVALID.uint32, sc(45.6), sc(6.26)])
        .build();

      const geometry = extractGeometry(fit);

      expect(geometry).toHaveLength(2);
      expectPoint(geometry[1], [6.26, 45.6, 0, T0 + 1]);
    });

    it('sets time to 0 without a time reference', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [LAT, LON])
        .compressed(0, 5, [sc(45.5), sc(6.25)])
        .build();

      expectPoint(extractGeometry(fit)[0], [6.25, 45.5, 0, 0]);
    });

    it('uses timestamps of other messages as time reference', () => {
      const t = ts(T0);
      const fit = new FitBuilder()
        .definition(0, MesgNum.event, [TIME, { num: 0, baseType: BaseType.enum }])
        .data(0, [t, 0])
        .definition(1, MesgNum.record, [LAT, LON])
        .compressed(1, (t + 2) & 0x1f, [sc(45.5), sc(6.25)])
        .build();

      expect(extractGeometry(fit).map((p) => p[3])).toEqual([T0 + 2]);
    });
  });

  describe('invalid files', () => {
    it('throws when the file is too small to hold a header', () => {
      expect(() => extractGeometry(new Uint8Array(11))).toThrow('File too small to be a FIT file');
    });

    it('returns an empty geometry when the header size is wrong', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .build({ headerSize: 13 });

      expect(extractGeometry(fit)).toEqual([]);
    });

    it('returns an empty geometry without .FIT signature', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .build();
      fit[8] = 0x20;

      expect(extractGeometry(fit)).toEqual([]);
    });

    it('returns the points read before a truncation', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .data(0, [ts(T0 + 1), sc(45.6), sc(6.26), alt(101)])
        .build();

      expect(extractGeometry(fit.subarray(0, fit.length - 6))).toHaveLength(1);
    });

    it('returns the points read before a data message without definition', () => {
      const fit = withRecordDefinition()
        .data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)])
        .raw(0x05, 1, 2, 3)
        .data(0, [ts(T0 + 1), sc(45.6), sc(6.26), alt(101)])
        .build();

      expect(extractGeometry(fit)).toHaveLength(1);
    });

    it('stops at the data size from the header, ignoring trailing bytes', () => {
      const builder = withRecordDefinition().data(0, [ts(T0), sc(45.5), sc(6.25), alt(100)]);
      const fit = builder.build();
      const dataSize = fit.length - 14 - 2;
      builder.data(0, [ts(T0 + 1), sc(45.6), sc(6.26), alt(101)]);

      expect(extractGeometry(builder.build({ dataSize }))).toHaveLength(1);
    });

    it('never throws nor loops on corrupted data', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.event, [TIME, { num: 0, baseType: BaseType.enum }], { developerFieldSizes: [2] })
        .data(0, [ts(T0), 0])
        .definition(1, MesgNum.record, [TIME, LAT, LON, ALT, ENHANCED_ALT])
        .data(1, [ts(T0), sc(45.5), sc(6.25), alt(100), alt(100)])
        .definition(2, MesgNum.record, [LAT, LON])
        .compressed(2, 3, [sc(45.6), sc(6.26)])
        .build();

      // every truncation, and every byte of the data records set to a few remarkable values
      for (let length = 12; length <= fit.length; length++) {
        expect(() => extractGeometry(fit.subarray(0, length))).not.toThrow();
      }
      for (let i = 14; i < fit.length; i++) {
        for (const value of [0x00, 0x20, 0x40, 0x60, 0x7f, 0x80, 0xe0, 0xff]) {
          const corrupted = fit.slice();
          corrupted[i] = value;
          expect(() => extractGeometry(corrupted)).not.toThrow();
        }
      }
    });

    it('skips fields of interest with an unexpected base type', () => {
      const fit = new FitBuilder()
        .definition(0, MesgNum.record, [{ num: RecordField.altitude, baseType: BaseType.uint8 }, LAT, LON])
        .data(0, [12, sc(45.5), sc(6.25)])
        .data(0, [12, sc(45.6), sc(6.26)])
        .build();

      expect(extractGeometry(fit)).toHaveLength(2);
    });
  });
});
