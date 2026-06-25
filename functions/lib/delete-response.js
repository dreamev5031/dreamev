import { createStepTimer } from './timing.js';
import { triggerPagesDeploy } from './deploy.js';
import { commitUrl } from './github.js';

export function buildDeleteWarnings(result) {
  const warnings = [...(result.warnings || [])];
  if (result.imagesKept?.length) {
    warnings.push({
      code: 'IMAGES_KEPT_FOR_OTHER_CASES',
      message: '다른 게시물에서 사용 중인 이미지 파일은 보존되었습니다.',
    });
  }
  return warnings;
}

export function buildDeleteResponseCode(warnings, deployWarning) {
  if (warnings.length > 0 || deployWarning) return 'DELETE_COMPLETED_WITH_WARNING';
  return 'DELETE_COMPLETED';
}

export function buildDeleteUserMessage(warnings, deployWarning) {
  const base = '삭제가 완료되었습니다. 홈페이지 반영까지 1~3분 정도 걸릴 수 있습니다.';
  const hasCleanupWarning = warnings.some((w) => (
    w.code === 'IMAGE_CLEANUP_INCOMPLETE' || w.code === 'IMAGE_CLEANUP_FAILED'
  ));
  if (hasCleanupWarning || deployWarning) {
    return '게시물은 삭제됐지만 일부 파일 정리가 지연되고 있습니다. 홈페이지 반영까지 1~3분 정도 걸릴 수 있습니다.';
  }
  return base;
}

export function queuePagesDeploy(context, env, requestId) {
  const hookConfigured = Boolean((env.CLOUDFLARE_DEPLOY_HOOK_URL || '').trim());
  if (!hookConfigured) {
    return {
      deploymentTriggered: false,
      deploymentPending: false,
      deploymentSkipped: true,
      deployWarning: null,
    };
  }

  context.waitUntil(
    triggerPagesDeploy(env)
      .then((deploy) => {
        console.info('delete deploy hook finished', {
          requestId,
          triggered: deploy.triggered,
          skipped: deploy.skipped,
          error: deploy.error || null,
        });
      })
      .catch((err) => {
        console.error('delete deploy hook failed', { requestId, message: err.message });
      }),
  );

  return {
    deploymentTriggered: false,
    deploymentPending: true,
    deploymentSkipped: false,
    deployWarning: null,
  };
}

export function buildDeleteSuccessPayload(env, result, { requestId, timer, deployState }) {
  const warnings = buildDeleteWarnings(result);
  let deployWarning = deployState.deployWarning;
  if (deployState.deploymentSkipped) {
    warnings.push({
      code: 'DEPLOY_HOOK_SKIPPED',
      message: 'Deploy Hook이 설정되지 않아 자동 재배포가 건너뛰어졌습니다.',
    });
  }

  timer?.mark('respond');
  timer?.log('delete case timing');

  return {
    requestId,
    success: true,
    deleted: true,
    alreadyDeleted: Boolean(result.alreadyDeleted),
    code: buildDeleteResponseCode(warnings, deployWarning),
    warnings,
    commitSha: result.commitSha || null,
    commitUrl: result.commitSha ? commitUrl(env, result.commitSha) : null,
    mdPath: result.mdPath,
    imagesDeleted: result.imagesDeleted || [],
    imagesKept: result.imagesKept || [],
    imagesMissing: result.imagesMissing || [],
    message: result.message,
    userMessage: buildDeleteUserMessage(warnings, deployWarning),
    deploymentTriggered: deployState.deploymentTriggered,
    deploymentPending: deployState.deploymentPending,
    deploymentSkipped: deployState.deploymentSkipped,
    timings: timer?.summary() || null,
  };
}

export { createStepTimer };
