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

    // Make filterGallery globally accessible
    window.filterGallery = function(activeFilter) {
        // Refresh items list to include dynamically added CMS items
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

    // Store current filter for later use
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
            var filter = box.getAttribute('data-filter');
            setActiveBox(box);
            window.currentFilter = filter;
            window.filterGallery(filter);
        });
    });

    if (filterAllBtn) {
        filterAllBtn.addEventListener('click', function() {
            setActiveBox(null);
            window.currentFilter = 'all';
            window.filterGallery('all');
        });
    }

    // 초기: 전체 노출 (PC)
    window.filterGallery('all');

    // 모바일 전용: 대문 버튼 클릭 시 갤러리 표시 + 해당 카테고리만 필터
    var mobileCaseMenu = document.getElementById('mobileCaseMenu');
    var mobileCaseBack = document.getElementById('mobileCaseBack');
    var casesHero = gallery ? gallery.closest('.cases-hero') : null;

    if (mobileCaseMenu && gallery && casesHero) {
        mobileCaseMenu.querySelectorAll('.m-case-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var filter = btn.getAttribute('data-category');
                casesHero.classList.add('mobile-gallery-visible');
                window.currentFilter = filter;
                window.filterGallery(filter);
            });
        });
    }

    if (mobileCaseBack && casesHero) {
        mobileCaseBack.addEventListener('click', function() {
            casesHero.classList.remove('mobile-gallery-visible');
            window.currentFilter = 'all';
            window.filterGallery('all');
        });
    }
})();
