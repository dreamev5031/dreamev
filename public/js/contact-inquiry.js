/**
 * Dream EV - 통합 문의 페이지 (contact.html)
 * URL type 파라미터 자동 선택, 유형별 안내 문구, 폼 검증
 */
(function() {
    'use strict';

    var ALLOWED_TYPES = ['repair', 'custom', 'consult', 'parts', 'other'];

    var TYPE_HINTS = {
        repair: '차량 모델, 사용 전압, 고장 증상과 사진을 함께 보내주시면 상담이 더 빠릅니다.',
        custom: '사용 목적, 희망 적재중량, 차량 크기와 필요한 기능을 작성해 주세요.',
        consult: '차량 상태나 필요한 작업을 설명해 주시면 가능 여부와 예상 진행 방법을 안내해 드립니다.',
        parts: '부품명, 차량 모델과 기존 부품의 명판 사진을 함께 보내주세요.',
        other: '문의하실 내용을 자유롭게 작성해 주세요.'
    };

    var PREP_MESSAGE = '상담 접수 기능을 준비 중입니다. 급한 문의는 대표전화로 연락해 주세요.';

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
        if (!phoneInput || !phoneInput.value.trim()) {
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

        var privacyGroup = getEl('globalInquiryPrivacy')?.closest('.form-group');
        var privacyInput = getEl('globalInquiryPrivacy');
        if (!privacyInput || !privacyInput.checked) {
            setFieldError(privacyGroup, true);
            valid = false;
        } else {
            setFieldError(privacyGroup, false);
        }

        return valid;
    }

    function initFileField() {
        var fileInput = getEl('globalInquiryPhotos');
        var fileNameEl = getEl('globalInquiryPhotosName');
        if (!fileInput || !fileNameEl) return;

        fileInput.addEventListener('change', function() {
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

    document.addEventListener('DOMContentLoaded', function() {
        var form = getEl('globalInquiryForm');
        var select = getEl('inquiryType');
        var hintEl = getEl('inquiryTypeHint');
        var statusEl = getEl('inquiryFormStatus');

        if (!form || !select) return;

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

            if (statusEl) {
                statusEl.hidden = true;
                statusEl.textContent = '';
                statusEl.classList.remove('is-success', 'is-error');
            }

            if (!validateForm(form)) {
                if (statusEl) {
                    statusEl.textContent = '필수 항목을 확인해 주세요.';
                    statusEl.classList.add('is-error');
                    statusEl.hidden = false;
                }
                return;
            }

            if (statusEl) {
                statusEl.textContent = PREP_MESSAGE;
                statusEl.classList.add('is-success');
                statusEl.hidden = false;
            }
        });
    });
})();
