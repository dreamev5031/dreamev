/**
 * 제작/수리 사례 상세 모달 이미지 슬라이더 (공통)
 */
(function() {
    'use strict';

    var SWIPE_THRESHOLD = 50;

    function clampIndex(index, len) {
        if (len <= 0) return 0;
        return Math.max(0, Math.min(index, len - 1));
    }

    function render(container, paths, altText) {
        if (!container) return { getIndex: function() { return 0; } };
        container.innerHTML = '';
        if (!paths || !paths.length) return { getIndex: function() { return 0; } };

        var currentIndex = 0;
        var multi = paths.length > 1;
        var title = altText || '';

        var slider = document.createElement('div');
        slider.className = 'case-modal-slider' + (multi ? ' case-modal-slider--multi' : '');
        slider.setAttribute('role', multi ? 'region' : 'presentation');
        if (multi) slider.setAttribute('aria-label', '사례 사진 갤러리');

        if (multi) {
            var prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'case-modal-slider-nav case-modal-slider-prev';
            prevBtn.setAttribute('aria-label', '이전 사진');
            prevBtn.innerHTML = '&lsaquo;';
            slider.appendChild(prevBtn);
        }

        var viewport = document.createElement('div');
        viewport.className = 'case-modal-slider-viewport';
        viewport.setAttribute('tabindex', multi ? '0' : '-1');

        var img = document.createElement('img');
        img.className = 'case-modal-slider-img case-modal-image detail-image';
        img.src = paths[0];
        img.alt = title;
        img.loading = 'lazy';
        img.draggable = false;
        img.setAttribute('role', 'button');
        img.setAttribute('tabindex', '0');
        img.setAttribute('aria-label', '이미지 확대 보기');
        viewport.appendChild(img);
        slider.appendChild(viewport);

        var nextBtn = null;
        var counter = null;
        if (multi) {
            nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'case-modal-slider-nav case-modal-slider-next';
            nextBtn.setAttribute('aria-label', '다음 사진');
            nextBtn.innerHTML = '&rsaquo;';
            slider.appendChild(nextBtn);

            counter = document.createElement('p');
            counter.className = 'case-modal-slider-counter';
            counter.setAttribute('aria-live', 'polite');
            slider.appendChild(counter);
        }

        container.appendChild(slider);

        var touchStartX = 0;
        var touchStartY = 0;

        function update() {
            currentIndex = clampIndex(currentIndex, paths.length);
            img.src = paths[currentIndex];
            img.alt = title;
            if (multi) {
                if (counter) counter.textContent = (currentIndex + 1) + ' / ' + paths.length;
                if (prevBtn) {
                    prevBtn.disabled = currentIndex <= 0;
                    prevBtn.setAttribute('aria-disabled', currentIndex <= 0 ? 'true' : 'false');
                }
                if (nextBtn) {
                    nextBtn.disabled = currentIndex >= paths.length - 1;
                    nextBtn.setAttribute('aria-disabled', currentIndex >= paths.length - 1 ? 'true' : 'false');
                }
            }
        }

        function go(delta) {
            if (!multi) return;
            var next = clampIndex(currentIndex + delta, paths.length);
            if (next === currentIndex) return;
            currentIndex = next;
            update();
        }

        function openLightbox(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (window.CaseImageLightbox) {
                window.CaseImageLightbox.open(paths, currentIndex, title);
            }
        }

        img.addEventListener('click', openLightbox);
        img.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                openLightbox(e);
            }
        });

        if (prevBtn) {
            prevBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                go(-1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                go(1);
            });
        }

        function onKeydown(e) {
            if (!multi) return;
            if (window.CaseImageLightbox && window.CaseImageLightbox.isOpen()) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                go(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                go(1);
            }
        }

        viewport.addEventListener('keydown', onKeydown);
        slider.addEventListener('keydown', onKeydown);

        viewport.addEventListener('touchstart', function(e) {
            if (!multi || !e.changedTouches || !e.changedTouches.length) return;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        viewport.addEventListener('touchend', function(e) {
            if (!multi || !e.changedTouches || !e.changedTouches.length) return;
            var dx = e.changedTouches[0].screenX - touchStartX;
            var dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
            if (dx > 0) go(-1);
            else go(1);
        }, { passive: true });

        update();

        return {
            getIndex: function() { return currentIndex; },
            goTo: function(index) {
                currentIndex = clampIndex(index, paths.length);
                update();
            }
        };
    }

    window.CaseModalSlider = {
        render: render
    };
})();
