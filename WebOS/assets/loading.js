(() => {
    "use strict";
    const FILE_VERSION='1.0';
    if (window.__MUNITOS_BOOT__) return;
    window.__MUNITOS_BOOT__ = true;
    const BIOS_Z_INDEX = 2147483646;
    const LOADING_Z_INDEX = BIOS_Z_INDEX + 1;
    const MIN_TIME = 2000;
    const FAIL_TIME = 15000;
    const EXIT_TIME = 1100;
    const LOGO_URL = new URL("assets/img/image_smooth.svg?v=1", document.baseURI).href;
    const startedAt = performance.now();
    const css = `
.munitos-boot{position:fixed;inset:0;width:100%;height:100vh;height:100dvh;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;isolation:isolate;z-index:${LOADING_Z_INDEX};opacity:1;visibility:visible;transform:scale(1);filter:blur(0);pointer-events:auto;will-change:opacity,transform,filter;contain:strict;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;transition:opacity ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),transform ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),filter ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),visibility 0s linear 0s}
.munitos-boot.is-leaving{opacity:0;visibility:hidden;transform:scale(.985);filter:blur(7px);pointer-events:none;transition:opacity ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),transform ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),filter ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),visibility 0s linear ${EXIT_TIME}ms}
.munitos-boot *,.munitos-boot *::before,.munitos-boot *::after{box-sizing:border-box}
.munitos-boot-shell{position:relative;width:min(92vw,620px);display:flex;align-items:center;justify-content:center;flex-direction:column;transform:translateZ(0);will-change:opacity,transform;transition:opacity ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1),transform ${EXIT_TIME}ms cubic-bezier(.16,1,.3,1)}
.munitos-boot.is-leaving .munitos-boot-shell{opacity:0;transform:translateY(-4px) scale(.992)}
.munitos-boot-stage{position:relative;width:min(52vw,52vh,520px);height:min(52vw,52vh,520px);display:block;contain:layout paint;transform:translateZ(0)}
.munitos-boot-glow{position:absolute;inset:12%;z-index:0;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.10) 0,rgba(255,255,255,.035) 30%,rgba(255,255,255,0) 67%);filter:blur(18px);opacity:.38}
.munitos-boot-logo{position:absolute;inset:0;z-index:1;width:100%;height:100%;background:url("${LOGO_URL}") center/contain no-repeat;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;opacity:.97;animation:munitosBootPulse 3s ease-in-out infinite}
.munitos-boot-status{position:relative;width:100%;min-height:28px;margin-top:10px;display:flex;align-items:center;justify-content:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:clamp(12px,1.55vw,15px);font-weight:500;line-height:1.6;letter-spacing:.22em;color:rgba(255,255,255,.72);text-align:center;white-space:pre;user-select:none;-webkit-user-select:none;text-shadow:0 0 12px rgba(255,255,255,.10);transition:opacity ${EXIT_TIME*.82}ms cubic-bezier(.16,1,.3,1),transform ${EXIT_TIME*.82}ms cubic-bezier(.16,1,.3,1)}
.munitos-boot-status::after{content:"";display:inline-block;width:1px;height:1.05em;margin-left:4px;vertical-align:-.16em;background:rgba(255,255,255,.92);box-shadow:0 0 8px rgba(255,255,255,.45);animation:munitosBootCaret .78s steps(1,end) infinite}
.munitos-boot.is-leaving .munitos-boot-status{opacity:0;transform:translateY(3px)}
.munitos-boot-error{display:none;margin-top:16px;width:min(92vw,560px);text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;color:rgba(255,255,255,.62)}
.munitos-boot-error.is-visible{display:block}
.munitos-boot-error-title{margin:0 0 8px;color:#fff;font:700 clamp(14px,2vw,18px)/1.4 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.munitos-boot-error-text{margin:0;font-size:clamp(10px,1.45vw,13px);line-height:1.7;white-space:pre-line}
.munitos-boot-actions{margin-top:16px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.munitos-boot-button{appearance:none;-webkit-appearance:none;border:1px solid rgba(255,255,255,.14);outline:none;min-width:112px;min-height:38px;padding:9px 16px;border-radius:8px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.8);font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;cursor:pointer;transition:background .28s,border-color .28s,color .28s,transform .28s,box-shadow .28s}
.munitos-boot-button:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.24);color:#fff;transform:translateY(-1px)}
.munitos-boot-button:active{transform:translateY(0)}
.munitos-boot-button-primary{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.08);color:#fff}
@keyframes munitosBootPulse{0%,100%{opacity:.92}50%{opacity:1}}
@keyframes munitosBootCaret{0%,49%{opacity:1}50%,100%{opacity:0}}
@media (max-width:700px){.munitos-boot-status{margin-top:8px;font-size:12px;letter-spacing:.19em}}
@media (max-height:500px){.munitos-boot-status{margin-top:4px}.munitos-boot-stage{transform:translateY(-4px)}}
@media (prefers-reduced-motion:reduce){.munitos-boot-logo,.munitos-boot-status::after{animation:none}}
`;
    const style = document.createElement("style");
    style.id = "munitos-boot-style";
    style.textContent = css;
    const boot = document.createElement("main");
    boot.className = "munitos-boot";
    boot.setAttribute("aria-label", "MUNITOS Loading");
    boot.setAttribute("role", "status");
    const shell = document.createElement("div");
    shell.className = "munitos-boot-shell";
    const stage = document.createElement("div");
    stage.className = "munitos-boot-stage";
    stage.setAttribute("aria-hidden", "true");
    const glow = document.createElement("div");
    glow.className = "munitos-boot-glow";
    const logo = document.createElement("div");
    logo.className = "munitos-boot-logo";
    logo.setAttribute("aria-hidden", "true");
    const status = document.createElement("div");
    status.className = "munitos-boot-status";
    status.setAttribute("aria-live", "polite");
    const errorBox = document.createElement("div");
    errorBox.className = "munitos-boot-error";
    const errorTitle = document.createElement("div");
    errorTitle.className = "munitos-boot-error-title";
    errorTitle.textContent = "MUNITOS boot failed";
    const errorText = document.createElement("div");
    errorText.className = "munitos-boot-error-text";
    const actions = document.createElement("div");
    actions.className = "munitos-boot-actions";
    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "munitos-boot-button munitos-boot-button-primary";
    refreshButton.textContent = "Refresh";
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "munitos-boot-button";
    continueButton.textContent = "Continue Anyway";
    actions.appendChild(refreshButton);
    actions.appendChild(continueButton);
    errorBox.appendChild(errorTitle);
    errorBox.appendChild(errorText);
    errorBox.appendChild(actions);
    stage.appendChild(glow);
    stage.appendChild(logo);
    shell.appendChild(stage);
    shell.appendChild(status);
    shell.appendChild(errorBox);
    boot.appendChild(shell);
    const mount = () => {
        if (!document.body) {
            requestAnimationFrame(mount);
            return;
        }
        if (!style.isConnected) document.head.appendChild(style);
        if (!boot.isConnected) document.body.appendChild(boot);
    };
    mount();
    const phrases = ["Loading MUNITOS"];
    let charIndex = 0;
    let deleting = false;
    let typingTimer = 0;
    let stoppingTyping = false;
    const typeLoop = () => {
        if (stoppingTyping) return;
        const word = phrases[0];
        if (!deleting) {
            charIndex += 1;
            status.textContent = word.slice(0, charIndex);
            if (charIndex >= word.length) {
                deleting = true;
                typingTimer = window.setTimeout(typeLoop, 850);
                return;
            }
            typingTimer = window.setTimeout(typeLoop, 74);
            return;
        }
        charIndex -= 1;
        status.textContent = word.slice(0, charIndex);
        if (charIndex <= 0) {
            deleting = false;
            typingTimer = window.setTimeout(typeLoop, 140);
            return;
        }
        typingTimer = window.setTimeout(typeLoop, 42);
    };
    const stopTyping = text => {
        stoppingTyping = true;
        if (typingTimer) {
            window.clearTimeout(typingTimer);
            typingTimer = 0;
        }
        status.textContent = text || "";
    };
    typeLoop();
    let finished = false;
    let timedOut = false;
    let removing = false;
    let minTimer = 0;
    let failTimer = 0;
    let removeTimer = 0;
    const isTrackedResource = element => {
        if (!element || !element.tagName) return false;
        const tag = element.tagName.toLowerCase();
        if (tag === "script") {
            return Boolean(element.src);
        }
        if (tag === "link") {
            return String(element.rel || "").toLowerCase().split(/\s+/).includes("stylesheet");
        }
        return false;
    };
    const getResourceState = element => {
        if (!isTrackedResource(element)) return "ignore";
        const tag = element.tagName.toLowerCase();
        if (tag === "script") {
            return element.dataset.munitosLoadState || "pending";
        }
        if (tag === "link") {
            if (element.dataset.munitosLoadState) {
                return element.dataset.munitosLoadState;
            }
            try {
                if (element.sheet) return "loaded";
            } catch (_) {}
            return "pending";
        }
        return "ignore";
    };
    const watchResource = element => {
        if (!isTrackedResource(element) || element.dataset.munitosObserved === "1") {
            return;
        }
        element.dataset.munitosObserved = "1";
        const markLoaded = () => {
            element.dataset.munitosLoadState = "loaded";
            checkResources();
        };
        const markFailed = () => {
            element.dataset.munitosLoadState = "failed";
            checkResources();
        };
        element.addEventListener("load", markLoaded, { once: true });
        element.addEventListener("error", markFailed, { once: true });
        if (getResourceState(element) === "loaded") {
            queueMicrotask(checkResources);
        }
    };
    const getTrackedResources = () => {
        const resources = [];
        document.querySelectorAll("script[src],link[rel~=\"stylesheet\"]").forEach(element => {
            if (isTrackedResource(element)) {
                resources.push(element);
                watchResource(element);
            }
        });
        return resources;
    };
    const checkResources = () => {
        if (finished || timedOut || removing) return;
        const resources = getTrackedResources();
        let pending = 0;
        let failed = 0;
        for (const resource of resources) {
            const state = getResourceState(resource);
            if (state === "pending") pending += 1;
            if (state === "failed") failed += 1;
        }
        if (failed > 0) {
            showFailure(`MUNITOS could not load ${failed} JS/CSS resource${failed === 1 ? "" : "s"}.`);
            return;
        }
        if (pending === 0 && document.readyState !== "loading") {
            finish();
        }
    };
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!node || node.nodeType !== 1) continue;
                if (isTrackedResource(node)) {
                    watchResource(node);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll("script[src],link[rel~=\"stylesheet\"]").forEach(watchResource);
                }
            }
        }
        checkResources();
    });
    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
    });
    const cleanup = () => {
        if (typingTimer) {
            window.clearTimeout(typingTimer);
            typingTimer = 0;
        }
        if (minTimer) {
            window.clearTimeout(minTimer);
            minTimer = 0;
        }
        if (failTimer) {
            window.clearTimeout(failTimer);
            failTimer = 0;
        }
        if (removeTimer) {
            window.clearTimeout(removeTimer);
            removeTimer = 0;
        }
        try {
            observer.disconnect();
        } catch (_) {}
        try {
            refreshButton.removeEventListener("click", refreshPage);
        } catch (_) {}
        try {
            continueButton.removeEventListener("click", continueAnyway);
        } catch (_) {}
        try {
            boot.replaceChildren();
        } catch (_) {}
        try {
            boot.remove();
        } catch (_) {}
        try {
            style.remove();
        } catch (_) {}
        window.__MUNITOS_BOOT__ = false;
    };
    const fadeAndRemove = () => {
        if (removing) return;
        removing = true;
        stopTyping("");
        if (minTimer) {
            window.clearTimeout(minTimer);
            minTimer = 0;
        }
        if (failTimer) {
            window.clearTimeout(failTimer);
            failTimer = 0;
        }
        boot.setAttribute("aria-hidden", "true");
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!boot.isConnected) {
                    cleanup();
                    return;
                }
                boot.classList.add("is-leaving");
                removeTimer = window.setTimeout(() => {
                    cleanup();
                }, EXIT_TIME + 90);
            });
        });
    };
    const finish = () => {
        if (finished || timedOut || removing) return;
        finished = true;
        const elapsed = performance.now() - startedAt;
        const wait = Math.max(0, MIN_TIME - elapsed);
        if (!wait) {
            fadeAndRemove();
            return;
        }
        minTimer = window.setTimeout(() => {
            minTimer = 0;
            if (finished && !timedOut && !removing) {
                fadeAndRemove();
            }
        }, wait);
    };
    const showFailure = message => {
        if (finished || timedOut || removing) return;
        timedOut = true;
        if (failTimer) {
            window.clearTimeout(failTimer);
            failTimer = 0;
        }
        stopTyping("Boot failed");
        errorText.textContent = message;
        errorBox.classList.add("is-visible");
    };
    const showTimeout = () => {
        if (finished || timedOut || removing) return;
        timedOut = true;
        stopTyping("Loading timeout");
        errorText.textContent = "The MUNITOS JS/CSS boot sequence did not finish within 15 seconds.";
        errorBox.classList.add("is-visible");
    };
    const refreshPage = () => {
        try {
            window.location.reload();
        } catch (_) {
            location.reload();
        }
    };
    const continueAnyway = () => {
        if (removing) return;
        stopTyping("Continuing...");
        window.setTimeout(() => {
            if (!removing) {
                fadeAndRemove();
            }
        }, 180);
    };
    refreshButton.addEventListener("click", refreshPage);
    continueButton.addEventListener("click", continueAnyway);
    failTimer = window.setTimeout(() => {
        failTimer = 0;
        showTimeout();
    }, FAIL_TIME);
    window.addEventListener("load", checkResources, { once: true });
    if (document.readyState !== "loading") {
        checkResources();
    } else {
        document.addEventListener("DOMContentLoaded", checkResources, { once: true });
    }
    checkResources();
})();
