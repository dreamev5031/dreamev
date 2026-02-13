/**
 * Dream EV - 제작사례 페이지 갤러리 필터
 * 2x2 카테고리 박스 클릭 시 해당 data-category만 노출, 나머지는 display: none
 */
(function() {
    'use strict';

    var categoryNav = document.getElementById('categoryNav');
    var gallery = document.getElementById('gallery');
    var filterAllBtn = document.getElementById('filterAll');

    if (!categoryNav || !gallery) return;

    var boxes = categoryNav.querySelectorAll('.category-box');
    var items = gallery.querySelectorAll('.gallery-item');

    function filterGallery(activeFilter) {
        items.forEach(function(item) {
            var category = item.getAttribute('data-category');
            if (activeFilter === 'all' || category === activeFilter) {
                item.classList.remove('hidden');
                item.style.display = '';
            } else {
                item.classList.add('hidden');
                item.style.display = 'none';
            }
        });
    }

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
            var filter = box.getAttribute('data-filter');
            setActiveBox(box);
            filterGallery(filter);
        });
    });

    if (filterAllBtn) {
        filterAllBtn.addEventListener('click', function() {
            setActiveBox(null);
            filterGallery('all');
        });
    }

    // 초기: 전체 노출
    filterGallery('all');
})();
