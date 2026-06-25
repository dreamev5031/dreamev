import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeleteResponseCode,
  buildDeleteSuccessPayload,
  buildDeleteUserMessage,
} from '../lib/delete-response.js';
import { buildUploadSuccessMessage } from '../lib/deploy.js';
import { createStepTimer } from '../lib/timing.js';

test('buildUploadSuccessMessage throws when deploy result passed as sole argument', () => {
  assert.throws(
    () => buildUploadSuccessMessage({ triggered: true, skipped: false }),
    /Cannot read properties of undefined/,
  );
});

test('buildDeleteSuccessPayload marks deleted with warnings', () => {
  const timer = createStepTimer('req-1');
  timer.mark('auth');
  const payload = buildDeleteSuccessPayload(
    { GITHUB_OWNER: 'o', GITHUB_REPO: 'r' },
    {
      deleted: true,
      alreadyDeleted: false,
      commitSha: 'abc123',
      mdPath: 'public/content/cases/test.md',
      imagesDeleted: [],
      imagesKept: [],
      imagesMissing: ['20260625-053835-01.webp'],
      warnings: [{
        code: 'IMAGE_CLEANUP_INCOMPLETE',
        message: '게시물은 삭제됐지만 일부 이미지 파일이 저장소에 없어 정리되지 않았습니다.',
        files: ['20260625-053835-01.webp'],
      }],
      message: '게시물이 삭제되었습니다.',
    },
    {
      requestId: 'req-1',
      timer,
      deployState: {
        deploymentTriggered: false,
        deploymentPending: true,
        deploymentSkipped: false,
        deployWarning: null,
      },
    },
  );

  assert.equal(payload.success, true);
  assert.equal(payload.deleted, true);
  assert.equal(payload.code, 'DELETE_COMPLETED_WITH_WARNING');
  assert.ok(payload.warnings.length >= 1);
  assert.match(payload.userMessage, /일부 파일 정리가 지연/);
  assert.equal(payload.deploymentPending, true);
});

test('already deleted returns success code', () => {
  const code = buildDeleteResponseCode([], null);
  assert.equal(code, 'DELETE_COMPLETED');
  const message = buildDeleteUserMessage([], null);
  assert.match(message, /삭제가 완료되었습니다/);
});
