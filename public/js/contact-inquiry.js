/**
 * Dream EV - 통합 문의 페이지 (contact.html)
 * URL type 파라미터 자동 선택, 유형별 안내 문구, 폼 검증, Telegram 상담 접수
 */
(function() {
    'use strict';

    var ALLOWED_TYPES = ['repair', 'custom', 'consult', 'parts', 'other'];
    var ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
    var MAX_PHOTOS = 5;
    var MAX_PHOTO_BYTES = 8 * 1024 * 1024;
    var MIN_SUBMIT_MS = 3000;
    var API_URL = '/api/consultation';
    var formReadyAt = 0;
    var isSubmitting = false;

    var TYPE_HINTS = {
        repair: '차량 모델, 사용 전압, 고장 증상과 사진을 함께 보내주시면 상담이 더 빠릅니다.',
        custom: '사용 목적, 희망 적재중량, 차량 크기와 필요한 기능을 작성해 주세요.',
        consult: '차량 상태나 필요한 작업을 설명해 주시면 가능 여부와 예상 진행 방법을 안내해 드립니다.',
        parts: '부품명, 차량 모델과 기존 부품의 명판 사진을 함께 보내주세요.',
        other: '문의하실 내용을 자유롭게 작성해 주세요.'
    };

    function getEl(id) {
        return document.getElementById(id);
    }

    function updateHint(select, hintEl) {
        if (!select || !hintEl) return;

        var value = select.value;
        if (TYPE_HINTS[value]) {
            hintEl.textContent = TYPE_HINTS[value];
            hintEl.hidden = false;
        } else {
            hintEl.textContent = '';
            hintEl.hidden = true;
        }
    }

    function setFieldError(group, hasError) {
        if (!group) return;
        group.classList.toggle('has-error', hasError);
    }

    function setStatus(statusEl, message, type) {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.remove('is-success', 'is-error');
        if (type) statusEl.classList.add(type);
        statusEl.hidden = !message;
    }

    function validatePhone(phone) {
        var clean = (phone || '').trim();
        if (!clean || clean.length < 8 || clean.length > 30) return false;
        return /^[\d\s\-+()]+$/.test(clean) && clean.replace(/\D/g, '').length >= 8;
    }

    function validateFiles(fileInput) {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return { ok: true };
        }
        if (fileInput.files.length > MAX_PHOTOS) {
            return { ok: false, message: '사진은 최대 5장까지 첨부할 수 있습니다.' };
        }
        for (var i = 0; i < fileInput.files.length; i += 1) {
            var file = fileInput.files[i];
            if (ALLOWED_MIME.indexOf(file.type) === -1) {
                return { ok: false, message: 'JPG, PNG, WEBP 사진만 첨부할 수 있습니다.' };
            }
            if (file.size > MAX_PHOTO_BYTES) {
                return { ok: false, message: '사진 한 장은 8MB 이하여야 합니다.' };
            }
        }
        return { ok: true };
    }

    function validateForm(form) {
        var valid = true;

        var typeGroup = form.querySelector('#inquiryType')?.closest('.form-group');
        var typeSelect = getEl('inquiryType');
        if (!typeSelect || !typeSelect.value) {
            setFieldError(typeGroup, true);
            valid = false;
        } else {
            setFieldError(typeGroup, false);
        }

        var nameGroup = getEl('globalInquiryNameContact')?.closest('.form-group');
        var nameInput = getEl('globalInquiryNameContact');
        if (!nameInput || !nameInput.value.trim()) {
            setFieldError(nameGroup, true);
            valid = false;
        } else {
            setFieldError(nameGroup, false);
        }

        var phoneGroup = getEl('globalInquiryPhoneContact')?.closest('.form-group');
        var phoneInput = getEl('globalInquiryPhoneContact');
        if (!phoneInput || !validatePhone(phoneInput.value)) {
            setFieldError(phoneGroup, true);
            valid = false;
        } else {
            setFieldError(phoneGroup, false);
        }

        var messageGroup = getEl('globalInquiryMessageContact')?.closest('.form-group');
        var messageInput = getEl('globalInquiryMessageContact');
        if (!messageInput || !messageInput.value.trim()) {
            setFieldError(messageGroup, true);
            valid = false;
        } else {
            setFieldError(messageGroup, false);
        }

        var privacyGroup = getEl('privacyConsent')?.closest('.privacy-consent');
        var privacyInput = getEl('privacyConsent');
        if (!privacyInput || !privacyInput.checked) {
            setFieldError(privacyGroup, true);
            valid = false;
        } else {
            setFieldError(privacyGroup, false);
        }

        var fileInput = getEl('globalInquiryPhotos');
        var fileCheck = validateFiles(fileInput);
        if (!fileCheck.ok) {
            valid = false;
            return { valid: false, message: fileCheck.message };
        }

        return { valid: valid, message: valid ? '' : '필수 항목을 확인해 주세요.' };
    }

    function resetFileField() {
        var fileInput = getEl('globalInquiryPhotos');
        var fileNameEl = getEl('globalInquiryPhotosName');
        if (fileInput) fileInput.value = '';
        if (fileNameEl) fileNameEl.textContent = '선택된 파일 없음';
    }

    function initFileField() {
        var fileInput = getEl('globalInquiryPhotos');
        var fileNameEl = getEl('globalInquiryPhotosName');
        if (!fileInput || !fileNameEl) return;

        fileInput.addEventListener('change', function() {
            var check = validateFiles(fileInput);
            if (!check.ok) {
                setStatus(getEl('inquiryFormStatus'), check.message, 'is-error');
                fileInput.value = '';
                fileNameEl.textContent = '선택된 파일 없음';
                return;
            }
            if (!fileInput.files || fileInput.files.length === 0) {
                fileNameEl.textContent = '선택된 파일 없음';
                return;
            }
            if (fileInput.files.length === 1) {
                fileNameEl.textContent = fileInput.files[0].name;
                return;
            }
            fileNameEl.textContent = fileInput.files.length + '개 파일 선택됨';
        });
    }

    function setSubmitting(form, submitting) {
        isSubmitting = submitting;
        var submitBtn = form.querySelector('.contact-submit');
        if (submitBtn) {
            submitBtn.disabled = submitting;
            submitBtn.setAttribute('aria-busy', submitting ? 'true' : 'false');
        }
    }

    function submitConsultation(form, statusEl) {
        if (isSubmitting) return;

        var validation = validateForm(form);
        if (!validation.valid) {
            setStatus(statusEl, validation.message || '필수 항목을 확인해 주세요.', 'is-error');
            return;
        }

        if (Date.now() - formReadyAt < MIN_SUBMIT_MS) {
            setStatus(statusEl, '잠시 후 다시 시도해 주세요.', 'is-error');
            return;
        }

        var formData = new FormData(form);
        formData.set('pathname', window.location.pathname || '/contact.html');
        formData.set('formLoadedAt', String(formReadyAt));

        setSubmitting(form, true);
        setStatus(statusEl, '상담 신청을 보내는 중입니다…', null);

        fetch(API_URL, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        })
            .then(function(response) {
                return response.json().catch(function() {
                    return { success: false, message: '상담 신청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
                }).then(function(data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function(result) {
                if (result.ok && result.data && result.data.success) {
                    form.reset();
                    resetFileField();
                    updateHint(getEl('inquiryType'), getEl('inquiryTypeHint'));
                    setStatus(
                        statusEl,
                        '상담 신청이 접수되었습니다. 확인 후 연락드리겠습니다.',
                        'is-success'
                    );
                    return;
                }

                var message = (result.data && result.data.message)
                    || '상담 신청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.';
                setStatus(statusEl, message, 'is-error');
            })
            .catch(function() {
                setStatus(
                    statusEl,
                    '상담 신청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                    'is-error'
                );
            })
            .finally(function() {
                setSubmitting(form, false);
            });
    }

    document.addEventListener('DOMContentLoaded', function() {
        var form = getEl('globalInquiryForm');
        var select = getEl('inquiryType');
        var hintEl = getEl('inquiryTypeHint');
        var statusEl = getEl('inquiryFormStatus');

        if (!form || !select) return;

        formReadyAt = Date.now();

        var params = new URLSearchParams(window.location.search);
        var inquiryType = params.get('type');

        if (ALLOWED_TYPES.indexOf(inquiryType) !== -1) {
            select.value = inquiryType;
        }

        updateHint(select, hintEl);

        select.addEventListener('change', function() {
            updateHint(select, hintEl);
            setFieldError(select.closest('.form-group'), false);
        });

        initFileField();

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            setStatus(statusEl, '', null);
            submitConsultation(form, statusEl);
        });
    });
})();
