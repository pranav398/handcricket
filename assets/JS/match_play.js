/**
 * Lightweight ball play — CPU picks locally; one small JSON POST to sync session.
 */
(function () {
  "use strict";

  function init() {
    var cfg = window.MATCH_PLAY;
    if (!cfg || !cfg.ajaxUrl) return;

    var ballResultEl = document.getElementById("ballResult");
    var scorebarWrap = document.getElementById("scorebarWrap");
    var busy = false;
    var cooldownTimer = null;
    var giveUpInFlight = false;

    function pad2(value) {
      return String(value).padStart(2, "0");
    }

    function formatCountdown(totalSeconds) {
      var mins = Math.floor(totalSeconds / 60);
      var secs = totalSeconds % 60;
      return mins + ":" + pad2(secs);
    }

    function stopCooldownTimer() {
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }

    function submitGiveUp() {
      if (giveUpInFlight || !cfg || !cfg.ajaxUrl) return;
      giveUpInFlight = true;
      var body = new FormData();
      body.append("give_up", "1");
      fetch(cfg.ajaxUrl, { method: "POST", body: body, credentials: "same-origin" })
        .then(function () {
          window.location.href = cfg.ajaxUrl;
        })
        .catch(function () {
          window.location.reload();
        })
        .finally(function () {
          giveUpInFlight = false;
        });
    }

    function syncCooldownBanner(deadlineMs) {
      var banner = document.getElementById("cpuCooldownBanner");
      if (!banner) return;
      if (!deadlineMs || Number.isNaN(deadlineMs)) {
        stopCooldownTimer();
        banner.className = "match-countdown-banner";
        banner.innerHTML = "";
        banner.style.display = "none";
        return;
      }
      var remainingMs = Math.max(0, Number(deadlineMs) - Date.now());
      if (remainingMs <= 0) {
        stopCooldownTimer();
        banner.className = "match-countdown-banner is-danger";
        banner.innerHTML = '<span>Cooldown</span><strong>0:00</strong>';
        banner.style.display = "flex";
        submitGiveUp();
        return;
      }
      var totalSeconds = Math.ceil(remainingMs / 1000);
      banner.className = "match-countdown-banner" + (totalSeconds <= 10 ? " is-warning" : "");
      banner.innerHTML = '<span>Ball cooldown</span><strong>' + formatCountdown(totalSeconds) + '</strong>';
      banner.style.display = "flex";
    }

    function startCooldownClock(deadlineMs) {
      cfg.cooldownDeadlineMs = deadlineMs || null;
      stopCooldownTimer();
      syncCooldownBanner(cfg.cooldownDeadlineMs);
      if (!cfg.cooldownDeadlineMs) return;
      cooldownTimer = setInterval(function () {
        syncCooldownBanner(cfg.cooldownDeadlineMs);
      }, 1000);
    }

    function pickCpuNum() {
      if (window.CpuAI && typeof window.CpuAI.pick === "function") {
        return window.CpuAI.pick(cfg.userBats, cfg.userHistory || [], cfg.numberMin, cfg.numberMax);
      }
      var minNum = Number.isFinite(cfg.numberMin) ? cfg.numberMin : 0;
      var maxNum = Number.isFinite(cfg.numberMax) ? cfg.numberMax : 6;
      return minNum + Math.floor(Math.random() * (maxNum - minNum + 1));
    }

    function syncNumberPad() {
      var form = document.getElementById("playForm");
      if (!form) return;
      var grid = form.querySelector(".number-grid");
      if (!grid) return;
      var minNum = Number.isFinite(cfg.numberMin) ? cfg.numberMin : 0;
      var maxNum = Number.isFinite(cfg.numberMax) ? cfg.numberMax : 6;
      var html = "";
      for (var n = minNum; n <= maxNum; n++) {
        html += '<button type="button" class="num-btn num-btn-active play-num" data-form="playForm" data-num="' + n + '">' + n + "</button>";
      }
      grid.innerHTML = html;
      bindPlayButtons();
    }

    function showFx(fx) {
      if (!fx || ["out", "four", "six", "run7", "run8", "run9", "run10"].indexOf(fx) === -1) return;
      var existing = document.getElementById("ballFxOverlay");
      if (existing) {
        existing.remove();
      }
      var labels = {
        out: "OUT!",
        four: "FOUR!",
        six: "SIX!",
        run7: "SEVEN!",
        run8: "EIGHT!",
        run9: "NINE!",
        run10: "TEN!",
      };
      var el = document.createElement("div");
      el.className = "ball-fx-overlay ball-fx-" + fx;
      el.id = "ballFxOverlay";
      el.innerHTML =
        '<div class="ball-fx-burst"></div><p class="ball-fx-text">' + labels[fx] + "</p>";
      document.body.appendChild(el);
      document.body.classList.add("ball-fx-active");
      setTimeout(function () {
        el.classList.add("ball-fx-hide");
        document.body.classList.remove("ball-fx-active");
      }, 1400);
      setTimeout(function () {
        el.remove();
      }, 2000);
    }

    function setBallResult(ball) {
      if (!ballResultEl || !ball) return;
      var cls = "ball-result";
      if (ball.out) cls += " ball-result-out";
      else if (ball.runs >= 7 && ball.runs <= 10) cls += " ball-result-power";
      else if (ball.runs === 6) cls += " ball-result-six";
      else if (ball.runs === 4) cls += " ball-result-four";
      ballResultEl.className = cls;
      if (ball.out) {
        ballResultEl.innerHTML =
          "OUT! Both played <strong>" + ball.bat + "</strong>";
      } else {
        var you = ball.userBats ? ball.bat : ball.bowl;
        var cpu = ball.userBats ? ball.bowl : ball.bat;
        ballResultEl.innerHTML =
          "+" + ball.runs + " runs (you " + (ball.userBats ? "bat" : "bowl") +
          " <strong>" + you + "</strong> · CPU <strong>" + cpu + "</strong>)";
      }
      ballResultEl.style.display = "block";
    }

    function updateScorebar(sb) {
      if (!scorebarWrap || !sb) return;
      var html = '<div class="scorebar">';
      html += '<div class="scorebar-bats"><span class="scorebar-side-label">' + esc(sb.batLabel) + "</span>";
      html += batRow(sb.striker, true) + batRow(sb.nonStriker, false) + "</div>";
      html += '<div class="scorebar-center"><span class="scorebar-score">' + sb.runs + "-" + sb.wickets + "</span>";
      html += '<div class="scorebar-center-meta"><span class="scorebar-overs">' + esc(sb.overs) + " ov</span>";
      if (sb.target) html += '<span class="scorebar-target">T ' + sb.target + "</span>";
      html += "</div></div>";
      html += '<div class="scorebar-bowl"><span class="scorebar-side-label">' + esc(sb.bowlLabel) + "</span>";
      html += '<div class="scorebar-bowler"><span class="scorebar-bowler-name">' + esc(sb.bowler.name) + "</span>";
      html += '<span class="scorebar-bowler-fig"><strong>' + sb.bowler.w + "</strong>-" + sb.bowler.r + "-" + sb.bowler.b + "</span></div></div>";
      html += renderOverSummary(sb.overSummary);
      if (sb.chaseSummary) {
        html += '<p class="scorebar-chase">' + esc(sb.chaseSummary.runs) + " runs in " + esc(sb.chaseSummary.balls) + " balls</p>";
      }
      html += '<p class="scorebar-hint">' + esc(sb.hint) + "</p></div>";
      scorebarWrap.innerHTML = html;
    }

    function renderOverSummary(summary) {
      summary = summary || { items: [], runs: 0 };
      var items = Array.isArray(summary.items) ? summary.items : [];
      var html = '<div class="scorebar-over"><span class="scorebar-over-label">This over</span><div class="scorebar-over-balls">';
      if (items.length) {
        items.forEach(function (item) {
          var val = String(item);
          html += '<span class="scorebar-ball' + (val === "W" ? " scorebar-ball-wicket" : "") + '">' + esc(val) + "</span>";
        });
      } else {
        html += '<span class="scorebar-ball scorebar-ball-empty">-</span>';
      }
      html += '</div><strong class="scorebar-over-runs">Over: ' + (parseInt(summary.runs, 10) || 0) + "</strong></div>";
      return html;
    }

    function batRow(b, strike) {
      var c = strike ? "scorebar-bat on-strike" : "scorebar-bat";
      var star = strike ? "<em>*</em>" : "";
      return '<div class="' + c + '">' + star + '<span class="scorebar-bat-name">' + esc(b.name) + "</span>" +
        '<span class="scorebar-bat-fig"><strong>' + b.r + "</strong> (" + b.b + ")</span></div>";
    }

    function esc(s) {
      if (s === null || s === undefined) return "";
      var d = document.createElement("div");
      d.textContent = String(s);
      return d.innerHTML;
    }

    function playBall(userNum) {
      if (busy) return;
      busy = true;

      var cpuNum = pickCpuNum();
      var body = new FormData();
      body.append("ajax", "1");
      body.append("play_ball", String(userNum));
      body.append("cpu_ball", String(cpuNum));

      fetch(cfg.ajaxUrl, { method: "POST", body: body, credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error("Invalid JSON");
          }
          if (!data.ok) throw new Error("Server rejected ball");

          if (data.userHistory) cfg.userHistory = data.userHistory;
          if (data.userBats !== undefined) cfg.userBats = data.userBats;
          if (data.numberMin !== undefined) cfg.numberMin = data.numberMin;
          if (data.numberMax !== undefined) cfg.numberMax = data.numberMax;
          if (data.isPowerplay !== undefined) cfg.isPowerplay = data.isPowerplay;
          if (data.cooldownDeadlineMs !== undefined) {
            cfg.cooldownDeadlineMs = data.cooldownDeadlineMs;
          }

          if (data.ball) setBallResult(data.ball);
          if (data.scorebar) updateScorebar(data.scorebar);
          if (data.fx) showFx(data.fx);
          syncNumberPad();
          startCooldownClock(cfg.cooldownDeadlineMs);

          if (data.redirect) {
            window.location.href = data.redirect;
            return;
          }
        })
        .catch(function () {
          /* Fallback: classic form post if AJAX fails */
          var form = document.getElementById("playForm");
          var input = document.getElementById("playFormVal");
          if (form && input) {
            input.name = "play_ball";
            input.value = String(userNum);
            var cpuInput = document.getElementById("playFormCpu");
            if (!cpuInput) {
              cpuInput = document.createElement("input");
              cpuInput.type = "hidden";
              cpuInput.name = "cpu_ball";
              cpuInput.id = "playFormCpu";
              form.appendChild(cpuInput);
            }
            cpuInput.value = String(cpuNum);
            form.submit();
            return;
          }
        })
        .finally(function () {
          busy = false;
        });
    }

    function bindPlayButtons() {
      var buttons = document.querySelectorAll(".play-num");
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          playBall(parseInt(btn.getAttribute("data-num"), 10));
        });
      });
    }

    if (!document.querySelectorAll(".play-num").length) return;
    bindPlayButtons();

    var form = document.getElementById("playForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
      });
    }

    startCooldownClock(cfg.cooldownDeadlineMs || null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
