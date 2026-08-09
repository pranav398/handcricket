/**
 * Multiplayer match UI — Firebase real-time listener, no page reloads.
 */
(function () {
  "use strict";

  var boot = window.MP_BOOT;
  if (!boot || !boot.room || !boot.slot) return;

  var root = document.getElementById("mpApp");
  var scoreWrap = document.getElementById("scorebarWrap");
  var roomId = boot.room;
  var mySlot = boot.slot;
  var roomSnap = null;
  var busy = false;
  var statsSaved = false;
  var lastShownFxKey = null;
  var deferredRenderRoom = null;
  var deferredRenderTimer = null;
  var ballTimeoutHandle = null;
  var countdownTicker = null;
  var FX_ANIMATION_MS = 1400;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function nameFor(slot, players) {
    if (!players || !players[slot]) return slot === "player1" ? "Player 1" : "Player 2";
    return players[slot].username || slot;
  }

  function isMyTurn(game) {
    return game && game.turn === mySlot;
  }

  function setGiveUpVisible(show) {
    ["mpGiveUpBtn", "mpGiveUpMobile"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = show ? "" : "none";
    });
  }

  var leaveConfirmEnabled = true;

  var noticeTimeout = null;

  function confirmBeforeLeave(e) {
    if (!leaveConfirmEnabled) return;
    showNotice("Leaving will disconnect you and may force a timeout.");
    var message = "Leave the multiplayer match? This will disconnect you and may force a timeout.";
    e.preventDefault();
    e.returnValue = message;
    return message;
  }

  function shouldWarnLeave(game) {
    return game && ["abandoned", "finished"].indexOf(game.stage) === -1;
  }

  function showNotice(msg) {
    var el = document.getElementById("mpNotice");
    if (!el) {
      el = document.createElement("p");
      el.id = "mpNotice";
      el.className = "match-detail";
      el.style.color = "#f59e0b";
      el.style.textAlign = "center";
      el.style.marginBottom = "16px";
      root.insertBefore(el, root.firstChild);
    }
    if (noticeTimeout) {
      clearTimeout(noticeTimeout);
    }
    el.textContent = msg;
    el.style.display = "block";
    noticeTimeout = setTimeout(function () {
      el.style.display = "none";
      noticeTimeout = null;
    }, 4000);
  }

  function hideGiveUpConfirm() {
    var overlay = document.getElementById("mpGiveUpConfirmOverlay");
    if (overlay) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function showGiveUpConfirm() {
    hideGiveUpConfirm();

    var overlay = document.createElement("div");
    overlay.id = "mpGiveUpConfirmOverlay";
    overlay.className = "mp-confirm-overlay";

    var box = document.createElement("div");
    box.className = "mp-confirm-box";

    var heading = document.createElement("h2");
    heading.textContent = "Give Up";
    box.appendChild(heading);

    var detail = document.createElement("p");
    detail.className = "mp-confirm-detail";
    detail.textContent = "If you give up, your opponent will win the match and the current game will end.";
    box.appendChild(detail);

    var actions = document.createElement("div");
    actions.className = "mp-confirm-actions";

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "mp-confirm-btn mp-confirm-btn-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () {
      hideGiveUpConfirm();
    });

    var confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "mp-confirm-btn mp-confirm-btn-giveup";
    confirm.textContent = "Give Up";
    confirm.addEventListener("click", function () {
      hideGiveUpConfirm();
      executeGiveUp();
    });

    actions.appendChild(cancel);
    actions.appendChild(confirm);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function executeGiveUp() {
    commit(function (game) {
      return MpCore.giveUpMatch(game, mySlot);
    }).then(function (result) {
      if (result) {
        showNotice("You gave up — your opponent wins.");
      }
    });
  }

  function showErr(msg) {
    var el = document.getElementById("mpErr");
    if (!el) {
      el = document.createElement("p");
      el.id = "mpErr";
      el.className = "match-detail";
      el.style.color = "#f87171";
      el.style.textAlign = "center";
      el.style.marginBottom = "16px";
      root.insertBefore(el, root.firstChild);
    }
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(function () {
      el.style.display = "none";
    }, 4000);
  }

  function commit(mutator) {
    if (busy) return Promise.resolve();
    busy = true;
    return MpFirebase.commitGame(roomId, mutator)
      .catch(function (err) {
        showErr(err.message || "Update failed — try again");
        return null;
      })
      .finally(function () {
        busy = false;
      });
  }

  function clearBallTimeoutHandle() {
    if (ballTimeoutHandle) {
      clearTimeout(ballTimeoutHandle);
      ballTimeoutHandle = null;
    }
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatCountdown(totalSeconds) {
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    return mins + ":" + pad2(secs);
  }

  function stopCountdownTicker() {
    if (countdownTicker) {
      clearInterval(countdownTicker);
      countdownTicker = null;
    }
  }

  function syncCountdownBanner(game) {
    var banner = document.getElementById("matchCountdownBanner");
    if (!banner) return;
    if (!game || !game.ball_deadline || (game.stage !== "gameplay_1" && game.stage !== "gameplay_2")) {
      stopCountdownTicker();
      banner.style.display = "none";
      banner.innerHTML = "";
      var hurryEl = document.getElementById("mpHurryUp");
      if (hurryEl) hurryEl.remove();
      return;
    }
    var remainingMs = Math.max(0, Number(game.ball_deadline) - Date.now());
    if (remainingMs <= 0) {
      banner.className = "match-countdown-banner is-danger";
      banner.innerHTML = '<span>Ball cooldown</span><strong>0:00</strong>';
      banner.style.display = "flex";
      var hurryEl = document.getElementById("mpHurryUp");
      if (hurryEl) hurryEl.remove();
      return;
    }
    var totalSeconds = Math.ceil(remainingMs / 1000);
    var isHurry = totalSeconds <= 5;
    banner.className = "match-countdown-banner" + (totalSeconds <= 10 ? " is-warning" : "");
    banner.innerHTML = '<span>Ball cooldown</span><strong>' + formatCountdown(totalSeconds) + '</strong>';
    banner.style.display = "flex";
    if (isHurry && game.ball_picks) {
      var inn = MpCore.getInnings(game, game.current_innings);
      if (inn) {
        var batSlot = MpCore.battingSlot(inn);
        var bowlSlot = MpCore.bowlingSlot(inn);
        var myPick = null;
        var myRole = null;
        if (mySlot === batSlot) { myPick = game.ball_picks[batSlot]; myRole = "bat"; }
        else if (mySlot === bowlSlot) { myPick = game.ball_picks[bowlSlot]; myRole = "bowl"; }
        var missingMyChoice = (myRole && myPick == null);
        var hurryEl = document.getElementById("mpHurryUp");
        if (missingMyChoice) {
          if (!hurryEl) {
            hurryEl = document.createElement("div");
            hurryEl.id = "mpHurryUp";
            hurryEl.className = "mp-hurry-up";
            hurryEl.style.cssText = "position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:9999;padding:14px 20px;background:rgba(245,158,11,0.95);border:2px solid rgba(255,255,255,0.75);border-radius:14px;color:#111827;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;";
            hurryEl.innerHTML = "<span style=\"font-size:14px;\">Hurry up</span><div style=\"font-size:22px;\">Pick Now!</div>";
            document.body.appendChild(hurryEl);
          }
        } else {
          if (hurryEl) hurryEl.remove();
        }
      }
    } else {
      var hurryEl = document.getElementById("mpHurryUp");
      if (hurryEl) hurryEl.remove();
    }
    if (!countdownTicker) {
      countdownTicker = setInterval(function () {
        syncCountdownBanner(roomSnap && roomSnap.game);
      }, 1000);
    }
  }

  function maybeTriggerCooldownTimeout(room) {
    if (!room || !room.game) return;
    var g = room.game;
    if (!g || (g.stage !== "gameplay_1" && g.stage !== "gameplay_2")) {
      clearBallTimeoutHandle();
      return;
    }
    if (!g.ball_deadline || g.ball_timeout_for) {
      clearBallTimeoutHandle();
      return;
    }
    if (g.ball_picks && g.ball_picks.player1 != null && g.ball_picks.player2 != null) {
      clearBallTimeoutHandle();
      return;
    }
    if (Date.now() < Number(g.ball_deadline)) {
      var waitMs = Math.max(0, Number(g.ball_deadline) - Date.now());
      clearBallTimeoutHandle();
      ballTimeoutHandle = setTimeout(function () {
        maybeTriggerCooldownTimeout(roomSnap);
      }, waitMs);
      return;
    }
    commit(function (game) {
      return MpCore.resolveBallTimeout(game);
    });
  }

  function numGrid(active, clickClass, prefix, minNum, maxNum) {
    minNum = minNum == null ? 0 : minNum;
    maxNum = maxNum == null ? 6 : maxNum;
    var html = '<div class="number-grid">';
    for (var n = minNum; n <= maxNum; n++) {
      if (active) {
        html +=
          '<button type="button" class="num-btn num-btn-active ' +
          clickClass +
          '" data-num="' +
          n +
          '">' +
          n +
          "</button>";
      } else {
        html += '<button type="button" class="num-btn num-btn-disabled" disabled>' + n + "</button>";
      }
    }
    html += "</div>";
    return html;
  }

  function pickStatusText(canPick, myPick) {
    if (canPick) return "Pick your number";
    if (myPick != null) return "You picked <strong>" + myPick + "</strong>";
    return "Waiting for opponent…";
  }

  function formatBallReveal(revealed) {
    if (!revealed) return "";
    return (
      'Bat <strong>' +
      revealed.bat +
      "</strong> · Bowl <strong>" +
      revealed.bowl +
      "</strong>"
    );
  }

  function dualPlayPads(view, batName, bowlName, inn) {
    var iBat = mySlot === inn.batting_team;
    var iBowl = mySlot === inn.bowling_team;
    var rev = view.revealed;
    var range = roomSnap && roomSnap.game ? MpCore.allowedNumberRange(roomSnap.game, inn) : { min: 0, max: 6 };
    var html = '<div class="play-pads">';
    html += '<div class="toss-pad-col' + (view.canBat ? "" : " toss-pad-col-disabled") + '">';
    html += '<p class="play-pad-label">Batting · ' + esc(batName) + "</p>";
    html +=
      '<p class="play-pad-picked">' +
      (rev
        ? "Played " + formatBallReveal(rev)
        : pickStatusText(view.canBat, view.myBat)) +
      "</p>";
    html += numGrid(view.canBat, "mp-play-bat", "bat", range.min, range.max);
    html += "</div>";
    html += '<div class="toss-pad-col' + (view.canBowl ? "" : " toss-pad-col-disabled") + '">';
    html += '<p class="play-pad-label">Bowling · ' + esc(bowlName) + "</p>";
    html +=
      '<p class="play-pad-picked">' +
      (rev
        ? "Played " + formatBallReveal(rev)
        : pickStatusText(view.canBowl, view.myBowl)) +
      "</p>";
    html += numGrid(view.canBowl, "mp-play-bowl", "bowl", range.min, range.max);
    html += "</div></div>";
    return html;
  }

  function tossStatusText(canPick, myNum) {
    if (canPick) return "Pick your number";
    if (myNum != null) return "You picked <strong>" + myNum + "</strong>";
    return "Waiting for opponent…";
  }

  function dualTossPads(canP1, canP2, p1Name, p2Name, t) {
    var isP1 = mySlot === "player1";
    var html = '<div class="play-pads">';
    html += '<div class="toss-pad-col' + (canP1 ? "" : " toss-pad-col-disabled") + '">';
    html += '<div class="toss-player-tag">' + esc(p1Name) + "</div>";
    html +=
      '<p class="play-pad-picked">' +
      tossStatusText(canP1, isP1 ? t.num_p1 : null) +
      "</p>";
    html += numGrid(canP1, "mp-toss-num-p1", "p1");
    html += "</div>";
    html += '<div class="toss-pad-col' + (canP2 ? "" : " toss-pad-col-disabled") + '">';
    html += '<div class="toss-player-tag">' + esc(p2Name) + "</div>";
    html +=
      '<p class="play-pad-picked">' +
      tossStatusText(canP2, !isP1 ? t.num_p2 : null) +
      "</p>";
    html += numGrid(canP2, "mp-toss-num-p2", "p2");
    html += "</div></div>";
    return html;
  }

  function showFx(fx, key) {
    if (!fx || ["out", "four", "six", "run7", "run8", "run9", "run10"].indexOf(fx) === -1) return;
    if (key && lastShownFxKey === key) return;
    var existing = document.getElementById("ballFxOverlay");
    if (existing) {
      existing.remove();
    }
    if (key) lastShownFxKey = key;
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
    el.innerHTML = '<div class="ball-fx-burst"></div><p class="ball-fx-text">' + labels[fx] + "</p>";
    document.body.appendChild(el);
    document.body.classList.add("ball-fx-active");
    setTimeout(function () {
      el.classList.add("ball-fx-hide");
      document.body.classList.remove("ball-fx-active");
      el.remove();
    }, 1400);
  }

  function saveStatsIfNeeded(g) {
    if (!g.count_stats || statsSaved || !g.result) return;
    statsSaved = true;
    var won = g.result.winner === mySlot;
    fetch("mp_api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", won: won }),
    }).catch(function () {});
  }

  function renderScorebar(game, players, pickInfo) {
    if (!scoreWrap) return;
    var inn = MpCore.getInnings(game, game.current_innings);
    if (!inn || !inn.bat_stats || !inn.bowl_stats) {
      scoreWrap.innerHTML = "";
      return;
    }
    var batName = nameFor(inn.batting_team, players);
    var bowlName = nameFor(inn.bowling_team, players);
    var st = inn.striker;
    var ns = inn.non_striker;
    var bw = inn.bowler;
    var bs = inn.bat_stats;
    var bl = inn.bowl_stats;
    var view = MpCore.ballPickView(game, mySlot, pickInfo);
    var hint = "Pick your number — hidden until both players choose";
    if (view.revealed) {
      hint = "Both played — " + formatBallReveal(view.revealed);
    } else if (!view.canBat && !view.canBowl) {
      if (view.myBat != null || view.myBowl != null) hint = "Waiting for opponent to pick…";
      else hint = "Waiting for opponent…";
    }

    var html = '<div class="scorebar"><div class="scorebar-bats"><span class="scorebar-side-label">' + esc(batName) + "</span>";
    html += '<div class="scorebar-bat on-strike"><em>*</em><span class="scorebar-bat-name">' + esc(st) + "</span>";
    html += '<span class="scorebar-bat-fig"><strong>' + bs[st].runs + "</strong> (" + bs[st].balls + ")</span></div>";
    html += '<div class="scorebar-bat"><span class="scorebar-bat-name">' + esc(ns) + "</span>";
    html += '<span class="scorebar-bat-fig"><strong>' + bs[ns].runs + "</strong> (" + bs[ns].balls + ")</span></div></div>";
    html += '<div class="scorebar-center"><span class="scorebar-score">' + inn.runs + "-" + inn.wickets + "</span>";
    html += '<div class="scorebar-center-meta"><span class="scorebar-overs">' + MpCore.formatOvers(inn) + " ov</span>";
    if (game.current_innings === 2 && game.target) html += '<span class="scorebar-target">T ' + game.target + "</span>";
    html += "</div></div>";
    html += '<div class="scorebar-bowl"><span class="scorebar-side-label">' + esc(bowlName) + "</span>";
    html += '<div class="scorebar-bowler"><span class="scorebar-bowler-name">' + esc(bw) + "</span>";
    html += '<span class="scorebar-bowler-fig"><strong>' + bl[bw].wickets + "</strong>-" + bl[bw].runs + "-" + bl[bw].balls + "</span></div></div>";
    html += renderOverSummary(currentOverSummary(inn));
    var chase = chaseSummary(game, inn);
    if (chase) {
      html += '<p class="scorebar-chase">' + chase.runs + " runs in " + chase.balls + " balls</p>";
    }
    html += '<p class="scorebar-hint">' + hint + "</p></div>";
    scoreWrap.innerHTML = html;
  }

  function chaseSummary(game, inn) {
    if (game.current_innings !== 2 || game.target == null) return null;
    return {
      runs: Math.max(0, parseInt(game.target, 10) - (parseInt(inn.runs, 10) || 0)),
      balls: Math.max(0, game.overs * 6 - MpCore.inningsTotalBalls(inn)),
    };
  }

  function currentOverSummary(inn) {
    var log = inn.ball_log || [];
    var ballsInOver = parseInt(inn.balls_in_over, 10) || 0;
    var take = ballsInOver > 0 ? ballsInOver : Math.min(6, log.length);
    var balls = take > 0 ? log.slice(-take) : [];
    var summary = { items: [], runs: 0 };
    balls.forEach(function (ball) {
      var runs = parseInt(ball.runs, 10) || 0;
      summary.runs += runs;
      summary.items.push(ball.out ? "W" : String(runs));
    });
    return summary;
  }

  function renderOverSummary(summary) {
    var items = summary.items || [];
    var html = '<div class="scorebar-over"><span class="scorebar-over-label">This over</span><div class="scorebar-over-balls">';
    if (items.length) {
      items.forEach(function (item) {
        html += '<span class="scorebar-ball' + (item === "W" ? " scorebar-ball-wicket" : "") + '">' + esc(item) + "</span>";
      });
    } else {
      html += '<span class="scorebar-ball scorebar-ball-empty">-</span>';
    }
    html += '</div><strong class="scorebar-over-runs">Over: ' + summary.runs + "</strong></div>";
    return html;
  }

  function waitBanner(on) {
    return on ? "" : '<p class="match-hint mp-wait-banner">Waiting for opponent…</p>';
  }

  function bindNums(selector, handler) {
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function () {
        handler(parseInt(btn.getAttribute("data-num"), 10));
      });
    });
  }

  function bindChoices(selector, handler) {
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        handler(btn.getAttribute("data-val"));
      });
    });
  }

  function renderInningsSetup(g, p) {
    var lu = g.lineup;
    if (!lu) return '<section class="match-stage"><p class="match-detail">Loading lineup…</p></section>';
    var mine = isMyTurn(g);
    var batName = nameFor(lu.batting_team, p);
    var bowlName = nameFor(lu.bowling_team, p);
    var players = MpCore.makeTeamPlayers(g.team_size);
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">INNINGS ' + lu.inning + "</p>";

    if (lu.phase === "openers") {
      html += "<h1 class=\"match-title\">" + esc(batName) + " — <strong>Openers</strong></h1>";
      html += '<p class="match-detail">Select two opening batters</p>';
      html += waitBanner(mine);
      if (mine) {
        html += '<div class="opener-grid" id="mpOpenerGrid">';
        players.forEach(function (pl) {
          html +=
            '<label class="opener-card"><input type="checkbox" class="opener-check" value="' +
            esc(pl) +
            '"><span class="opener-name">' +
            esc(pl) +
            '</span><span class="opener-sub">Tap to select</span></label>';
        });
        html += "</div>";
        html += '<button type="button" class="match-choice-btn match-choice-btn-wide" id="mpOpenersNext" disabled>NEXT</button>';
      }
    } else if (lu.phase === "striker") {
      html += "<h1 class=\"match-title\">" + esc(batName) + " — <strong>Striker</strong></h1>";
      html += '<p class="match-detail">Tap a player for striker (other becomes non-striker)</p>';
      html += waitBanner(mine);
      if (mine) {
        html += '<div class="opener-grid">';
        lu.openers.forEach(function (pl) {
          html +=
            '<button type="button" class="opener-card mp-striker-card" data-player="' +
            esc(pl) +
            '"><span class="opener-name">' +
            esc(pl) +
            '</span><span class="opener-sub">Tap for striker</span></button>';
        });
        html += "</div>";
      }
    } else if (lu.phase === "bowler") {
      html += "<h1 class=\"match-title\">" + esc(bowlName) + " — <strong>Opening Bowler</strong></h1>";
      html += waitBanner(mine);
      if (mine) {
        html += '<div class="opener-grid">';
        players.forEach(function (pl) {
          html +=
            '<button type="button" class="opener-card mp-bowler-pick" data-player="' +
            esc(pl) +
            '"><span class="opener-name">' +
            esc(pl) +
            '</span><span class="opener-sub">Select</span></button>';
        });
        html += "</div>";
      }
    }
    html += "</section>";
    return html;
  }

  function render(room) {
    roomSnap = room;
    if (!room || !room.game) return;
    var g = room.game;
    var p = room.players || {};
    var pickInfo = room.pickInfo || null;
    document.getElementById("mpNavRoom").textContent = "ROOM " + roomId;

    leaveConfirmEnabled = shouldWarnLeave(g);
    var hideGiveUp = ["lobby", "abandoned", "finished"].indexOf(g.stage) !== -1;
    setGiveUpVisible(!hideGiveUp);

    var html = "";
    var p1n = nameFor("player1", p);
    var p2n = nameFor("player2", p);

    if (g.stage === "lobby") {
      var waiting = !p.player2;
      html = '<section class="match-stage"><p class="match-kicker">MULTIPLAYER</p>';
      html += "<h1 class=\"match-title\">Room <strong>" + esc(roomId) + "</strong></h1>";
      html += "<p class=\"match-detail\">" + (waiting ? "Share the code — waiting for opponent…" : "Opponent connected! Starting toss…") + "</p>";
      if (p.player1) html += '<p class="match-detail">' + esc(p1n) + " (host)</p>";
      if (p.player2) html += '<p class="match-detail">' + esc(p2n) + " joined</p>";
      html += "</section>";
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "toss_1") {
      var mine = isMyTurn(g) && mySlot === "player1";
      html = '<section class="match-stage"><p class="match-kicker">MATCH TOSS</p>';
      html += "<h1 class=\"match-title\">" + esc(p1n) + " calls</h1>";
      html += waitBanner(mine);
      if (mine) {
        html += '<div class="match-choice-row"><button type="button" class="match-choice-btn mp-toss-call" data-val="odd">ODD</button>';
        html += '<button type="button" class="match-choice-btn mp-toss-call" data-val="even">EVEN</button></div>';
      }
      html += "</section>";
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "toss_2") {
      var t = g.toss;
      var canP1 = mySlot === "player1" && t.num_p1 == null;
      var canP2 = mySlot === "player2" && t.num_p2 == null;
      html = '<section class="match-stage match-stage-wide"><div class="match-call-display">';
      html += '<span class="match-call-pill' + (t.call === "odd" ? " is-active" : "") + '">ODD</span>';
      html += '<span class="match-call-pill' + (t.call === "even" ? " is-active" : "") + '">EVEN</span></div>';
      html += '<p class="match-hint">Pick at the same time — choices stay hidden until both are in</p>';
      html += dualTossPads(canP1, canP2, p1n, p2n, t);
      html += "</section>";
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "toss_3") {
      var tw = g.toss;
      var winName = nameFor(tw.winner, p);
      var mineWin = isMyTurn(g);
      html = '<section class="match-stage"><p class="match-kicker">TOSS RESULT</p>';
      html += "<h1 class=\"match-title\">" + esc(winName) + " <strong>won</strong></h1>";
      html += '<p class="match-detail">Played <strong>' + tw.num_p1 + "</strong> · <strong>" + tw.num_p2 + "</strong></p>";
      html += waitBanner(mineWin);
      if (mineWin) {
        html += '<div class="match-choice-row"><button type="button" class="match-choice-btn mp-toss-role" data-val="bat">BAT</button>';
        html += '<button type="button" class="match-choice-btn match-choice-btn-outline mp-toss-role" data-val="bowl">BOWL</button></div>';
      }
      html += "</section>";
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "innings_setup") {
      html = renderInningsSetup(g, p);
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "innings_break") {
      var inn1 = MpCore.getInnings(g, 1);
      if (!inn1) {
        html = '<section class="match-stage"><p class="match-detail">Loading innings break…</p></section>';
        root.innerHTML = html;
        return;
      }
      html = '<section class="match-stage match-stage-wide innings-break-stage"><p class="match-kicker">INNINGS BREAK</p>';
      html += "<h1 class=\"match-title\">End of <strong>first innings</strong></h1>";
      html += '<div class="innings-break-summary"><div class="break-stat"><span class="break-stat-label">Score</span>';
      html += '<span class="break-stat-value">' + inn1.runs + "/" + inn1.wickets + "</span></div>";
      html += '<div class="break-stat break-stat-target"><span class="break-stat-label">Target</span>';
      html += '<span class="break-stat-value">' + g.target + "</span></div></div>";
      html += '<div class="scorecard scorecard-break"><h2 class="scorecard-heading">Innings 1 Scorecard</h2>';
      html += renderInningsScorecardHtml(g, p, 1);
      html += "</div>";
      if (isMyTurn(g)) {
        html += '<div id="mpInningsBreakCountdown" style="margin-bottom:12px;font-size:13px;color:var(--slate-warm);">Second innings starting in <strong id="mpInningsBreakTimer">30</strong>s</div>';
        html += '<button type="button" class="match-choice-btn match-choice-btn-wide" id="mpStartInn2">START SECOND INNINGS</button>';
      } else {
        html += waitBanner(false);
      }
      html += "</section>";
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "lineup_pick") {
      var inn = MpCore.getInnings(g, g.current_innings);
      if (!inn) {
        html = '<section class="match-stage"><p class="match-detail">Loading…</p></section>';
        root.innerHTML = html;
        return;
      }
      var pickTeam = g.pick_team;
      if (!pickTeam) {
        if (g.pick_mode === "batsman") {
          pickTeam = inn.batting_team;
        } else if (g.pick_mode === "bowler") {
          pickTeam = inn.bowling_team;
        }
      }
      if (!pickTeam && g.followup_pick === "bowler") {
        pickTeam = inn.bowling_team;
      }
      var mine = pickTeam ? mySlot === pickTeam : mySlot === g.turn;
      var choices = g.pick_mode === "batsman" ? MpCore.availableBatsmen(g, inn) : MpCore.availableBowlers(g, inn);
      html = '<section class="match-stage match-stage-wide"><p class="match-kicker">INNINGS ' + g.current_innings + "</p>";
      html += "<h1 class=\"match-title\">Choose <strong>" + (g.pick_mode === "batsman" ? "New Batsman" : "Next Bowler") + "</strong></h1>";
      html += waitBanner(mine);
      if (mine) {
        html += '<div class="opener-grid">';
        choices.forEach(function (c) {
          html +=
            '<button type="button" class="opener-card lineup-submit-card mp-pick-player" data-player="' +
            esc(c) +
            '"><span class="opener-name">' +
            esc(c) +
            '</span><span class="opener-sub">Select</span></button>';
        });
        html += "</div>";
      }
      html += "</section>";
      document.body.classList.add("match-body-play");
      renderScorebar(g, p, pickInfo);
    } else if (g.stage === "gameplay_1" || g.stage === "gameplay_2") {
      var innG = MpCore.getInnings(g, g.current_innings);
      if (!innG) {
        html = '<section class="match-stage"><p class="match-kicker">INNINGS ' + g.current_innings + "</p>";
        html += '<p class="match-detail">Setting up innings…</p></section>';
        document.body.classList.add("match-body-play");
        scoreWrap.innerHTML = "";
        root.innerHTML = html;
        return;
      }
      var pickView = MpCore.ballPickView(g, mySlot, pickInfo);
      var powerplayOn = MpCore.isPowerplayOver(g, innG);

      html = '<section class="match-play-area" id="playArea"><p class="match-kicker">INNINGS ' + g.current_innings;
      if (g.target && g.current_innings === 2) html += " · TARGET " + g.target;
      html += "</p>";
      if (powerplayOn) {
        html += '<div class="powerplay-banner" aria-live="polite"><span class="powerplay-banner-label">POWERPLAY ON</span><strong>Numbers 3-10</strong></div>';
      }
      if (g.last_ball) {
        var lb = g.last_ball;
        var br = "ball-result";
        if (lb.out) br += " ball-result-out";
        else if (lb.runs >= 7 && lb.runs <= 10) br += " ball-result-power";
        else if (lb.runs === 6) br += " ball-result-six";
        else if (lb.runs === 4) br += " ball-result-four";
        html += '<p class="' + br + '">';
        html += "Bat <strong>" + lb.bat + "</strong> · Bowl <strong>" + lb.bowl + "</strong>";
        html += lb.out ? " — <strong>OUT!</strong>" : " — +" + lb.runs + " runs";
        html += "</p>";
      }
      html += '<p class="match-hint">Pick at the same time — result shows as soon as both have chosen</p>';
      html += '<div class="match-countdown-banner" id="matchCountdownBanner" aria-live="polite"></div>';
      html += dualPlayPads(pickView, nameFor(innG.batting_team, p), nameFor(innG.bowling_team, p), innG);
      html += "</section>";
      document.body.classList.add("match-body-play");
      renderScorebar(g, p, pickInfo);
    } else if (g.stage === "abandoned") {
      var ab = g.abandon || {};
      var leaver = nameFor(ab.by, p);
      var winner = nameFor(ab.winner, p);
      html = '<section class="match-stage"><p class="match-kicker">MATCH ENDED</p>';
      if (ab.by === mySlot) {
        html += "<h1 class=\"match-title\">You <strong>left</strong> the match</h1>";
        html += '<p class="match-detail">No stats were recorded.</p>';
      } else {
        html += "<h1 class=\"match-title\">" + esc(leaver) + " <strong>left</strong></h1>";
        html += '<p class="match-detail">Match cancelled — no wins or totals updated.</p>';
      }
      html += '<p class="match-detail">' + esc(winner) + " would have won if scored.</p>";
      html += '<a href="game.php" class="match-choice-btn match-choice-btn-wide" style="display:inline-block;margin-top:24px;text-align:center;text-decoration:none;">BACK TO LOBBY</a></section>';
      document.body.classList.remove("match-body-play");
      scoreWrap.innerHTML = "";
    } else if (g.stage === "finished") {
      saveStatsIfNeeded(g);
      var res = g.result;
      var myRuns = mySlot === "player1" ? res.player1 : res.player2;
      var oppRuns = mySlot === "player1" ? res.player2 : res.player1;
      var oppName = nameFor(mySlot === "player1" ? "player2" : "player1", p);
      html = '<section class="match-stage match-stage-wide"><p class="match-kicker">FULL TIME</p>';
      if (res.gave_up) {
        var giver = nameFor(res.gave_up, p);
        if (res.timeout) {
          if (res.gave_up === mySlot) {
            html += "<h1 class=\"match-title\">You <strong>ran out of time</strong></h1>";
            html += '<p class="match-detail">You failed to make your choice in time.</p>';
          } else {
            html += "<h1 class=\"match-title\"><strong>Time out</strong></h1>";
            html += '<p class="match-detail">' + esc(giver) + " has failed to make their choice.</p>";
          }
        } else if (res.gave_up === mySlot) {
          html += "<h1 class=\"match-title\">You <strong>gave up</strong></h1>";
          html += '<p class="match-detail">' + esc(nameFor(res.winner, p)) + " wins.</p>";
        } else {
          html += "<h1 class=\"match-title\">" + esc(giver) + " <strong>gave up</strong></h1>";
          html += '<p class="match-detail">You win!</p>';
        }
      } else if (res.winner === "tie") {
        html += "<h1 class=\"match-title\">Match <strong>Tied</strong></h1>";
      } else if (res.winner === mySlot) {
        html += "<h1 class=\"match-title\">You <strong>Won!</strong></h1>";
      } else {
        html += "<h1 class=\"match-title\">You <strong>Lost</strong></h1>";
        html += '<p class="match-detail">' + esc(nameFor(res.winner, p)) + " won the match.</p>";
      }
      html +=
        '<p class="match-detail">You <strong>' +
        myRuns +
        "</strong> · " +
        esc(oppName) +
        " <strong>" +
        oppRuns +
        "</strong></p>";
      html += renderFullScorecard(g, p);
      html +=
        '<a href="game.php" class="match-choice-btn match-choice-btn-wide" style="display:inline-block;margin-top:24px;text-align:center;text-decoration:none;">BACK TO LOBBY</a></section>';

    }

    root.innerHTML = html;
    wireHandlers(g, p);
    syncCountdownBanner(g);
  }

  function wireHandlers(g, players) {
    bindChoices(".mp-toss-call", function (val) {
      commit(function (game) {
        game.toss.call = val;
        game.stage = "toss_2";
        game.turn = null;
        return game;
      });
    });

    bindNums(".mp-toss-num-p1", function (num) {
      if (mySlot !== "player1") return;
      commit(function (game) {
        if (game.toss.num_p1 != null) return game;
        game.toss.num_p1 = num;
        if (game.toss.num_p2 != null) return MpCore.applyTossNumbers(game);
        return game;
      });
    });

    bindNums(".mp-toss-num-p2", function (num) {
      if (mySlot !== "player2") return;
      commit(function (game) {
        if (game.toss.num_p2 != null) return game;
        game.toss.num_p2 = num;
        if (game.toss.num_p1 != null) return MpCore.applyTossNumbers(game);
        return game;
      });
    });

    bindChoices(".mp-toss-role", function (val) {
      commit(function (game) {
        if (game.stage !== "toss_3" || game.turn !== mySlot) return game;
        return MpCore.applyTossRole(game, val);
      });
    });

    var start2 = document.getElementById("mpStartInn2");
    if (start2) {
      start2.addEventListener("click", function () {
        commit(function (game) {
          return MpCore.startSecondInnings(game);
        });
      });
      var timerEl = document.getElementById("mpInningsBreakTimer");
      if (timerEl) {
        var secondsLeft = 30;
        var interval = setInterval(function () {
          secondsLeft--;
          var liveTimer = document.getElementById("mpInningsBreakTimer");
          if (liveTimer) liveTimer.textContent = String(secondsLeft);
          if (secondsLeft <= 0) {
            clearInterval(interval);
            var liveBtn = document.getElementById("mpStartInn2");
            if (liveBtn && !liveBtn.disabled) {
              liveBtn.disabled = true;
              commit(function (game) {
                return MpCore.startSecondInnings(game);
              });
            }
          }
        }, 1000);
      }
    }

    var openerNext = document.getElementById("mpOpenersNext");
    if (openerNext) {
      var grid = document.getElementById("mpOpenerGrid");
      var checks = root.querySelectorAll(".opener-check");
      function updateOpenersBtn() {
        var n = 0;
        checks.forEach(function (c) {
          var card = c.closest(".opener-card");
          if (c.checked) {
            n++;
            if (card) card.classList.add("is-selected");
          } else if (card) {
            card.classList.remove("is-selected");
          }
        });
        openerNext.disabled = n !== 2;
      }
      if (grid) {
        grid.addEventListener("change", function (e) {
          if (e.target.classList.contains("opener-check")) {
            var ch = grid.querySelectorAll(".opener-check:checked");
            if (ch.length > 2) e.target.checked = false;
            updateOpenersBtn();
          }
        });
        updateOpenersBtn();
      }
      openerNext.addEventListener("click", function () {
        var picked = [];
        checks.forEach(function (c) {
          if (c.checked) picked.push(c.value);
        });
        if (picked.length !== 2) return;
        commit(function (game) {
          return MpCore.applyOpenersPick(game, picked);
        });
      });
    }

    root.querySelectorAll(".mp-striker-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var striker = card.getAttribute("data-player");
        var openers = (roomSnap && roomSnap.game && roomSnap.game.lineup && roomSnap.game.lineup.openers) || [];
        var nonStriker = openers.find(function (x) {
          return x !== striker;
        });
        if (!nonStriker) return;
        commit(function (game) {
          return MpCore.applyStrikerPick(game, striker, nonStriker);
        });
      });
    });

    root.querySelectorAll(".mp-bowler-pick").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var bowler = btn.getAttribute("data-player");
        commit(function (game) {
          return MpCore.applyBowlerPick(game, bowler);
        });
      });
    });

    root.querySelectorAll(".mp-pick-player").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pl = btn.getAttribute("data-player");
        commit(function (game) {
          return MpCore.applyLineupPick(game, pl);
        });
      });
    });

    bindNums(".mp-play-bat", function (num) {
      if (busy) return;
      busy = true;
      root.querySelectorAll(".mp-play-bat").forEach(function (btn) {
        btn.disabled = true;
        btn.classList.add("num-btn-disabled");
        btn.classList.remove("num-btn-active");
      });
      MpFirebase.submitBallPick(roomId, mySlot, "bat", num)
        .catch(function (err) {
          showErr(err.message || "Pick failed");
        })
        .finally(function () {
          busy = false;
        });
    });

    bindNums(".mp-play-bowl", function (num) {
      if (busy) return;
      busy = true;
      root.querySelectorAll(".mp-play-bowl").forEach(function (btn) {
        btn.disabled = true;
        btn.classList.add("num-btn-disabled");
        btn.classList.remove("num-btn-active");
      });
      MpFirebase.submitBallPick(roomId, mySlot, "bowl", num)
        .catch(function (err) {
          showErr(err.message || "Pick failed");
        })
        .finally(function () {
          busy = false;
        });
    });
  }

  function doGiveUp() {
    showGiveUpConfirm();
  }

  function buildFxSignature(game, pickInfo) {
    var innNum = game.current_innings || 1;
    var ballCount = 0;
    var fx = null;
    var inn = null;

    if (game && game.innings && game.innings[String(innNum)]) {
      inn = game.innings[String(innNum)];
    }

    if (game && game.last_ball) {
      fx = game.last_ball.out ? "out" : game.last_ball.runs >= 7 && game.last_ball.runs <= 10 ? "run" + game.last_ball.runs : game.last_ball.runs === 6 ? "six" : game.last_ball.runs === 4 ? "four" : null;
    if (game.stage !== "gameplay_1" && game.stage !== "gameplay_2" && game.stage !== "lineup_pick") {
      return { delay: false };
    }

    var signature = buildFxSignature(game, pickInfo);
    if (!signature) return { delay: false };

    var fx = signature.split(":").pop();
    showFx(fx, signature);

    return {
      delay: game.stage === "lineup_pick",
      signature: signature,
    };
  }

  function renderInningsScorecardHtml(g, players, innNum) {
    var inn = MpCore.getInnings(g, innNum);
    if (!inn) return "";
    var batName = nameFor(inn.batting_team, players);
    var bowlName = nameFor(inn.bowling_team, players);
    var html = '<div class="scorecard-innings">';
    html += "<h3>Innings " + innNum + " — " + esc(batName) + "</h3>";
    html +=
      '<p class="scorecard-total scorecard-total-hero">' +
      inn.runs +
      "/" +
      inn.wickets +
      ' <span class="scorecard-overs">(' +
      MpCore.formatOvers(inn) +
      " ov)</span></p>";
    html += '<table class="scorecard-table"><thead><tr><th>Batter</th><th>R</th><th>B</th></tr></thead><tbody>';
    Object.keys(inn.bat_stats || {}).forEach(function (name) {
      var s = inn.bat_stats[name];
      html +=
        "<tr><td>" +
        esc(name) +
        (s.out ? " (out)" : "") +
        "</td><td>" +
        s.runs +
        "</td><td>" +
        s.balls +
        "</td></tr>";
    });
    html += "</tbody></table>";
    html += '<table class="scorecard-table"><thead><tr><th>Bowler</th><th>W</th><th>R</th><th>B</th></tr></thead><tbody>';
    Object.keys(inn.bowl_stats || {}).forEach(function (name) {
      var s = inn.bowl_stats[name];
      if (s.balls > 0) {
        html +=
          "<tr><td>" +
          esc(name) +
          "</td><td>" +
          s.wickets +
          "</td><td>" +
          s.runs +
          "</td><td>" +
          s.balls +
          "</td></tr>";
      }
    });
    html += "</tbody></table>";
    html += '<p class="scorecard-vs">vs ' + esc(bowlName) + " bowling</p></div>";
    return html;
  }

  function renderFullScorecard(g, players) {
    var html = '<div class="scorecard"><h2 class="scorecard-heading">Scorecard</h2>';
    html += renderInningsScorecardHtml(g, players, 1);
    html += renderInningsScorecardHtml(g, players, 2);
    html += "</div>";
    return html;
  }

  function opponentSlot() {
    return mySlot === "player1" ? "player2" : "player1";
  }

  function isGameplayStage(game) {
    return game && (game.stage === "gameplay_1" || game.stage === "gameplay_2");
  }

  function handleOpponentDisconnect(room) {
    if (!room || !room.players) return;
    var other = opponentSlot();
    var players = room.players;
    if (!players[other] || players[other].online !== false) return;
    if (!room.game || ["abandoned", "finished"].indexOf(room.game.stage) !== -1) return;
    if (room.game.abandon && room.game.abandon.by === other) return;

    if (isGameplayStage(room.game) && room.game.ball_deadline) {
      showErr(nameFor(other, room.players) + " disconnected — waiting for cooldown timeout.");
    } else {
      showErr(nameFor(other, room.players) + " disconnected — waiting for them to return.");
    }
  }

  function onRoom(room) {
    handleOpponentDisconnect(room);
    maybeTriggerCooldownTimeout(room);
    if (room && room.game) {
      if (room.game.stage === "abandoned" && room.game.abandon && room.game.abandon.by !== mySlot) {
        showErr(nameFor(room.game.abandon.by, room.players) + " left the match");
      }

      var fxState = maybeShowBallFx(room.game, room.pickInfo);
      if (fxState && fxState.delay) {
        deferredRenderRoom = room;
        if (deferredRenderTimer) {
          clearTimeout(deferredRenderTimer);
        }
        deferredRenderTimer = setTimeout(function () {
          deferredRenderTimer = null;
          if (deferredRenderRoom) {
            render(deferredRenderRoom);
            deferredRenderRoom = null;
          }
        }, FX_ANIMATION_MS);
        return;
      }
    }
    if (deferredRenderTimer) {
      clearTimeout(deferredRenderTimer);
      deferredRenderTimer = null;
    }
    deferredRenderRoom = null;
    render(room);
  }

  window.addEventListener("beforeunload", confirmBeforeLeave);
  window.addEventListener("popstate", function () {
    if (leaveConfirmEnabled) {
      showNotice("Use the Give Up button to leave safely.");
      history.pushState(null, "", window.location.href);
    }
  });

  if (!MpFirebase.init()) {
    root.innerHTML =
      '<section class="match-stage"><p class="match-detail">Firebase not configured. Edit assets/JS/firebase_config.js</p></section>';
    return;
  }

  history.pushState(null, "", window.location.href);

  var giveUpBtn = document.getElementById("mpGiveUpBtn");
  if (giveUpBtn) {
    giveUpBtn.addEventListener("click", doGiveUp);
  }
  var giveUpMobile = document.getElementById("mpGiveUpMobile");
  if (giveUpMobile) {
    giveUpMobile.addEventListener("click", function (e) {
      e.preventDefault();
      doGiveUp();
    });
  }

  MpFirebase.setPlayerOnline(roomId, mySlot, true);
  try {
    MpFirebase.registerDisconnect(roomId, mySlot);
  } catch (err) {
    console.warn("Failed to register disconnect handler", err);
  }

  MpFirebase.listenRoom(roomId, mySlot, onRoom);
})();
