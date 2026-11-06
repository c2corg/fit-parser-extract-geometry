import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractGeometry } from '../src/index.ts';

const samplesDir = resolve(import.meta.dirname, '../samples');

describe('FIT', () => {
  describe.each([
    'activity_developerdata',
    'activity_lowbattery',
    'activity_multisport',
    'activity_poolswim',
    'activity_poolswim_with_hr',
    'activity_truncated',
    'DeveloperData',
    'MonitoringFile',
    'Settings',
    'WeightScaleMultiUser',
    'WeightScaleSingleUser',
    'WorkoutCustomTargetValues',
    'WorkoutIndividualSteps',
    'WorkoutRepeatGreaterThanStep',
    'WorkoutRepeatSteps',
  ])('loads FIT file %s', (name) => {
    it('expects an empty geometry', () => {
      // each of these files have either no record, or insufficient data (e.g. no coordinates)
      // but it should not fail...
      const geometry = extractGeometry(readFileSync(resolve(samplesDir, name + '.fit')));
      expect(geometry).toHaveLength(0);
    });
  });

  it('retrieves geometry', () => {
    const geometry = extractGeometry(readFileSync(resolve(samplesDir, 'records.fit')));

    // the Garmin FIT SDK decodes 2608 records with a position in this file
    expect(geometry).toHaveLength(2608);
    // the first 2 points have no altitude, they take the first known one
    expect(geometry.slice(0, 3)).toMatchInlineSnapshot(`
      [
        [
          6.047934824600816,
          45.32550291158259,
          1440,
          1665913121,
        ],
        [
          6.048013782128692,
          45.325430911034346,
          1440,
          1665913125,
        ],
        [
          6.0481292847543955,
          45.32537207007408,
          1440,
          1665913140,
        ],
      ]
    `);
    expect(geometry.at(-1)).toMatchInlineSnapshot(`
      [
        6.047008708119392,
        45.32560131512582,
        1440,
        1665930112,
      ]
    `);
  });

  it('retrieves a geometry along the equator', () => {
    // synthetic activity from the FIT SDK, with latitude 0 and longitude increasing from 0
    const geometry = extractGeometry(readFileSync(resolve(samplesDir, 'Activity.fit')));

    // the first record, at (0, 0), is considered without GPS fix
    expect(geometry).toHaveLength(3600);
    expect(geometry.every(([, latitude]) => latitude === 0)).toBe(true);
    expect(geometry[0]).toMatchInlineSnapshot(`
      [
        0.000008968636393547058,
        0,
        126,
        1626815481,
      ]
    `);
  });
});
