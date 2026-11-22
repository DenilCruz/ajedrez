import json
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


BOARD_SELECTOR = '#chessboard-board, [id$="-board"]'
FAIL_FAST_TIMEOUT_MS = 4000


def discover_browser_launch_args() -> tuple[dict[str, Any], str]:
    env_path = os.environ.get("CHESS_E2E_BROWSER_PATH", "").strip()
    if env_path and Path(env_path).is_file():
        return {"executable_path": env_path, "headless": True}, f"env:{env_path}"

    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        ms_pw = Path(local_app_data) / "ms-playwright"
        candidates = [
            (
                ms_pw
                / "chromium_headless_shell-1254"
                / "chrome-headless-shell-win64"
                / "chrome-headless-shell.exe",
                "chromium_headless_shell-1254",
            ),
            (
                ms_pw / "chromium-1254" / "chrome-win64" / "chrome.exe",
                "chromium-1254",
            ),
            (
                ms_pw / "chromium-1200" / "chrome-win64" / "chrome.exe",
                "chromium-1200",
            ),
        ]
        for exe_path, label in candidates:
            if exe_path.is_file():
                return {"executable_path": str(exe_path), "headless": True}, label

    return {"channel": "msedge", "headless": True}, "channel:msedge"


def launch_browser(pw: Any) -> tuple[Browser, str]:
    launch_args, source = discover_browser_launch_args()
    attempts: list[tuple[dict[str, Any], str]] = [(launch_args, source)]
    if source != "channel:msedge":
        attempts.append(({"channel": "msedge", "headless": True}, "channel:msedge"))
    attempts.append(({"channel": "chrome", "headless": True}, "channel:chrome"))

    errors: list[str] = []
    for kwargs, label in attempts:
        try:
            browser = pw.chromium.launch(**kwargs)
            return browser, label
        except Exception as exc:
            errors.append(f"{label}: {exc}")

    raise RuntimeError("Unable to launch any offline Chromium browser: " + " | ".join(errors))


