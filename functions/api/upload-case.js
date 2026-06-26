import { errorResponse, handleOptions, successResponse } from '../lib/http.js';
import {
  buildMarkdown,
  buildMdBaseName,
  buildRepairMarkdown,
  buildRepairMdBaseName,
  galleryPath,
  isValidImageFileName,
  isValidMdFileName,
  makeImageFileName,
  mergeLegacyRepairWorkContent,
  normalizeContentType,
  parseFrontmatter,
  parseRepairFrontmatter,
  resolveMdFileName,
  validateCategory,
  validateGalleryMatches,
  validateImages,
} from '../lib/case-content.js';
import { commitFiles, commitUrl, listExistingMdNames, pathExists } from '../lib/github.js';
import { buildUploadSuccessMessage, triggerPagesDeploy } from '../lib/deploy.js';
import { requireGithubConfig, requireUploadAuth } from '../lib/session.js';

const CONTENT_DIRS = {
  production: 'public/content/cases',
  repair: 'public/content/repair-cases',
};

const CASE_URLS = {
  production: 'https://dreamev.kr/cases.html',
  repair: 'https://dreamev.kr/repair-cases.html',
};

export async function onRequestOptions() {
  return handleOptions();
}

function readImageFileNames(formData) {
  const names = [
    ...formData.getAll('imageFileNames[]'),
    ...formData.getAll('imageFileNames'),
  ].filter((v) => typeof v === 'string');
  return names;
}

function readImages(formData) {
  return formData.getAll('images').filter((v) => v instanceof File);
}

async function resolveFinalImageNames(env, proposedNames, stamp, count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    const proposed = proposedNames[i];
    if (isValidImageFileName(proposed) && !names.includes(proposed)) {
      const imagePath = `public/images/${proposed}`;
      if (!(await pathExists(env, imagePath))) {
        names.push(proposed);
        continue;
      }
    }
    let attempt = 0;
    let candidate = makeImageFileName(stamp, i + 1);
    while (names.includes(candidate) || await pathExists(env, `public/images/${candidate}`)) {
      attempt += 1;
      candidate = makeImageFileName(stamp, i + 1, `d${attempt}`);
    }
    names.push(candidate);
  }
  return names;
}

async function handleProductionUpload(env, formData, fields) {
  const {
    title, category, purpose, usagePlace, location, date, proposedMdFileName, summary,
    customerRequest, productionDetails, features, workDetails, result, specifications,
    imageStamp, images, proposedNames,
  } = fields;

  if (!category) {
    return errorResponse('VALIDATION_ERROR', '차량 종류 또는 제작 카테고리를 입력해 주세요.', 400);
  }
  if (!validateCategory(category)) {
    return errorResponse('VALIDATION_ERROR', '카테고리 형식이 올바르지 않습니다.', 400);
  }

  const mdBase = buildMdBaseName(category, title);
  if (proposedMdFileName && !isValidMdFileName(proposedMdFileName)) {
    return errorResponse('VALIDATION_ERROR', 'md 파일명 형식이 올바르지 않습니다.', 400);
  }

  const contentDir = CONTENT_DIRS.production;
  const existingMd = await listExistingMdNames(env, contentDir);
  const mdFileName = resolveMdFileName(mdBase, date, existingMd);

  const stamp = imageStamp || proposedNames[0]?.slice(0, 15) || '';
  const finalImageNames = await resolveFinalImageNames(env, proposedNames, stamp, images.length);

  const markdown = buildMarkdown({
    title,
    category,
    purpose,
    usagePlace,
    location,
    date,
    imageFileNames: finalImageNames,
    summary,
    customerRequest,
    productionDetails,
    features,
    workDetails,
    result,
    specifications,
  });

  const galleryCheck = validateGalleryMatches(finalImageNames, markdown);
  if (!galleryCheck.ok) {
    return errorResponse('VALIDATION_ERROR', galleryCheck.message, 400);
  }

  const parsed = parseFrontmatter(markdown);
  if (!parsed.ok || parsed.title !== title.trim() || parsed.category !== category) {
    return errorResponse('VALIDATION_ERROR', '생성된 Markdown 형식이 올바르지 않습니다.', 400);
  }

  const mdPath = `${contentDir}/${mdFileName}`;
  const commitMessage = `제작사례 등록: ${category} ${title}`;
  const caseUrl = CASE_URLS.production;
  const successMessage = '제작사례가 GitHub에 등록되었습니다.';

  return {
    mdPath,
    mdFileName,
    markdown,
    finalImageNames,
    images,
    commitMessage,
    caseUrl,
    successMessage,
  };
}

