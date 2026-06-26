import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRepairResultFallback,
  isWeakRepairWorkContent,
  normalizeRepairDraftInput,
  validateRepairDraftInput,
} from '../lib/repair-draft-canonical.js';

test('normalizeRepairDraftInput returns canonical shape without undefined', () => {
  const input = normalizeRepairDraftInput({
    contentType: 'repair',
    vehicle: '석고 운반용 전동차',
    symptoms: ['컨택터 작동 불량'],
    workContent: '컨택터 교체',
    result: [],
  });
  assert.equal(input.contentType, 'repair');
  assert.equal(typeof input.userTitle, 'string');
  assert.equal(typeof input.vehicle, 'string');
  assert.equal(typeof input.location, 'string');
  assert.equal(typeof input.workDate, 'string');
  assert.equal(typeof input.workContent, 'string');
  assert.equal(typeof input.additionalNote, 'string');
  assert.deepEqual(input.symptoms, ['컨택터 작동 불량']);
  assert.deepEqual(input.diagnosis, []);
  assert.deepEqual(input.result, []);
});

test('normalizeRepairDraftInput ingests legacy fields only at ingest', () => {
  const input = normalizeRepairDraftInput({
    vehicle: '전동차',
    symptoms: ['주행 불가'],
    selectedWorkItems: ['컨트롤러 교체'],
    work: ['배선 점검'],
  });
  assert.match(input.workContent, /컨트롤러 교체/);
  assert.match(input.workContent, /배선 점검/);
  assert.equal(input.selectedWorkItems, undefined);
});

test('validateRepairDraftInput rejects missing vehicle and symptoms', () => {
  const missingVehicle = validateRepairDraftInput(normalizeRepairDraftInput({
    symptoms: ['전진 불량'],
    workContent: '배선 보수',
  }));
  assert.equal(missingVehicle.ok, false);
  assert.equal(missingVehicle.code, 'VALIDATION_ERROR');

  const missingSymptoms = validateRepairDraftInput(normalizeRepairDraftInput({
    vehicle: '전동차',
    workContent: '배선 보수',
  }));
  assert.equal(missingSymptoms.ok, false);
  assert.equal(missingSymptoms.code, 'VALIDATION_ERROR');
});

test('validateRepairDraftInput rejects weak workContent 7272', () => {
  const result = validateRepairDraftInput(normalizeRepairDraftInput({
    vehicle: '전동차',
    symptoms: ['전진 불량'],
    workContent: '7272',
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.match(result.message, /자세히/);
});

test('validateRepairDraftInput allows empty result', () => {
  const result = validateRepairDraftInput(normalizeRepairDraftInput({
    vehicle: '석고 운반용 전동차',
    symptoms: ['컨택터 작동 불량', '주행 불가'],
    workContent: '컨택터 이상을 확인하여 신품 컨택터로 교체했습니다.',
    result: [],
  }));
  assert.equal(result.ok, true);
});

test('formatRepairResultFallback avoids asserting success when result empty', () => {
  assert.match(formatRepairResultFallback([]), /확인이 필요/);
  assert.match(formatRepairResultFallback(['정상 작동']), /정상 작동/);
});

test('isWeakRepairWorkContent detects numeric-only input', () => {
  assert.equal(isWeakRepairWorkContent('7272'), true);
  assert.equal(isWeakRepairWorkContent('컨택터 교체'), false);
});