class DriverSession:
    def __init__(self, browser: Browser, browser_source: str) -> None:
        self.browser = browser
        self.browser_source = browser_source
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.page_errors: list[str] = []
        self.console_errors: list[str] = []
        self.last_url: Optional[str] = None
        self.clock_installed = False

    def _require_page(self) -> Page:
        if self.page is None:
            raise RuntimeError("No active browser context/page. Call new_context first.")
        return self.page

    def _assert_no_runtime_errors(self) -> None:
        if self.page_errors:
            raise RuntimeError(
                "Captured pageerror(s) during page execution: " + " | ".join(self.page_errors)
            )

    def _wait_board_fail_fast(self, timeout_ms: int = FAIL_FAST_TIMEOUT_MS) -> None:
        page = self._require_page()
        try:
            page.wait_for_load_state("load", timeout=timeout_ms)
        except Exception:
            pass
        try:
            page.wait_for_load_state("networkidle", timeout=1500)
        except Exception:
            pass

        self._assert_no_runtime_errors()

        try:
            page.locator(BOARD_SELECTOR).first.wait_for(state="visible", timeout=timeout_ms)
            page.locator('[data-square="e2"]').first.wait_for(state="visible", timeout=timeout_ms)
        except Exception as exc:
            self._assert_no_runtime_errors()
            body_preview = ""
            try:
                body_preview = page.evaluate("() => document.body ? document.body.innerText.slice(0, 300) : ''")
            except Exception:
                pass
            raise RuntimeError(
                f"Board did not render within {timeout_ms}ms ({BOARD_SELECTOR}). "
                f"Console errors: {self.console_errors}. Body preview: {body_preview!r}. Original: {exc}"
            )

        self._assert_no_runtime_errors()

    def close_context(self) -> dict[str, Any]:
        if self.context is not None:
            try:
                self.context.close()
            finally:
                self.context = None
                self.page = None
                self.clock_installed = False
                self.page_errors = []
                self.console_errors = []
        return {"ok": True}

    def cmd_ping(self, _params: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "browser": self.browser_source}

    def cmd_new_context(self, params: dict[str, Any]) -> dict[str, Any]:
        self.close_context()
        viewport = params.get("viewport") or {"width": 1280, "height": 800}
        self.context = self.browser.new_context(viewport=viewport)
        self.page = self.context.new_page()
        self.page_errors = []
        self.console_errors = []
        self.clock_installed = False

        def on_page_error(err: Any) -> None:
            self.page_errors.append(str(err))

        def on_console(msg: Any) -> None:
            if msg.type == "error":
                self.console_errors.append(msg.text)

        self.page.on("pageerror", on_page_error)
        self.page.on("console", on_console)

        init_script = params.get("init_script")
        if init_script:
            self.page.add_init_script(init_script)

        seed_storage = params.get("seed_local_storage")
        if isinstance(seed_storage, dict) and seed_storage:
            payload = json.dumps(seed_storage)
            self.page.add_init_script(
                f"""(() => {{
                    const entries = {payload};
                    for (const [k, v] of Object.entries(entries)) {{
                        try {{ window.localStorage.setItem(k, String(v)); }} catch {{}}
                    }}
                }})();"""
            )

        if params.get("install_clock"):
            self.page.clock.install()
            self.clock_installed = True

        url = params.get("url")
        if url:
            self.last_url = url
            resp = self.page.goto(url, wait_until="domcontentloaded", timeout=FAIL_FAST_TIMEOUT_MS)
            status = resp.status if resp else None
            if params.get("wait_for_board", True):
                self._wait_board_fail_fast(params.get("timeout_ms", FAIL_FAST_TIMEOUT_MS))
            return {
                "ok": True,
                "status": status,
                "title": self.page.title(),
                "pageErrors": list(self.page_errors),
                "consoleErrors": list(self.console_errors),
            }

        return {"ok": True}

    def cmd_reload(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        self.page_errors = []
        self.console_errors = []
        page.reload(wait_until="domcontentloaded", timeout=FAIL_FAST_TIMEOUT_MS)
        if params.get("wait_for_board", True):
            self._wait_board_fail_fast(params.get("timeout_ms", FAIL_FAST_TIMEOUT_MS))
        return {
            "ok": True,
            "title": page.title(),
            "pageErrors": list(self.page_errors),
            "consoleErrors": list(self.console_errors),
        }

    def cmd_evaluate(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        result = page.evaluate(params["expression"])
        return {"result": result}

    def cmd_get_errors(self, _params: dict[str, Any]) -> dict[str, Any]:
        return {
            "pageErrors": list(self.page_errors),
            "consoleErrors": list(self.console_errors),
        }

    def cmd_click_square(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        square = params["square"]
        loc = page.locator(f'[data-square="{square}"]').first
        loc.click(timeout=4000)
        return {"ok": True}

    def cmd_drag_square(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        from_sq = params["from"]
        to_sq = params["to"]
        piece_loc = page.locator(f'[data-square="{from_sq}"] [data-piece]').first
        if piece_loc.count() > 0:
            src_box = piece_loc.bounding_box(timeout=4000)
        else:
            src_box = page.locator(f'[data-square="{from_sq}"]').first.bounding_box(timeout=4000)
        dst_box = page.locator(f'[data-square="{to_sq}"]').first.bounding_box(timeout=4000)
        if not src_box or not dst_box:
            raise RuntimeError(f"Missing bounding box for drag {from_sq} -> {to_sq}")

        sx = src_box["x"] + src_box["width"] / 2.0
        sy = src_box["y"] + src_box["height"] / 2.0
        tx = dst_box["x"] + dst_box["width"] / 2.0
        ty = dst_box["y"] + dst_box["height"] / 2.0

        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(tx, ty, steps=10)
        page.mouse.up()
        return {"ok": True}

    def cmd_play_moves(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        moves = params["moves"]
        method = params.get("method", "click")
        promo_map = {"q": "Dama", "r": "Torre", "b": "Alfil", "n": "Caballo"}

        for mv in moves:
            from_sq = mv["from"]
            to_sq = mv["to"]
            if method == "drag":
                self.cmd_drag_square({"from": from_sq, "to": to_sq})
            else:
                page.locator(f'[data-square="{from_sq}"]').first.click(timeout=4000)
                page.locator(f'[data-square="{to_sq}"]').first.click(timeout=4000)

            promotion = mv.get("promotion")
            if promotion:
                label = promo_map.get(promotion, promotion)
                dialog = page.get_by_role("dialog")
                dialog.wait_for(state="visible", timeout=3000)
                dialog.get_by_role("button", name=label).click(timeout=3000)

            if self.clock_installed:
                page.clock.fast_forward(250)

        return {"ok": True, "played": len(moves)}

    def cmd_get_piece(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        square = params["square"]
        loc = page.locator(f'[data-square="{square}"] [data-piece]')
        if loc.count() == 0:
            return {"piece": None}
        return {"piece": loc.first.get_attribute("data-piece")}

    def cmd_wait_for_piece(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        square = params["square"]
        expected = params.get("piece")
        timeout_ms = params.get("timeout_ms", 4000)
        if expected is None:
            page.locator(f'[data-square="{square}"] [data-piece]').wait_for(
                state="detached", timeout=timeout_ms
            )
            return {"piece": None}
        loc = page.locator(f'[data-square="{square}"] [data-piece="{expected}"]')
        loc.first.wait_for(state="visible", timeout=timeout_ms)
        return {"piece": expected}

    def cmd_get_board_snapshot(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        data = page.evaluate(
            """() => {
                const squares = document.querySelectorAll('[data-square]');
                const pieces = {};
                let pieceCount = 0;
                for (const sq of squares) {
                    const name = sq.getAttribute('data-square');
                    const pieceEl = sq.querySelector('[data-piece]');
                    if (pieceEl && name) {
                        pieces[name] = pieceEl.getAttribute('data-piece');
                        pieceCount += 1;
                    }
                }
                return { squareCount: squares.length, pieceCount, pieces };
            }"""
        )
        return data

    def cmd_get_board_geometry(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        result: dict[str, Any] = {}
        for sq in ("a1", "a8", "h1", "h8"):
            box = page.locator(f'[data-square="{sq}"]').first.bounding_box(timeout=4000)
            result[sq] = box
        board_box = page.locator(BOARD_SELECTOR).first.bounding_box(timeout=4000)
        result["board"] = board_box
        return result

    def cmd_get_square_colors(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        squares = params.get("squares") or ["a1", "a2"]
        colors = page.evaluate(
            """(sqs) => {
                const out = {};
                for (const sq of sqs) {
                    const el = document.querySelector(`[data-square="${sq}"]`);
                    if (el) {
                        out[sq] = getComputedStyle(el).backgroundColor;
                    } else {
                        out[sq] = null;
                    }
                }
                return out;
            }""",
            squares,
        )
        return {"colors": colors}

    def cmd_get_square_highlight_style(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        square = params["square"]
        style = page.evaluate(
            """(sq) => {
                const el = document.querySelector(`[data-square="${sq}"]`);
                if (!el) return null;
                const inner = el.querySelector(':scope > div:last-child') || el.firstElementChild;
                const outerCS = getComputedStyle(el);
                const innerCS = inner ? getComputedStyle(inner) : null;
                return {
                    outerBackgroundColor: outerCS.backgroundColor,
                    innerBackgroundColor: innerCS ? innerCS.backgroundColor : null,
                    innerBackgroundImage: innerCS ? innerCS.backgroundImage : null,
                    innerBoxShadow: innerCS ? innerCS.boxShadow : null,
                    innerInlineStyle: inner ? (inner.getAttribute('style') || '') : '',
                };
            }""",
            square,
        )
        return {"style": style}

    def cmd_click_button(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        pattern = params["name"]
        regex = re.compile(pattern, re.I)
        root = page.get_by_role("dialog") if params.get("in_dialog") else page
        loc = root.get_by_role("button", name=regex)
        if params.get("first", True):
            loc = loc.first
        loc.click(timeout=4000)
        return {"ok": True}

    def cmd_select_theme(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        label = params["label"]
        section = page.locator('[aria-label="Tema del tablero"]')
        if section.count() > 0:
            section.get_by_role("button", name=re.compile(f"^{re.escape(label)}$", re.I)).first.click(
                timeout=4000
            )
        else:
            page.get_by_role("button", name=re.compile(f"^{re.escape(label)}$", re.I)).first.click(
                timeout=4000
            )
        return {"ok": True}

    def cmd_get_theme_state(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        return page.evaluate(
            """() => {
                const section = document.querySelector('[aria-label="Tema del tablero"]');
                const buttons = section ? Array.from(section.querySelectorAll('button')) : [];
                const activeButtons = buttons
                    .filter(b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true')
                    .map(b => (b.textContent || '').trim());
                let stored = null;
                try { stored = window.localStorage.getItem('chess-platform:board-theme'); } catch {}
                return {
                    buttonCount: buttons.length,
                    buttonLabels: buttons.map(b => (b.textContent || '').trim()),
                    activeButtons,
                    storedTheme: stored,
                };
            }"""
        )

    def cmd_open_setup_modal(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        page.get_by_role("button", name=re.compile(r"nueva partida", re.I)).first.click(timeout=4000)
        dialog = page.get_by_role("dialog")
        dialog.wait_for(state="visible", timeout=4000)
        return {"ok": True}

    def cmd_configure_setup_modal(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        dialog = page.get_by_role("dialog")
        dialog.wait_for(state="visible", timeout=4000)

        if "mode" in params and params["mode"]:
            mode_val = params["mode"]
            if mode_val in ("vs IA", "vs-ai"):
                dialog.get_by_role("button", name=re.compile(r"vs\s*IA", re.I)).first.click(timeout=4000)
            else:
                dialog.get_by_role("button", name=re.compile(r"2\s*Jugadores", re.I)).first.click(timeout=4000)

        if "difficulty" in params and params["difficulty"]:
            diff = params["difficulty"]
            dialog.get_by_role("button", name=re.compile(rf"^{re.escape(diff)}$", re.I)).first.click(timeout=4000)

        if "color" in params and params["color"]:
            col = params["color"]
            dialog.get_by_role("button", name=re.compile(rf"^{re.escape(col)}$", re.I)).first.click(timeout=4000)

        if "time_preset" in params and params["time_preset"]:
            preset = params["time_preset"]
            dialog.get_by_role("button", name=re.compile(re.escape(preset), re.I)).first.click(timeout=4000)

        action = params.get("action", "start")
        if action == "start":
            dialog.get_by_role("button", name=re.compile(r"iniciar partida", re.I)).first.click(timeout=4000)
            dialog.wait_for(state="detached", timeout=4000)
        elif action == "cancel":
            dialog.get_by_role("button", name=re.compile(r"cancelar", re.I)).first.click(timeout=4000)
            dialog.wait_for(state="detached", timeout=4000)
        elif action == "close":
            dialog.get_by_role("button", name=re.compile(r"cerrar|cancelar", re.I)).first.click(timeout=4000)
            dialog.wait_for(state="detached", timeout=4000)
        elif action == "escape":
            page.keyboard.press("Escape")
            dialog.wait_for(state="detached", timeout=4000)
        elif action == "backdrop":
            page.mouse.click(5, 5)
            dialog.wait_for(state="detached", timeout=4000)

        return {"ok": True}

    def cmd_get_dialog_state(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        dialog = page.get_by_role("dialog")
        is_open = dialog.count() > 0 and dialog.first.is_visible()
        if not is_open:
            return {"isOpen": False, "text": "", "buttons": []}
        buttons = dialog.first.locator("button").all_inner_texts()
        return {
            "isOpen": True,
            "text": dialog.first.inner_text(),
            "buttons": [b.strip() for b in buttons],
        }

    def cmd_select_promotion(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        dialog = page.get_by_role("dialog")
        dialog.wait_for(state="visible", timeout=4000)
        dialog.get_by_role("button", name=re.compile(rf"^{re.escape(params['label'])}$", re.I)).first.click(
            timeout=4000
        )
        dialog.wait_for(state="detached", timeout=4000)
        return {"ok": True}

    def cmd_cancel_promotion(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        dialog = page.get_by_role("dialog")
        dialog.wait_for(state="visible", timeout=4000)
        dialog.get_by_role("button", name=re.compile(r"cancelar", re.I)).first.click(timeout=4000)
        dialog.wait_for(state="detached", timeout=4000)
        return {"ok": True}

    def cmd_get_move_history_text(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        return page.evaluate(
            """() => {
                const sec = document.querySelector('[aria-label="Historial de jugadas"]');
                if (!sec) return { found: false, text: '', items: [], scrollHeight: 0, clientHeight: 0 };
                const items = Array.from(sec.querySelectorAll('ol > li')).map(li => (li.innerText || '').replace(/\\s+/g, ' ').trim());
                const scrollEl = sec.querySelector('[data-testid="move-history-scroll"]');
                return {
                    found: true,
                    text: (sec.innerText || '').trim(),
                    items,
                    scrollHeight: scrollEl ? scrollEl.scrollHeight : 0,
                    clientHeight: scrollEl ? scrollEl.clientHeight : 0,
                };
            }"""
        )

    def cmd_get_clocks(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        return page.evaluate(
            """() => {
                const sec = document.querySelector('[aria-label="Reloj de partida"]');
                if (!sec) return { found: false };
                const whiteEl = sec.querySelector('[aria-label="Reloj de Blancas"]') || sec.querySelector('[data-clock-color="w"]');
                const blackEl = sec.querySelector('[aria-label="Reloj de Negras"]') || sec.querySelector('[data-clock-color="b"]');
                const readSide = (el) => {
                    if (!el) return null;
                    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                    const timeEl = el.querySelector('time');
                    const timeText = timeEl ? (timeEl.innerText || '').trim() : (text.includes('Sin reloj') ? 'Sin reloj' : text);
                    const active = el.getAttribute('data-active-turn') === 'true' || el.getAttribute('data-active') === 'true';
                    const lowTime = /00:0\\d\\.\\d/.test(timeText) || el.getAttribute('data-low-time') === 'true' || el.className.includes('rose') || el.className.includes('amber');
                    return { text, timeText, active, lowTime };
                };
                return {
                    found: true,
                    white: readSide(whiteEl),
                    black: readSide(blackEl),
                    fullText: (sec.innerText || '').replace(/\\s+/g, ' ').trim(),
                };
            }"""
        )

    def cmd_get_status_banner(self, _params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        return page.evaluate(
            """() => {
                const bodyText = document.body ? document.body.innerText : '';
                const statusEls = Array.from(document.querySelectorAll('[role="status"], [role="alert"]'));
                const statusTexts = statusEls.map(el => (el.innerText || '').replace(/\\s+/g, ' ').trim());
                const isAiThinking = statusTexts.some(t => /pensando/i.test(t));
                const gameOverEl = statusEls.find(el => !/pensando/i.test(el.innerText || ''));
                const flipBtn = Array.from(document.querySelectorAll('button')).find(b => /rotar tablero|girar tablero/i.test((b.innerText || b.getAttribute('aria-label') || '')));
                const resignBtn = Array.from(document.querySelectorAll('button')).find(b => /rendirse/i.test(b.innerText || ''));
                return {
                    statusTexts,
                    isAiThinking,
                    gameOverText: gameOverEl ? (gameOverEl.innerText || '').replace(/\\s+/g, ' ').trim() : null,
                    hasFlipButton: Boolean(flipBtn),
                    resignDisabled: resignBtn ? resignBtn.disabled : null,
                    bodyHasCheck: /\\bJaque\\b/.test(bodyText),
                };
            }"""
        )

    def cmd_check_responsive_no_overflow(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        width = int(params["width"])
        height = int(params["height"])
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(100)
        return page.evaluate(
            """() => {
                const doc = document.documentElement;
                const board = document.querySelector('#chessboard-board, [id$="-board"]');
                const clocks = document.querySelector('[aria-label="Reloj de partida"]');
                const history = document.querySelector('[aria-label="Historial de jugadas"]');
                const themes = document.querySelector('[aria-label="Tema del tablero"]');
                const buttons = Array.from(document.querySelectorAll('button'));
                const hasNewGame = buttons.some(b => /nueva partida/i.test(b.innerText || '') && b.offsetParent !== null);
                const hasRestart = buttons.some(b => /reiniciar/i.test(b.innerText || '') && b.offsetParent !== null);
                const isVisible = (el) => {
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                };
                return {
                    innerWidth: window.innerWidth,
                    scrollWidth: doc.scrollWidth,
                    noHorizontalOverflow: doc.scrollWidth <= window.innerWidth + 1,
                    boardVisible: isVisible(board),
                    clocksVisible: isVisible(clocks),
                    historyVisible: isVisible(history),
                    themesVisible: isVisible(themes),
                    hasNewGame,
                    hasRestart,
                };
            }"""
        )

    def cmd_evaluate_storage(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        key = params["key"]
        if "value" in params:
            val = params["value"]
            page.evaluate("([k, v]) => window.localStorage.setItem(k, v)", [key, val])
            return {"ok": True}
        result = page.evaluate("(k) => window.localStorage.getItem(k)", key)
        return {"value": result}

    def cmd_wait_ms(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        page.wait_for_timeout(int(params["ms"]))
        return {"ok": True}

    def cmd_wait_for_ai_turn_complete(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        timeout_ms = int(params.get("timeout_ms", 10000))
        page.wait_for_function(
            """() => {
                const thinking = Array.from(document.querySelectorAll('[role="status"]'))
                    .some(el => /pensando/i.test(el.innerText || ''));
                return !thinking;
            }""",
            timeout=timeout_ms,
        )
        return {"ok": True}

    def cmd_clock_fast_forward(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        if not self.clock_installed:
            raise RuntimeError("clock_fast_forward requires install_clock=True in new_context")
        page.clock.fast_forward(int(params["ms"]))
        return {"ok": True}

    def cmd_clock_run_for(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        if not self.clock_installed:
            raise RuntimeError("clock_run_for requires install_clock=True in new_context")
        page.clock.run_for(int(params["ms"]))
        return {"ok": True}

    def cmd_press_key(self, params: dict[str, Any]) -> dict[str, Any]:
        page = self._require_page()
        page.keyboard.press(params["key"])
        return {"ok": True}


def main() -> int:
    with sync_playwright() as pw:
        browser, browser_source = launch_browser(pw)
        session = DriverSession(browser, browser_source)
        try:
            for raw_line in sys.stdin:
                line = raw_line.strip()
                if not line:
                    continue
                req_id = None
                try:
                    req = json.loads(line)
                    req_id = req.get("id")
                    cmd = req.get("cmd")
                    params = req.get("params") or {}

                    if cmd == "shutdown":
                        session.close_context()
                        sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": {"shutdown": True}}) + "\n")
                        sys.stdout.flush()
                        break

                    if cmd == "close_context":
                        res = session.close_context()
                    else:
                        handler = getattr(session, f"cmd_{cmd}", None)
                        if handler is None:
                            raise ValueError(f"Unknown browser_driver command: {cmd}")
                        res = handler(params)

                    sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": res}) + "\n")
                    sys.stdout.flush()
                except Exception as exc:
                    sys.stdout.write(
                        json.dumps(
                            {
                                "id": req_id,
                                "ok": False,
                                "error": str(exc),
                                "traceback": traceback.format_exc(),
                            }
                        )
                        + "\n"
                    )
                    sys.stdout.flush()
        finally:
            session.close_context()
            browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
