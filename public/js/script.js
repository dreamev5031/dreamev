/**
 * Dream EV - 제작사례 페이지 갤러리 필터
 * 카테고리 버튼 클릭 시 갤러리 표시 + 해당 카테고리만 노출 (모바일 데이터 절약)
 */
(function() {
    'use strict';

    var categoryNav = document.getElementById('categoryNav');
    var gallery = document.getElementById('gallery');
    var galleryWrap = document.getElementById('galleryWrap');

    if (!categoryNav || !gallery) return;

    var boxes = categoryNav.querySelectorAll('.cat-btn, .category-box');

    // Make filterGallery globally accessible
    window.filterGallery = function(activeFilter) {
        var allItems = gallery.querySelectorAll('.gallery-item');
        allItems.forEach(function(item) {
            var category = item.getAttribute('data-category');
            if (activeFilter === 'all' || category === activeFilter) {
                item.classList.remove('hidden');
                item.style.display = '';
            } else {
                item.classList.add('hidden');
                item.style.display = 'none';
            }
        });
    };

    window.currentFilter = 'all';

    function setActiveBox(clickedBox) {
        boxes.forEach(function(box) {
            box.classList.remove('active');
        });
        if (clickedBox) {
            clickedBox.classList.add('active');
        }
    }

    boxes.forEach(function(box) {
        box.addEventListener('click', function() {
            if (galleryWrap) galleryWrap.style.display = 'block';
            var filter = box.getAttribute('data-filter');
            setActiveBox(box);
            window.currentFilter = filter;
            window.filterGallery(filter);
        });
    });

    // 초기: 갤러리는 숨김 상태 유지 (버튼 클릭 시에만 표시)
})();
