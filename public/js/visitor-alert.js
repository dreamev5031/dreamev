(function() {
    'use strict';

    var VISITOR_ID_KEY = 'dreamev_visitor_id';
    var VISITOR_COOKIE = 'dreamev_vid';
    var SESSION_FLAG_KEY = 'dreamev_va_session';
    var TRACKED_PATHS = {
        '/': true,
        '/index.html': true,
        '/cases': true,
        '/cases.html': true,
        '/repair-cases': true,
        '/repair-cases.html': true,
        '/contact': true,
        '/contact.html': true
    };

    function normalizePath(pathname) {
        if (!pathname) return '/';
        if (pathname === '/index.html') return '/';
        if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
        return pathname;
    }

    function isTrackedPage() {
        var path = window.location.pathname || '/';
        return !!(TRACKED_PATHS[path] || TRACKED_PATHS[normalizePath(path)]);
    }

    function readCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function writeCookie(name, value) {
        var secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
    }

    function isValidUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    function getOrCreateVisitorId() {
        var id = '';
        try {
            id = localStorage.getItem(VISITOR_ID_KEY) || '';
        } catch (err) {
            id = '';
        }
        if (!isValidUuid(id)) {
            id = readCookie(VISITOR_COOKIE);
        }
        if (!isValidUuid(id)) {
            id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : '';
        }
        if (!isValidUuid(id)) {
            return '';
        }
        try {
            localStorage.setItem(VISITOR_ID_KEY, id);
        } catch (err) {
            /* ignore */
        }
        writeCookie(VISITOR_COOKIE, id);
        return id;
    }

    function hasSessionReported() {
        try {
            return sessionStorage.getItem(SESSION_FLAG_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function markSessionReported() {
        try {
            sessionStorage.setItem(SESSION_FLAG_KEY, '1');
        } catch (err) {
            /* ignore */
        }
    }

    function detectScreenType() {
        var width = Math.min(window.innerWidth || 0, window.screen && window.screen.width ? window.screen.width : 0);
        if (width > 0 && width < 768) return 'mobile';
        if (width >= 768 && width < 1024) return 'tablet';
        return 'desktop';
    }

    function sendVisitorAlert() {
        if (!isTrackedPage() || hasSessionReported()) return;

        var visitorId = getOrCreateVisitorId();
        if (!visitorId) return;

        markSessionReported();

        var payload = {
            visitorId: visitorId,
            path: window.location.pathname || '/',
            referrer: document.referrer || '',
            screenType: detectScreenType()
        };

        fetch('/api/visitor-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            keepalive: true,
            body: JSON.stringify(payload)
        }).catch(function() {
            /* 홈페이지 표시에는 영향 없음 */
        });
    }

    if (isTrackedPage()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', sendVisitorAlert);
        } else {
            sendVisitorAlert();
        }
    }
})();