async function handleRepairUpload(env, formData, fields) {
  const {
    title, date, vehicle, location, proposedMdFileName, summary,
    customerRequest, inspectionResult, workDetails, workContent, result, imageStamp, images, proposedNames,
  } = fields;

  if (!vehicle) {
    return errorResponse('VALIDATION_ERROR', '차량 종류를 입력해 주세요.', 400);
  }

  const resolvedWorkContent = mergeLegacyRepairWorkContent({ workContent, workDetails });
  if (!resolvedWorkContent) {
    return errorResponse('VALIDATION_ERROR', '작업 내용을 입력해 주세요.', 400);
  }
  if (resolvedWorkContent.length < 4) {
    return errorResponse('VALIDATION_ERROR', '작업 내용을 조금 더 자세히 입력해 주세요.', 400);
  }
  if (resolvedWorkContent.length > 2000) {
    return errorResponse('VALIDATION_ERROR', '작업 내용은 2000자 이하로 입력해 주세요.', 400);
  }

  const mdBase = buildRepairMdBaseName(title);
  if (proposedMdFileName && !isValidMdFileName(proposedMdFileName)) {
    return errorResponse('VALIDATION_ERROR', 'md 파일명 형식이 올바르지 않습니다.', 400);
  }

  const contentDir = CONTENT_DIRS.repair;
  const existingMd = await listExistingMdNames(env, contentDir);
  const mdFileName = resolveMdFileName(mdBase, date, existingMd);

  const stamp = imageStamp || proposedNames[0]?.slice(0, 15) || '';
  const finalImageNames = await resolveFinalImageNames(env, proposedNames, stamp, images.length);

  const markdown = buildRepairMarkdown({
    title,
    vehicle,
    location,
    date,
    imageFileNames: finalImageNames,
    summary,
    customerRequest,
    inspectionResult,
    workDetails: resolvedWorkContent,
    workContent: resolvedWorkContent,
    result,
  });

  const galleryCheck = validateGalleryMatches(finalImageNames, markdown);
  if (!galleryCheck.ok) {
    return errorResponse('VALIDATION_ERROR', galleryCheck.message, 400);
  }

  const parsed = parseRepairFrontmatter(markdown);
  if (!parsed.ok || parsed.title !== title.trim()) {
    return errorResponse('VALIDATION_ERROR', '생성된 Markdown 형식이 올바르지 않습니다.', 400);
  }

  const mdPath = `${contentDir}/${mdFileName}`;
  const commitMessage = `수리사례 등록: ${title}`;
  const caseUrl = CASE_URLS.repair;
  const successMessage = '수리사례가 GitHub에 등록되었습니다.';

  return {
    mdPath,
    mdFileName,
    markdown,
    finalImageNames,
    images,
    commitMessage,
    caseUrl,
    successMessage,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const config = requireGithubConfig(env);
  if (!config.ok) return config.response;

  const auth = requireUploadAuth(request, env);
  if (!auth.ok) return auth.response;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'multipart/form-data 요청이 필요합니다.', 400);
  }

  const contentType = normalizeContentType(formData.get('contentType'));
  const title = (formData.get('title') || '').toString().trim();
  const category = (formData.get('category') || '').toString().trim();
  const purpose = (formData.get('purpose') || '').toString().trim();
  const usagePlace = (formData.get('usagePlace') || '').toString().trim();
  const date = (formData.get('date') || '').toString().trim();
  const vehicle = (formData.get('vehicle') || '').toString().trim();
  const location = (formData.get('location') || '').toString().trim();
  const proposedMdFileName = (formData.get('mdFileName') || '').toString().trim();
  const summary = (formData.get('summary') || '').toString();
  const customerRequest = (formData.get('customerRequest') || '').toString();
  const inspectionResult = (formData.get('inspectionResult') || '').toString();
  const productionDetails = (formData.get('productionDetails') || '').toString();
  const features = (formData.get('features') || '').toString();
  const workDetails = (formData.get('workDetails') || '').toString();
  const workContent = (formData.get('workContent') || '').toString();
  const result = (formData.get('result') || '').toString();
  const imageStamp = (formData.get('imageStamp') || '').toString().trim();
  let specifications = {};
  const specsRaw = (formData.get('specifications') || '').toString().trim();
  if (specsRaw) {
    try {
      specifications = JSON.parse(specsRaw);
    } catch {
      return errorResponse('VALIDATION_ERROR', '사양 정보 형식이 올바르지 않습니다.', 400);
    }
  }

  if (!title) return errorResponse('VALIDATION_ERROR', '제목을 입력해 주세요.', 400);

  const images = readImages(formData).map((file) => ({
    file,
    type: file.type,
    size: file.size,
  }));
  const imageValidation = validateImages(images);
  if (!imageValidation.ok) {
    return errorResponse('VALIDATION_ERROR', imageValidation.message, 400);
  }

  const proposedNames = readImageFileNames(formData);
  if (proposedNames.length !== images.length) {
    return errorResponse('VALIDATION_ERROR', '이미지 파일명 정보가 올바르지 않습니다.', 400);
  }
  for (const name of proposedNames) {
    if (!isValidImageFileName(name)) {
      return errorResponse('VALIDATION_ERROR', '이미지 파일명 형식이 올바르지 않습니다.', 400);
    }
  }

  const fields = {
    title,
    category,
    purpose,
    usagePlace,
    date,
    vehicle,
    location,
    proposedMdFileName,
    summary,
    customerRequest,
    inspectionResult,
    productionDetails,
    features,
    workDetails,
    workContent,
    result,
    specifications,
    imageStamp,
    images,
    proposedNames,
  };

  try {
    const uploadPlan = contentType === 'repair'
      ? await handleRepairUpload(env, formData, fields)
      : await handleProductionUpload(env, formData, fields);

    if (uploadPlan instanceof Response) return uploadPlan;

    const {
      mdPath, mdFileName, finalImageNames, images: imageList,
      commitMessage, caseUrl, successMessage,
    } = uploadPlan;

    const files = [{ path: mdPath, content: uploadPlan.markdown }];

    for (let i = 0; i < imageList.length; i++) {
      const bytes = new Uint8Array(await imageList[i].file.arrayBuffer());
      files.push({
        path: `public/images/${finalImageNames[i]}`,
        binary: bytes,
      });
    }

    const commitSha = await commitFiles(env, files, commitMessage);

    const deployResult = await triggerPagesDeploy(env);

    return successResponse({
      commitSha,
      mdPath,
      mdFileName,
      contentType,
      imagePaths: finalImageNames.map((n) => `public/images/${n}`),
      galleryPaths: finalImageNames.map((n) => galleryPath(n)),
      caseUrl,
      githubCommitUrl: commitUrl(env, commitSha),
      deploymentTriggered: deployResult.triggered,
      deploymentSkipped: deployResult.skipped ?? false,
      deploymentMessage: deployResult.message || deployResult.error || null,
      message: buildUploadSuccessMessage(successMessage, deployResult),
    });
  } catch {
    return errorResponse('GITHUB_ERROR', 'GitHub 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 502);
  }
}
