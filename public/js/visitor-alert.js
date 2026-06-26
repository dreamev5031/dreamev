(function() {
    'use strict';

    var STORAGE_KEY = 'dreamev_visitor_alert_ts';
    var COOLDOWN_MS = 30 * 60 * 1000;
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

    function getCooldownMs() {
        var meta = document.querySelector('meta[name="visitor-alert-cooldown-minutes"]');
        if (!meta) return COOLDOWN_MS;
        var minutes = parseInt(meta.getAttribute('content') || '30', 10);
        if (isNaN(minutes) || minutes < 1) return COOLDOWN_MS;
        return minutes * 60 * 1000;
    }

    function isClientCooldownActive() {
        try {
            var last = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
            return !isNaN(last) && (Date.now() - last) < getCooldownMs();
        } catch (err) {
            return false;
        }
    }

    function markClientCooldown() {
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
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
        if (!isTrackedPage() || isClientCooldownActive()) return;

        var payload = {
            path: window.location.pathname || '/',
            referrer: document.referrer || '',
            screenType: detectScreenType(),
            clientCooldownActive: false
        };

        fetch('/api/visitor-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            keepalive: true,
            body: JSON.stringify(payload)
        })
            .then(function(response) {
                return response.json().catch(function() { return {}; });
            })
            .then(function(data) {
                if (!data) return;
                if (data.sent || data.reason === 'server_cooldown' || data.reason === 'client_cooldown') {
                    markClientCooldown();
                }
            })
            .catch(function() {
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
