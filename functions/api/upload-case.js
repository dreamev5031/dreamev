import { errorResponse, handleOptions, successResponse } from '../lib/http.js';
import {
  buildMarkdown,
  buildMdBaseName,
  galleryPath,
  isValidImageFileName,
  isValidMdFileName,
  makeImageFileName,
  parseFrontmatter,
  resolveMdFileName,
  validateCategory,
  validateGalleryMatches,
  validateImages,
} from '../lib/case-content.js';
import { commitFiles, commitUrl, listExistingMdNames, pathExists } from '../lib/github.js';
import { requireGithubConfig, requireUploadAuth } from '../lib/session.js';

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

  const title = (formData.get('title') || '').toString().trim();
  const category = (formData.get('category') || '').toString().trim();
  const date = (formData.get('date') || '').toString().trim();
  const proposedMdFileName = (formData.get('mdFileName') || '').toString().trim();
  const summary = (formData.get('summary') || '').toString();
  const customerRequest = (formData.get('customerRequest') || '').toString();
  const workDetails = (formData.get('workDetails') || '').toString();
  const result = (formData.get('result') || '').toString();
  const imageStamp = (formData.get('imageStamp') || '').toString().trim();

  if (!title) return errorResponse('VALIDATION_ERROR', '제목을 입력해 주세요.', 400);
  if (!validateCategory(category)) {
    return errorResponse('VALIDATION_ERROR', '허용되지 않은 카테고리입니다.', 400);
  }

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

  const mdBase = buildMdBaseName(category, title);
  if (proposedMdFileName && !isValidMdFileName(proposedMdFileName)) {
    return errorResponse('VALIDATION_ERROR', 'md 파일명 형식이 올바르지 않습니다.', 400);
  }

  try {
    const existingMd = await listExistingMdNames(env);
    const mdFileName = resolveMdFileName(mdBase, date, existingMd);

    const stamp = imageStamp || proposedNames[0]?.slice(0, 15) || '';
    const finalImageNames = await resolveFinalImageNames(env, proposedNames, stamp, images.length);

    const markdown = buildMarkdown({
      title,
      category,
      date,
      imageFileNames: finalImageNames,
      summary,
      customerRequest,
      workDetails,
      result,
    });

    const galleryCheck = validateGalleryMatches(finalImageNames, markdown);
    if (!galleryCheck.ok) {
      return errorResponse('VALIDATION_ERROR', galleryCheck.message, 400);
    }

    const parsed = parseFrontmatter(markdown);
    if (!parsed.ok || parsed.title !== title.trim() || parsed.category !== category) {
      return errorResponse('VALIDATION_ERROR', '생성된 Markdown 형식이 올바르지 않습니다.', 400);
    }

    const mdPath = `public/content/cases/${mdFileName}`;
    const files = [
      { path: mdPath, content: markdown },
    ];

    for (let i = 0; i < images.length; i++) {
      const bytes = new Uint8Array(await images[i].file.arrayBuffer());
      files.push({
        path: `public/images/${finalImageNames[i]}`,
        binary: bytes,
      });
    }

    const commitMessage = `제작사례 등록: ${category} ${title}`;
    const commitSha = await commitFiles(env, files, commitMessage);

    return successResponse({
      commitSha,
      mdPath,
      mdFileName,
      imagePaths: finalImageNames.map((n) => `public/images/${n}`),
      galleryPaths: finalImageNames.map((n) => galleryPath(n)),
      caseUrl: 'https://dreamev.kr/cases.html',
      githubCommitUrl: commitUrl(env, commitSha),
      message: '제작사례가 GitHub에 등록되었습니다.',
    });
  } catch {
    return errorResponse('GITHUB_ERROR', 'GitHub 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 502);
  }
}
