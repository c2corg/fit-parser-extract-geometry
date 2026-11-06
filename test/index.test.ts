import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractGeometry } from '../src/index.ts';

const samplesDir = resolve(import.meta.dirname, '../samples');

describe('FIT', () => {
  describe.each([
    'Activity',
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
      // but it shoud not fail...
      const geometry = extractGeometry(readFileSync(resolve(samplesDir, name + '.fit')));
      expect(geometry).toHaveLength(0);
    });
  });

  it('retrieves geometry', () => {
    const geometry = extractGeometry(readFileSync(resolve(samplesDir, 'records.fit')));
    expect(geometry).not.toHaveLength(0);
  });
});
