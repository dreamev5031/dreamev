/**
 * Cloudflare Pages Deploy Hook — GitHub API 커밋 후 Production 재배포 트리거.
 * Hook URL은 CLOUDFLARE_DEPLOY_HOOK_URL 환경변수에만 저장한다.
 */
export async function triggerPagesDeploy(env, fetchImpl = fetch) {
  const hookUrl = (env.CLOUDFLARE_DEPLOY_HOOK_URL || '').trim();
  if (!hookUrl) {
    return {
      triggered: false,
      skipped: true,
      message: 'Deploy Hook URL이 설정되지 않았습니다. Cloudflare 대시보드에서 CLOUDFLARE_DEPLOY_HOOK_URL을 설정해 주세요.',
    };
  }

  try {
    const res = await fetchImpl(hookUrl, { method: 'POST' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        triggered: false,
        skipped: false,
        error: `Deploy Hook HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`,
      };
    }
    return {
      triggered: true,
      skipped: false,
      message: 'Cloudflare Pages 재배포가 시작되었습니다. 반영까지 1~3분 정도 걸릴 수 있습니다.',
    };
  } catch (err) {
    return {
      triggered: false,
      skipped: false,
      error: err?.message || 'Deploy Hook 호출 중 네트워크 오류가 발생했습니다.',
    };
  }
}

export function buildUploadSuccessMessage(baseMessage, deployResult) {
  if (deployResult.triggered) {
    return `${baseMessage} 사이트 재배포가 시작되었습니다. 이미지가 곧 dreamev.kr에 표시됩니다.`;
  }
  if (deployResult.skipped) {
    return `${baseMessage} (재배포 Hook 미설정 — Cloudflare에서 수동 배포가 필요할 수 있습니다.)`;
  }
  return `${baseMessage} GitHub 등록은 완료됐으나 재배포 요청에 실패했습니다: ${deployResult.error}`;
}
