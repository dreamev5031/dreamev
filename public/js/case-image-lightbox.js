/**
 * 제작/수리 사례 상세 모달 이미지 확대 보기 (공통)
 */
(function() {
    var lightboxEl = null;
    var imgEl = null;
    var prevBtn = null;
    var nextBtn = null;
    var counterEl = null;
    var imagePaths = [];
    var currentIndex = 0;
    var altText = '';
    var isOpen = false;
    var touchStartX = 0;
    var touchStartY = 0;
    var keydownBound = false;

    function ensureLightbox() {
        if (lightboxEl) return;

        lightboxEl = document.createElement('div');
        lightboxEl.className = 'case-image-lightbox';
        lightboxEl.setAttribute('aria-hidden', 'true');
        lightboxEl.innerHTML =
            '<div class="case-image-lightbox-backdrop" aria-label="닫기"></div>' +
            '<button type="button" class="case-image-lightbox-close" aria-label="닫기">&times;</button>' +
            '<button type="button" class="case-image-lightbox-nav case-image-lightbox-prev" aria-label="이전 이미지">&lsaquo;</button>' +
            '<button type="button" class="case-image-lightbox-nav case-image-lightbox-next" aria-label="다음 이미지">&rsaquo;</button>' +
            '<div class="case-image-lightbox-stage">' +
            '  <img class="case-image-lightbox-img" src="" alt="">' +
            '</div>' +
            '<p class="case-image-lightbox-counter" aria-live="polite"></p>';

        document.body.appendChild(lightboxEl);

        imgEl = lightboxEl.querySelector('.case-image-lightbox-img');
        prevBtn = lightboxEl.querySelector('.case-image-lightbox-prev');
        nextBtn = lightboxEl.querySelector('.case-image-lightbox-next');
        counterEl = lightboxEl.querySelector('.case-image-lightbox-counter');
        var backdrop = lightboxEl.querySelector('.case-image-lightbox-backdrop');
        var closeBtn = lightboxEl.querySelector('.case-image-lightbox-close');
        var stage = lightboxEl.querySelector('.case-image-lightbox-stage');

        backdrop.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
        prevBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (currentIndex > 0) showAt(currentIndex - 1);
        });
        nextBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (currentIndex < imagePaths.length - 1) showAt(currentIndex + 1);
        });
        stage.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        stage.addEventListener('touchstart', function(e) {
            if (!e.changedTouches || !e.changedTouches.length) return;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        stage.addEventListener('touchend', function(e) {
            if (!isOpen || imagePaths.length < 2) return;
            if (!e.changedTouches || !e.changedTouches.length) return;
            var dx = e.changedTouches[0].screenX - touchStartX;
            var dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx > 0 && currentIndex > 0) showAt(currentIndex - 1);
            else if (dx < 0 && currentIndex < imagePaths.length - 1) showAt(currentIndex + 1);
        }, { passive: true });

        if (!keydownBound) {
            keydownBound = true;
            document.addEventListener('keydown', function(e) {
                if (!isOpen) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
                    showAt(currentIndex - 1);
                } else if (e.key === 'ArrowRight' && currentIndex < imagePaths.length - 1) {
                    showAt(currentIndex + 1);
                }
            }, true);
        }
    }

    function updateNav() {
        var multi = imagePaths.length > 1;
        if (prevBtn) {
            prevBtn.style.display = multi ? '' : 'none';
            prevBtn.disabled = currentIndex <= 0;
        }
        if (nextBtn) {
            nextBtn.style.display = multi ? '' : 'none';
            nextBtn.disabled = currentIndex >= imagePaths.length - 1;
        }
        if (counterEl) {
            counterEl.style.display = multi ? '' : 'none';
            counterEl.textContent = multi ? (currentIndex + 1) + ' / ' + imagePaths.length : '';
        }
    }

    function showAt(index) {
        if (!imagePaths.length) return;
        currentIndex = Math.max(0, Math.min(index, imagePaths.length - 1));
        if (imgEl) {
            imgEl.src = imagePaths[currentIndex];
            imgEl.alt = altText;
        }
        updateNav();
    }

    function open(paths, index, alt) {
        if (!paths || !paths.length) return;
        ensureLightbox();
        imagePaths = paths.slice();
        altText = alt || '';
        showAt(typeof index === 'number' ? index : 0);
        isOpen = true;
        lightboxEl.classList.add('active');
        lightboxEl.setAttribute('aria-hidden', 'false');
    }

    function close() {
        if (!lightboxEl || !isOpen) return;
        isOpen = false;
        lightboxEl.classList.remove('active');
        lightboxEl.setAttribute('aria-hidden', 'true');
        if (imgEl) imgEl.removeAttribute('src');
    }

    function bindDetailImages(container, paths, alt) {
        if (!container || !paths || !paths.length) return;
        var imgs = container.querySelectorAll('img.detail-image, img.case-modal-image');
        imgs.forEach(function(img, idx) {
            img.style.cursor = 'pointer';
            img.setAttribute('role', 'button');
            img.setAttribute('tabindex', '0');
            img.setAttribute('aria-label', '이미지 확대 보기');
            img.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                open(paths, idx, alt || img.alt || '');
            };
            img.onkeydown = function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    open(paths, idx, alt || img.alt || '');
                }
            };
        });
    }

    window.CaseImageLightbox = {
        bindDetailImages: bindDetailImages,
        open: open,
        close: close,
        isOpen: function() { return isOpen; }
    };
})();
