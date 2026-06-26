"""Test modal image slider on cases and repair pages."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "https://dreamev.kr"
is_local = "127.0.0.1" in base or "localhost" in base
cases_path = "/cases.html" if is_local else "/cases"
repair_path = "/repair-cases.html" if is_local else "/repair-cases"
cases_url = base.rstrip("/") + cases_path
repair_url = base.rstrip("/") + repair_path

results = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    def test_page(url, label, mobile=True):
        ctx = browser.new_context(**(p.devices["iPhone 12"] if mobile else {"viewport": {"width": 1280, "height": 800}}))
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#caseGallery .gallery-item", timeout=30000)

        cards = page.locator("#caseGallery .gallery-item:not(.hidden)")
        if cards.count() == 0:
            cards = page.locator("#caseGallery .gallery-item")

        # 복수 이미지 사례 우선 (두 번째 카드)
        idx = 1 if cards.count() > 1 else 0
        cards.nth(idx).click()
        page.wait_for_timeout(800)

        state = page.evaluate(
            """() => {
              const wrap = document.querySelector('.case-modal-image-wrap');
              const slider = document.querySelector('.case-modal-slider');
              const imgs = document.querySelectorAll('#modalImageContainer img');
              const counter = document.querySelector('.case-modal-slider-counter');
              const body = document.querySelector('.case-modal-body');
              const viewport = document.querySelector('.case-modal-slider-viewport');
              const prevBtn = document.querySelector('.case-modal-slider-prev');
              const nextBtn = document.querySelector('.case-modal-slider-next');
              const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
              const bodyRect = body ? body.getBoundingClientRect() : null;
              const imgRect = imgs[0] ? imgs[0].getBoundingClientRect() : null;
              const viewportRect = viewport ? viewport.getBoundingClientRect() : null;
              const prevStyle = prevBtn ? getComputedStyle(prevBtn) : null;
              const nextStyle = nextBtn ? getComputedStyle(nextBtn) : null;
              return {
                imgCount: imgs.length,
                multi: slider && slider.classList.contains('case-modal-slider--multi'),
                counterText: counter ? counter.textContent.trim() : '',
                bodyVisible: !!(body && body.offsetParent !== null),
                wrapOverflowY: wrap ? getComputedStyle(wrap).overflowY : '',
                wrapHeight: wrapRect ? Math.round(wrapRect.height) : 0,
                bodyTop: bodyRect ? Math.round(bodyRect.top) : 0,
                imgHeight: imgs[0] ? getComputedStyle(imgs[0]).height : '',
                imgFillsFrame: !!(imgRect && viewportRect && Math.abs(imgRect.height - viewportRect.height) < 2),
                imgObjectFit: imgs[0] ? getComputedStyle(imgs[0]).objectFit : '',
                prevDisplay: prevStyle ? prevStyle.display : '',
                prevOpacity: prevStyle ? prevStyle.opacity : '',
                nextDisplay: nextStyle ? nextStyle.display : '',
                nextOpacity: nextStyle ? nextStyle.opacity : '',
              };
            }"""
        )

        swipe_ok = True
        arrow_ok = True
        layout_ok = True
        if state["multi"]:
            counter_before = state["counterText"]
            wrap_h_before = state["wrapHeight"]
            body_top_before = state["bodyTop"]
            if mobile:
                page.evaluate("() => { const b = document.querySelector('.case-modal-slider-next'); if (b) b.click(); }")
            else:
                page.locator(".case-modal-slider-next").click()
            page.wait_for_timeout(300)
            after = page.evaluate(
                """() => {
                  const wrap = document.querySelector('.case-modal-image-wrap');
                  const body = document.querySelector('.case-modal-body');
                  const counter = document.querySelector('.case-modal-slider-counter');
                  const w = wrap ? wrap.getBoundingClientRect() : null;
                  const b = body ? body.getBoundingClientRect() : null;
                  return {
                    counterText: counter ? counter.textContent.trim() : '',
                    wrapHeight: w ? Math.round(w.height) : 0,
                    bodyTop: b ? Math.round(b.top) : 0,
                  };
                }"""
            )
            counter_after = after["counterText"]
            nav_ok = counter_before != counter_after
            layout_ok = (
                wrap_h_before == after["wrapHeight"]
                and abs(body_top_before - after["bodyTop"]) <= 1
            )
            if mobile:
                swipe_ok = nav_ok
                arrow_ok = (
                    state["prevDisplay"] != "none"
                    and state["nextDisplay"] != "none"
                    and float(state["prevOpacity"]) > 0
                    and float(state["nextOpacity"]) > 0
                )
            else:
                arrow_ok = nav_ok

        page.locator("#modalImageContainer img").first.click()
        page.wait_for_timeout(400)
        lightbox = page.evaluate("() => !!document.querySelector('.case-image-lightbox.active')")
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        page.keyboard.press("Escape")

        suffix = "mobile" if mobile else "pc"
        results.append((f"{label}_{suffix}_one_img", state["imgCount"] == 1, str(state["imgCount"])))
        results.append((f"{label}_{suffix}_body", state["bodyVisible"], ""))
        results.append((f"{label}_{suffix}_wrap_hidden", state["wrapOverflowY"] == "hidden", state["wrapOverflowY"]))
        results.append((f"{label}_{suffix}_contain", state["imgObjectFit"] == "contain", state["imgObjectFit"]))
        results.append((f"{label}_{suffix}_img_fill", state["imgFillsFrame"], state["imgHeight"]))
        if state["multi"]:
            results.append((f"{label}_{suffix}_counter", bool(state["counterText"]), state["counterText"]))
            if mobile:
                results.append((f"{label}_{suffix}_swipe", swipe_ok, ""))
                results.append((f"{label}_{suffix}_arrows_visible", arrow_ok, f"prev={state['prevDisplay']}/{state['prevOpacity']}"))
                results.append((f"{label}_{suffix}_layout_stable", layout_ok, f"wrap={state['wrapHeight']}"))
            else:
                results.append((f"{label}_{suffix}_arrow", arrow_ok, ""))
                results.append((f"{label}_{suffix}_layout_stable", layout_ok, ""))
        results.append((f"{label}_{suffix}_lightbox", lightbox, ""))
        ctx.close()

    test_page(cases_url, "cases", mobile=True)
    test_page(repair_url, "repair", mobile=True)
    test_page(cases_url, "cases", mobile=False)
    browser.close()

for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}\t{name}\t{detail}")

sys.exit(1 if any(not r[1] for r in results) else 0)
