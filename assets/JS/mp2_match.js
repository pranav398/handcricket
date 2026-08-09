/**
 * 2 vs 2 match UI.
 */
(function () {
  "use strict";

  var boot = window.MP2_BOOT;
  if (!boot) return;
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
  var FX_ANIMATION_MS = 1400;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function nameFor(slot, players) {
    return players && players[slot] ? players[slot].username || slot : slot;
  }

  function teamLabel(team) {
    // UI should not show Team A/Team B nomenclature.
    return team;
  }


  function slotLabel(slot, isSlotWise) {
    if (!isSlotWise) return slot;
    if (slot === "player1") return "Team A - Player 1 (Captain)";
    if (slot === "player2") return "Team A - Player 2";
    if (slot === "player3") return "Team B - Player 1 (Captain)";
    if (slot === "player4") return "Team B - Player 2";
    return slot;
  }

  function myTeam(game) {
    return Mp2Core.teamForSlot(game, mySlot);
  }

  function commit(mutator) {
    if (busy) return Promise.resolve();
    busy = true;
    try { console.log("commit: starting mutation"); } catch (e) {}
    var p = Mp2Firebase.commitGame(roomId, mutator)
      .catch(function (err) { showErr(err.message || "Update failed"); try { console.error("commit error:", err); } catch (e) {} })
      .finally(function () {
        busy = false;
        try { console.log("commit: finished"); } catch (e) {}
      });
    // Safety: clear busy if commit hangs for too long
    setTimeout(function () {
      if (busy) {
        busy = false;
        try { console.warn("commit: cleared stuck busy flag after timeout"); } catch (e) {}
      }
    }, 10000);
    return p;
  }

  function showErr(msg) {
    var el = document.getElementById("mpErr");
    if (!el) {
      el = document.createElement("p");
      el.id = "mpErr";
      el.className = "match-detail";
      el.style.color = "#f87171";
      el.style.textAlign = "center";
      root.insertBefore(el, root.firstChild);
    }
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(function () { el.style.display = "none"; }, 4000);
  }

  var lastGiveUpApprovalPrompt = null;

  function setGiveUpVisible(show) {
    ["mpGiveUpBtn", "mpGiveUpMobile"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.style.display = show ? "" : "none";
    });
  }

  function hasGiveUpApprovalPending(game) {
    var team = myTeam(game);
    if (!team || !game.give_up_requests || !game.teams) return false;
    var other = Mp2Core.otherSlotInTeam(game, mySlot);
    if (!other) return false;
    var requests = game.give_up_requests[team] || {};
    return !!requests[other] && !requests[mySlot];
  }

  function didSendGiveUpRequest(game) {
    var team = myTeam(game);
    if (!team || !game.give_up_requests) return false;
    return !!(game.give_up_requests[team] && game.give_up_requests[team][mySlot]);
  }

  function maybePromptTeamGiveUpApproval(game) {
    if (!hasGiveUpApprovalPending(game)) return;
    var other = Mp2Core.otherSlotInTeam(game, mySlot);
    if (!other) return;
    var signature = (game.stage || "") + ":" + other;
    if (lastGiveUpApprovalPrompt === signature) return;
    var existingOverlay = document.getElementById("mp2GiveUpApprovalOverlay");
    if (existingOverlay) return;
    showTeamGiveUpApprovalOverlay(game);
  }

  function isRoomCreator(room) {
    return room && room.meta && room.meta.creator && room.meta.creator.userId === boot.userId;
  }

  function renderGiveUpStatus(game, players) {
    var team = myTeam(game);
    if (!team || !game.teams) return "";
    var other = Mp2Core.otherSlotInTeam(game, mySlot);
    if (!other) return "";
    var requests = (game.give_up_requests && game.give_up_requests[team]) || {};
    var declined = (game.give_up_declined && game.give_up_declined[team]) || null;
    if (declined && declined === other && requests[mySlot] && !requests[other]) {
      return '<p class="match-detail">Your teammate has decided to hang on in the game.</p>';
    }
    if (requests[other] && !requests[mySlot]) {
      return '<p class="match-detail">Your teammate asked to give up. Use the Give Up button to respond.</p>';
    }
    if (requests[mySlot] && !requests[other]) {
      return '<p class="match-detail">Give-up request sent. Waiting for ' + esc(nameFor(other, players)) + '.</p>';
    }
    return "";
  }

  function doGiveUpRequest() {
    commit(function (game) {
      return Mp2Core.requestGiveUp(game, mySlot);
    });
  }

  function maybeEnforceBallTimeout(room) {
    if (!room || !room.game) return;
    var g = room.game;
    if (g.stage !== "gameplay_1" && g.stage !== "gameplay_2") return;
    if (!g.ball_deadline) return;
    if (Date.now() <= Number(g.ball_deadline) + 1000) return;
    Mp2Firebase.enforceBallTimeout(roomId).catch(function () {});
  }

  function waitBanner(on, text) {
    return on ? "" : '<p class="match-hint mp-wait-banner">' + esc(text || "Waiting...") + "</p>";
  }

  function playerGrid(players) {
    var html = '<div class="opener-grid">';
    Mp2Core.SLOTS.forEach(function (slot) {
      var p = players && players[slot];
      html += '<div class="opener-card"><span class="opener-name">' + esc(p ? p.username : "Open slot") + '</span><span class="opener-sub">' + slot + "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function teamsHtml(game, players) {
    if (!game.teams) return "";
    var method = "Manual";
    if (game.team_assignment_method === "random") method = "Randomized";
    else if (game.team_assignment_method === "slot") method = "Slot-wise";
    var html = '<p class="match-detail">Teams created by <strong>' + method + "</strong> allocation.</p>";
    html += '<div class="play-pads">';
    Mp2Core.TEAMS.forEach(function (team) {
      html += '<div class="toss-pad-col"><div class="toss-player-tag">' + teamLabel(team) + "</div>";
      (game.teams[team] || []).forEach(function (slot) {
        html += '<p class="match-detail">' + esc(nameFor(slot, players)) + (game.captains && game.captains[team] === slot ? " (Captain)" : "") + "</p>";
      });
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function renderLobby(g, p) {
    var isSlotWise = g.team_assignment_method === "slot";
    var count = Object.keys(p || {}).length;
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">2 VS 2 ROOM</p>';
    html += '<h1 class="match-title">Room <strong>' + esc(roomId) + "</strong></h1>";
    html += '<p class="match-detail">' + count + "/4 players joined</p>";
    
    html += '<div class="opener-grid">';
    Mp2Core.SLOTS.forEach(function (slot) {
      var pObj = p && p[slot];
      var name = pObj ? pObj.username : "Waiting...";
      var sub = slotLabel(slot, isSlotWise);
      var cardClass = pObj ? "opener-card" : "opener-card is-empty-slot";
      var styleAttr = pObj ? "" : "opacity: 0.6; border-style: dashed;";
      html += '<div class="' + cardClass + '" style="' + styleAttr + '"><span class="opener-name">' + esc(name) + '</span><span class="opener-sub">' + esc(sub) + "</span></div>";
    });
    html += "</div>";
    
    if (isSlotWise) {
      html += '<p class="match-hint">Toss will start automatically once all 4 slots are filled.</p>';
    } else {
      html += '<p class="match-hint">Teams can be created after all four players join.</p>';
    }
    if (isRoomCreator(roomSnap) && g.stage === "lobby" && (!roomSnap.meta || roomSnap.meta.status !== "terminated")) {
      html += '<button type="button" id="mp2TerminateRoom" class="match-choice-btn match-choice-btn-outline match-choice-btn-wide" style="margin-top:18px;">Terminate Room</button>';
    }
    html += '</section>';
    scoreWrap.innerHTML = "";
    return html;
  }

  function renderTeamSetup(g, p) {
    var mine = mySlot === "player1";
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">TEAM SETUP</p>';
    html += '<h1 class="match-title">Create <strong>Teams</strong></h1>';
    html += '<p class="match-detail">Host can assign teams manually or randomize them. Everyone will see which method was used.</p>';
    html += waitBanner(mine, "Waiting for host to create teams.");
    if (mine) {
      html += '<div class="opener-grid" id="teamAssignGrid">';
      Mp2Core.SLOTS.forEach(function (slot, i) {
        html += '<label class="opener-card"><span class="opener-name">' + esc(nameFor(slot, p)) + '</span><select class="game-input mp2-team-select" data-slot="' + slot + '">';
        html += '<option value="teamX"' + (i < 2 ? " selected" : "") + '>Team X</option><option value="teamY"' + (i >= 2 ? " selected" : "") + ">Team Y</option></select></label>";
      });
      html += "</div>";
      html += '<button type="button" class="match-choice-btn match-choice-btn-wide" id="mp2ManualTeams">SAVE MANUAL TEAMS</button>';
      html += '<button type="button" class="match-choice-btn match-choice-btn-outline match-choice-btn-wide" id="mp2RandomTeams" style="margin-top:12px;">RANDOMIZE</button>';
    }
    html += "</section>";
    scoreWrap.innerHTML = "";
    return html;
  }

  function renderToss(g, p) {
    var capX = g.captains.teamX;
    var capY = g.captains.teamY;
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">CAPTAIN TOSS</p>';
    html += teamsHtml(g, p);
    var toss = g.toss || {};
    var nums = toss.nums || {};
    if (g.stage === "toss_1") {
      var callerCap = g.captains[g.toss.caller_team];
      var mine = mySlot === callerCap;
      html += '<h1 class="match-title">Captain ' + esc(nameFor(callerCap, p)) + ' is calling the toss</h1>' + waitBanner(mine, "Captains are doing the toss.");
      html += '<p class="match-detail">Team ' + teamLabel(g.toss.caller_team) + ' captain is making the call.</p>';
      if (mine) html += '<div class="match-choice-row"><button class="match-choice-btn mp2-toss-call" data-val="odd">ODD</button><button class="match-choice-btn mp2-toss-call" data-val="even">EVEN</button></div>';
    } else if (g.stage === "toss_2") {
      html += '<h1 class="match-title">Captains <strong>Pick</strong></h1>';
      html += numGrid(mySlot === capX && nums.teamX == null, "mp2-toss-num-x");
      html += numGrid(mySlot === capY && nums.teamY == null, "mp2-toss-num-y");
    } else {
      var mineWin = mySlot === g.captains[toss.winner_team];
      html += '<h1 class="match-title">' + teamLabel(toss.winner_team) + ' <strong>won</strong></h1>' + waitBanner(mineWin, "Winning captain is choosing.");
      if (mineWin) html += '<div class="match-choice-row"><button class="match-choice-btn mp2-toss-role" data-val="bat">BAT</button><button class="match-choice-btn match-choice-btn-outline mp2-toss-role" data-val="bowl">BOWL</button></div>';
    }
    html += "</section>";
    scoreWrap.innerHTML = "";
    return html;
  }

  function numGrid(active, cls, minNum, maxNum) {
    minNum = minNum == null ? 0 : minNum;
    maxNum = maxNum == null ? 6 : maxNum;
    var html = '<div class="number-grid">';
    for (var n = minNum; n <= maxNum; n++) {
      html += active ? '<button type="button" class="num-btn num-btn-active ' + cls + '" data-num="' + n + '">' + n + "</button>" : '<button type="button" class="num-btn num-btn-disabled" disabled>' + n + "</button>";
    }
    return html + "</div>";
  }

  function renderInningsSetup(g, p) {
    var lu = g.lineup;
    var players = Mp2Core.makeTeamPlayers(g.team_size);
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">INNINGS ' + lu.inning + "</p>";
    html += '<h1 class="match-title">' + teamLabel(lu.batting_team) + ' <strong>Setup</strong></h1>';
    html += teamsHtml(g, p);
    if (lu.phase === "openers") {
      var picked = lu.opener_picks || {};
      if ((g.teams[lu.batting_team] || []).indexOf(mySlot) !== -1 && !picked[mySlot]) {
        html += '<p class="match-detail">Select your opening batsman for your team.</p><div class="opener-grid">';
        players.forEach(function (pl) {
          var used = Object.keys(picked).some(function (s) { return picked[s] === pl; });
          if (!used) html += '<button type="button" class="opener-card mp2-opener" data-player="' + esc(pl) + '"><span class="opener-name">' + esc(pl) + '</span><span class="opener-sub">Your opener</span></button>';
        });
        html += "</div>";
      } else {
        html += '<p class="match-detail">Waiting for batting teammates to choose their openers.</p>';
      }
    } else if (lu.phase === "striker") {
      var mineCap = mySlot === g.captains[lu.batting_team];
      html += waitBanner(mineCap, "Captain is selecting the striker.");
      if (mineCap) {
        html += '<div class="opener-grid">';
        Object.keys(lu.opener_picks).forEach(function (slot) {
          var pl = lu.opener_picks[slot];
          html += '<button type="button" class="opener-card mp2-striker" data-player="' + esc(pl) + '"><span class="opener-name">' + esc(pl) + '</span><span class="opener-sub">' + esc(nameFor(slot, p)) + "</span></button>";
        });
        html += "</div>";
      }
    } else if (lu.phase === "opening_bowling_slot") {
      var mineBowlCap = mySlot === g.captains[lu.bowling_team];
      html += waitBanner(mineBowlCap, "Bowling captain is selecting which teammate will bowl the first over.");
      if (mineBowlCap) {
        html += '<div class="opener-grid">';
        g.teams[lu.bowling_team].forEach(function (slot) {
          html += '<button type="button" class="opener-card mp2-opening-bowling-slot" data-slot="' + slot + '"><span class="opener-name">' + esc(nameFor(slot, p)) + '</span><span class="opener-sub">Bowl first over</span></button>';
        });
        html += "</div>";
      }
    } else if (lu.phase === "opening_bowler") {
      var bowlingCaptain = g.captains[lu.bowling_team];
      var isCaptain = mySlot === bowlingCaptain;
      var isTeammate = mySlot === lu.opening_bowling_slot;
      // Show appropriate banners based on role
      if (isCaptain) {
        html += waitBanner(true, "Bowling captain is choosing first over.");
      } else if (isTeammate) {
        html += waitBanner(true, "Selected teammate is choosing bowler.");
      } else {
        // Others see generic waiting banner
        html += waitBanner(false, "Bowling captain is choosing first over.");
      }
      html += renderGiveUpStatus(g, p);
      if (isTeammate) {
        html += playerPickGrid(players, "mp2-opening-bowler", "Select bowler");
      }
    }
    html += "</section>";
    scoreWrap.innerHTML = "";
    return html;
  }

  function playerPickGrid(players, cls, sub) {
    var html = '<div class="opener-grid">';
    players.forEach(function (pl) {
      html += '<button type="button" class="opener-card ' + cls + '" data-player="' + esc(pl) + '"><span class="opener-name">' + esc(pl) + '</span><span class="opener-sub">' + esc(sub) + "</span></button>";
    });
    return html + "</div>";
  }

  function renderLineupPick(g, p) {
    var inn = Mp2Core.getInnings(g, g.current_innings);
    var mine = mySlot === g.turn;
    var choices = [];
    if (inn) choices = g.pick_mode === "batsman" ? Mp2Core.availableBatsmen(g, inn, mySlot) : Mp2Core.availableBowlers(g, inn);
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">INNINGS ' + g.current_innings + "</p>";
    html += '<h1 class="match-title">Choose <strong>' + (g.pick_mode === "batsman" ? "New Batsman" : "Next Bowler") + "</strong></h1>";
    html += waitBanner(mine, "Waiting for " + esc(nameFor(g.turn, p)) + ".");
    html += renderGiveUpStatus(g, p);
    if (mine) html += playerPickGrid(choices, "mp2-lineup-pick", "Select");
    html += "</section>";
    renderScorebar(g, p);
    return html;
  }

  function renderGameplay(g, p) {
    var inn = Mp2Core.getInnings(g, g.current_innings);
    if (!inn) return '<section class="match-stage"><p class="match-detail">Loading innings...</p></section>';
    var range = Mp2Core.allowedNumberRange(g, inn);
    var batSlot = Mp2Core.activeBattingSlot(inn);
    var bowlSlot = Mp2Core.activeBowlingSlot(inn);
    
    var picks = g.ball_picks || {};
    var hasBatPick = picks[batSlot] != null;
    var hasBowlPick = picks[bowlSlot] != null;
    var myTm = myTeam(g);
    var batTm = Mp2Core.teamForSlot(g, batSlot);
    var bowlTm = Mp2Core.teamForSlot(g, bowlSlot);

    var batStatus = "";
    if (mySlot === batSlot) {
      batStatus = hasBatPick ? "You picked <strong>" + picks[batSlot] + "</strong>" : "Pick your number";
    } else if (myTm === batTm) {
      batStatus = hasBatPick ? "Teammate ready" : "Teammate picking...";
    } else {
      batStatus = hasBatPick ? "Opponent ready" : "Opponent picking...";
    }

    var bowlStatus = "";
    if (mySlot === bowlSlot) {
      bowlStatus = hasBowlPick ? "You picked <strong>" + picks[bowlSlot] + "</strong>" : "Pick your number";
    } else if (myTm === bowlTm) {
      bowlStatus = hasBowlPick ? "Teammate ready" : "Teammate picking...";
    } else {
      bowlStatus = hasBowlPick ? "Opponent ready" : "Opponent picking...";
    }

    var canBat = (mySlot === batSlot) && !hasBatPick;
    var canBowl = (mySlot === bowlSlot) && !hasBowlPick;

    var html = '<section class="match-play-area"><p class="match-kicker">INNINGS ' + g.current_innings + (g.target && g.current_innings === 2 ? " - TARGET " + g.target : "") + "</p>";
    if (Mp2Core.isPowerplayOver(g, inn)) html += '<div class="powerplay-banner"><span class="powerplay-banner-label">POWERPLAY ON</span><strong>Numbers 3-10</strong></div>';
    if (g.last_ball) html += '<p class="ball-result">Bat <strong>' + g.last_ball.bat + '</strong> · Bowl <strong>' + g.last_ball.bowl + '</strong>' + (g.last_ball.out ? ' - <strong>OUT!</strong>' : " - +" + g.last_ball.runs + " runs") + "</p>";
    html += renderGiveUpStatus(g, p);
    html += '<p class="match-hint">Pick at the same time — result shows as soon as both have chosen</p>';
    html += '<div class="match-countdown-banner" id="matchCountdownBanner" aria-live="polite"></div>';
    html += '<div class="play-pads"><div class="toss-pad-col' + (mySlot === batSlot && !hasBatPick ? "" : " toss-pad-col-disabled") + '"><p class="play-pad-label">Batting · ' + esc(nameFor(batSlot, p)) + "</p><p class=\"play-pad-picked\">" + batStatus + "</p>" + numGrid(canBat, "mp2-play-bat", range.min, range.max) + "</div>";
    html += '<div class="toss-pad-col' + (mySlot === bowlSlot && !hasBowlPick ? "" : " toss-pad-col-disabled") + '"><p class="play-pad-label">Bowling · ' + esc(nameFor(bowlSlot, p)) + "</p><p class=\"play-pad-picked\">" + bowlStatus + "</p>" + numGrid(canBowl, "mp2-play-bowl", range.min, range.max) + "</div></div></section>";
    renderScorebar(g, p);
    return html;
  }

  function currentOverSummary(inn) {
    var log = inn.ball_log || [];
    var take = inn.balls_in_over > 0 ? inn.balls_in_over : Math.min(6, log.length);
    var balls = take > 0 ? log.slice(-take) : [];
    var summary = { items: [], runs: 0 };
    balls.forEach(function (ball) {
      summary.runs += parseInt(ball.runs, 10) || 0;
      summary.items.push(ball.out ? "W" : String(ball.runs));
    });
    return summary;
  }

  function renderOverSummary(summary) {
    var html = '<div class="scorebar-over"><span class="scorebar-over-label">This over</span><div class="scorebar-over-balls">';
    if (summary.items.length) summary.items.forEach(function (it) { html += '<span class="scorebar-ball' + (it === "W" ? " scorebar-ball-wicket" : "") + '">' + esc(it) + "</span>"; });
    else html += '<span class="scorebar-ball scorebar-ball-empty">-</span>';
    return html + '</div><strong class="scorebar-over-runs">Over: ' + summary.runs + "</strong></div>";
  }

  function renderScorebar(g, p) {
    var inn = Mp2Core.getInnings(g, g.current_innings);
    if (!inn) { scoreWrap.innerHTML = ""; return; }
    var bs = inn.bat_stats, bl = inn.bowl_stats;
    var html = '<div class="scorebar"><div class="scorebar-bats"><span class="scorebar-side-label">' + teamLabel(inn.batting_team) + "</span>";
    html += '<div class="scorebar-bat on-strike"><em>*</em><span class="scorebar-bat-name">' + esc(inn.striker) + '</span><span class="scorebar-bat-fig"><strong>' + bs[inn.striker].runs + "</strong> (" + bs[inn.striker].balls + ")</span></div>";
    html += '<div class="scorebar-bat"><span class="scorebar-bat-name">' + esc(inn.non_striker) + '</span><span class="scorebar-bat-fig"><strong>' + bs[inn.non_striker].runs + "</strong> (" + bs[inn.non_striker].balls + ")</span></div></div>";
    html += '<div class="scorebar-center"><span class="scorebar-score">' + inn.runs + "-" + inn.wickets + '</span><div class="scorebar-center-meta"><span class="scorebar-overs">' + Mp2Core.formatOvers(inn) + " ov</span>" + (g.current_innings === 2 && g.target ? '<span class="scorebar-target">T ' + g.target + "</span>" : "") + "</div></div>";
    html += '<div class="scorebar-bowl"><span class="scorebar-side-label">' + teamLabel(inn.bowling_team) + '</span><div class="scorebar-bowler"><span class="scorebar-bowler-name">' + esc(inn.bowler) + '</span><span class="scorebar-bowler-fig"><strong>' + bl[inn.bowler].wickets + "</strong>-" + bl[inn.bowler].runs + "-" + bl[inn.bowler].balls + "</span></div></div>";
    html += renderOverSummary(currentOverSummary(inn));
    if (g.current_innings === 2 && g.target) html += '<p class="scorebar-chase">' + Math.max(0, g.target - inn.runs) + " runs in " + Math.max(0, g.overs * 6 - Mp2Core.inningsTotalBalls(inn)) + " balls</p>";
    html += '<p class="scorebar-hint">Active bat: ' + esc(nameFor(Mp2Core.activeBattingSlot(inn), p)) + " · Active bowl: " + esc(nameFor(Mp2Core.activeBowlingSlot(inn), p)) + "</p></div>";
    scoreWrap.innerHTML = html;
  }

  function saveStatsIfNeeded(g) {
    if (!g.count_stats || statsSaved || !g.result) return;
    statsSaved = true;
    var myTeam = Mp2Core.teamForSlot(g, mySlot);
    var won = myTeam && g.result.winner === myTeam;
    console.log("[saveStats2v2] Attempting to save stats. mySlot:", mySlot, "myTeam:", myTeam, "winner:", g.result.winner, "won:", won);
    fetch("mp_api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", won: won }),
    })
    .then(function (res) {
      console.log("[saveStats2v2] HTTP status:", res.status);
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error("HTTP " + res.status + ": " + text);
        });
      }
      return res.json();
    })
    .then(function (data) {
      console.log("[saveStats2v2] Response data:", data);
      if (!data.ok) {
        throw new Error(data.error || "Unknown API error");
      }
    })
    .catch(function (err) {
      console.error("[saveStats2v2] Error:", err);
      showErr("Failed to save stats: " + err.message);
    });
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

  function buildFxSignature(game) {
    var innNum = game.current_innings || 1;
    var ballCount = 0;
    var fx = null;
    var inn = null;

    if (game && game.innings && game.innings[String(innNum)]) {
      inn = game.innings[String(innNum)];
    }

    if (game && game.last_ball) {
      fx = game.last_ball.out ? "out" : game.last_ball.runs >= 7 && game.last_ball.runs <= 10 ? "run" + game.last_ball.runs : game.last_ball.runs === 6 ? "six" : game.last_ball.runs === 4 ? "four" : null;
      ballCount = inn && inn.ball_log ? Math.max(0, inn.ball_log.length - 1) : 0;
    }

    if (!fx) {
      return null;
    }

    return innNum + ":" + ballCount + ":" + fx;
  }

  function maybeShowBallFx(game) {
    if (!game) return { delay: false };
    if (game.stage !== "gameplay_1" && game.stage !== "gameplay_2" && game.stage !== "lineup_pick") {
      return { delay: false };
    }

    var signature = buildFxSignature(game);
    if (!signature) return { delay: false };

    var fx = signature.split(":").pop();
    showFx(fx, signature);

    return {
      delay: game.stage === "lineup_pick",
      signature: signature,
    };
  }

  function renderInningsScorecardHtml(g, p, innNum) {
    var inn = Mp2Core.getInnings(g, innNum);
    if (!inn) return "";
    var batTeam = inn.batting_team;
    var bowlTeam = inn.bowling_team;
    var bowlPlayers = (g.teams && g.teams[bowlTeam]) || [];
    var html = '<div class="scorecard-innings">';
    html += "<h3>Innings " + innNum + " — " + teamLabel(batTeam) + "</h3>";
    html += '<p class="scorecard-total scorecard-total-hero">' + inn.runs + "/" + inn.wickets + ' <span class="scorecard-overs">(' + Mp2Core.formatOvers(inn) + " ov)</span></p>";
    html += '<table class="scorecard-table"><thead><tr><th>Batter</th><th>R</th><th>B</th></tr></thead><tbody>';
    Object.keys(inn.bat_stats || {}).forEach(function (name) {
      var s = inn.bat_stats[name];
      html += "<tr><td>" + esc(name) + (s.out ? " (out)" : "") + "</td><td>" + s.runs + "</td><td>" + s.balls + "</td></tr>";
    });
    html += "</tbody></table>";
    html += '<table class="scorecard-table"><thead><tr><th>Bowler</th><th>W</th><th>R</th><th>B</th></tr></thead><tbody>';
    Object.keys(inn.bowl_stats || {}).forEach(function (name) {
      var s = inn.bowl_stats[name];
      if (s.balls > 0) {
        html += "<tr><td>" + esc(name) + "</td><td>" + s.wickets + "</td><td>" + s.runs + "</td><td>" + s.balls + "</td></tr>";
      }
    });
    html += "</tbody></table>";
    html += '<p class="scorecard-vs">vs ' + teamLabel(bowlTeam) + " bowling</p></div>";
    return html;
  }

  function renderFullScorecard(g, p) {
    var html = '<div class="scorecard"><h2 class="scorecard-heading">Scorecard</h2>';
    html += renderInningsScorecardHtml(g, p, 1);
    html += renderInningsScorecardHtml(g, p, 2);
    html += "</div>";
    return html;
  }

  function renderFinished(g, p) {
    saveStatsIfNeeded(g);
    var res = g.result || {};
    var myTm = myTeam(g);
    var winnerTeam = res.winner;
    var iWon = myTm && winnerTeam === myTm;
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">FULL TIME</p>';
    if (res.gave_up) {
      if (res.timeout) {
        var giverName = nameFor(res.gave_up, p);
        if (res.gave_up === mySlot) {
          html += "<h1 class=\"match-title\">You <strong>ran out of time</strong></h1>";
          html += '<p class="match-detail">You failed to make your choice in time.</p>';
        } else {
          html += "<h1 class=\"match-title\"><strong>Time out</strong></h1>";
          html += '<p class="match-detail">' + esc(giverName) + " has failed to make their choice.</p>";
        }
      } else {
        var giverName = nameFor(res.gave_up, p);
        if (res.gave_up === mySlot) {
          html += "<h1 class=\"match-title\">You <strong>gave up</strong></h1>";
        } else {
          html += "<h1 class=\"match-title\">" + esc(giverName) + " <strong>gave up</strong></h1>";
        }
      }
    } else if (winnerTeam === "tie") {
      html += "<h1 class=\"match-title\">Match <strong>Tied</strong></h1>";
    } else if (iWon) {
      html += "<h1 class=\"match-title\">You <strong>Won!</strong></h1>";
    } else {
      html += "<h1 class=\"match-title\">You <strong>Lost</strong></h1>";
      html += '<p class="match-detail">' + teamLabel(winnerTeam) + " won the match.</p>";
    }
    html += '<p class="match-detail">' + teamLabel("teamX") + ' <strong>' + (res.teamX || 0) + '</strong> · ' + teamLabel("teamY") + ' <strong>' + (res.teamY || 0) + "</strong></p>";
    html += renderFullScorecard(g, p);
    html += '<a href="exit_mp_match.php" class="match-choice-btn match-choice-btn-wide" style="display:inline-block;margin-top:24px;text-align:center;text-decoration:none;">BACK TO LOBBY</a></section>';
    scoreWrap.innerHTML = "";
    return html;
  }

  function renderAbandoned(g, p) {
    var ab = g.abandon || {};
    var html = '<section class="match-stage match-stage-wide"><p class="match-kicker">MATCH ABANDONED</p>';
    html += '<h1 class="match-title">Game ended early</h1>';
    html += '<p class="match-detail">';
    if (ab.by) {
      html += esc(nameFor(ab.by, p)) + ' disconnected.';
    } else {
      html += 'One or more players left the match.';
    }
    html += '</p>';
    html += '<a href="exit_mp_match.php" class="match-choice-btn match-choice-btn-wide" style="display:inline-block;text-align:center;text-decoration:none;">BACK TO LOBBY</a></section>';
    scoreWrap.innerHTML = "";
    return html;
  }

  function render(room) {
    roomSnap = room;
    if (!room || !room.game) return;
    if (room.meta && room.meta.cleanupAt && Date.now() > room.meta.cleanupAt) {
      Mp2Firebase.roomRef(roomId).remove().catch(function () {});
      return;
    }
    if (room.meta && room.meta.status === "terminated") {
      root.innerHTML = '<section class="match-stage match-stage-wide"><p class="match-kicker">ROOM TERMINATED</p><h1 class="match-title">Room closed</h1><p class="match-detail">This room has been terminated by the creator. You can return to the lobby to create or join a new game.</p><a href="exit_mp_match.php" class="match-choice-btn match-choice-btn-wide">Back to lobby</a></section>';
      scoreWrap.innerHTML = "";
      return;
    }
    var g = room.game, p = room.players || {};
    var html = "";
    document.body.classList.toggle("match-body-play", ["gameplay_1", "gameplay_2", "lineup_pick"].indexOf(g.stage) !== -1);
    if (g.stage === "lobby") html = renderLobby(g, p);
    else if (g.stage === "team_setup") html = renderTeamSetup(g, p);
    else if (["toss_1", "toss_2", "toss_3"].indexOf(g.stage) !== -1) html = renderToss(g, p);
    else if (g.stage === "innings_setup") html = renderInningsSetup(g, p);
    else if (g.stage === "lineup_pick") html = renderLineupPick(g, p);
    else if (g.stage === "gameplay_1" || g.stage === "gameplay_2") html = renderGameplay(g, p);
    else if (g.stage === "innings_break") {
      var nextBatting = g.teams && Mp2Core.teamForInnings(g, 2);
      var canStart = nextBatting && g.teams[nextBatting] && g.teams[nextBatting].indexOf(mySlot) !== -1;
      html = '<section class="match-stage match-stage-wide innings-break-stage"><p class="match-kicker">INNINGS BREAK</p><h1 class="match-title">Target <strong>' + g.target + '</strong></h1>';
      html += '<div class="scorecard scorecard-break"><h2 class="scorecard-heading">Innings 1 Scorecard</h2>';
      html += renderInningsScorecardHtml(g, p, 1);
      html += "</div>";
      html += (canStart ? '<div id="mp2InningsBreakCountdown" style="margin-bottom:12px;font-size:13px;color:var(--slate-warm);">Second innings starting in <strong id="mp2InningsBreakTimer">30</strong>s</div><button type="button" id="mp2StartInn2" class="match-choice-btn match-choice-btn-wide">START SECOND INNINGS</button>' : waitBanner(false, "Batting team will start second innings.")) + "</section>";
    }
    else if (g.stage === "abandoned") html = renderAbandoned(g, p);
    else if (g.stage === "finished") html = renderFinished(g, p);
    root.innerHTML = html;
    maybePromptTeamGiveUpApproval(g);
    setGiveUpVisible(["gameplay_1", "gameplay_2", "innings_setup", "lineup_pick", "innings_break"].indexOf(g.stage) !== -1);
    maybeEnforceBallTimeout(room);
    maybeResolveDisconnect(room);
    maybeScheduleRoomCleanup(g);
    if (g.stage === "gameplay_1" || g.stage === "gameplay_2") startBallTimeoutWatcher(); else stopBallTimeoutWatcher();
    syncCountdownBanner(g);
    wireHandlers(g, p);
  }

  function bind(selector, fn) {
    root.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener("click", function () { fn(el); });
    });
  }

  var roomCleanupTimer = null;
  var ballTimeoutWatcher = null;
  var countdownTicker = null;
  var disconnectTimeout = null;

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
      return;
    }
    var remainingMs = Math.max(0, Number(game.ball_deadline) - Date.now());
    if (remainingMs <= 0) {
      banner.className = "match-countdown-banner is-danger";
      banner.innerHTML = '<span>Ball cooldown</span><strong>0:00</strong>';
      banner.style.display = "flex";
      // No further UI changes
      return;
    }
    var totalSeconds = Math.ceil(remainingMs / 1000);
    var isHurry = totalSeconds <= 5;
    banner.className = "match-countdown-banner" + (totalSeconds <= 10 ? " is-warning" : "");
    banner.innerHTML = '<span>Ball cooldown</span><strong>' + formatCountdown(totalSeconds) + '</strong>';
    // Show HURRY UP only for the person who has not yet picked (no local knowledge yet).
    // We'll approximate using ball_picks and active slots.
    try {
      if (isHurry && roomSnap && roomSnap.game && (roomSnap.game.stage === "gameplay_1" || roomSnap.game.stage === "gameplay_2")) {
        var g = roomSnap.game;
        var inn = Mp2Core.getInnings(g, g.current_innings);
        if (inn) {
          var batSlot = Mp2Core.activeBattingSlot(inn);
          var bowlSlot = Mp2Core.activeBowlingSlot(inn);
          var picks = g.ball_picks || {};
          var myPick = null;
          var myRole = null;
          if (mySlot === batSlot) { myPick = picks[batSlot]; myRole = "bat"; }
          else if (mySlot === bowlSlot) { myPick = picks[bowlSlot]; myRole = "bowl"; }
          var missingMyChoice = (myRole && myPick == null);

          var hurryElId = "mpHurryUp";
          var existing = document.getElementById(hurryElId);
          if (missingMyChoice) {
            if (!existing) {
              existing = document.createElement("div");
              existing.id = hurryElId;
              existing.className = "mp-hurry-up";
              existing.style.position = "fixed";
              existing.style.left = "50%";
              existing.style.top = "18%";
              existing.style.transform = "translateX(-50%)";
              existing.style.zIndex = "9999";
              existing.style.padding = "14px 20px";
              existing.style.background = "rgba(245, 158, 11, 0.95)";
              existing.style.border = "2px solid rgba(255,255,255,0.75)";
              existing.style.borderRadius = "14px";
              existing.style.color = "#111827";
              existing.style.fontWeight = "900";
              existing.style.letterSpacing = "0.08em";
              existing.style.textTransform = "uppercase";
              existing.innerHTML = "<span style=\"font-size:14px;\">Hurry up</span><div style=\"font-size:22px;\">Pick Now!</div>";
              document.body.appendChild(existing);
            }
          } else {
            if (existing) existing.remove();
          }
        }
      }
    } catch (e) {
      // ignore UI hurry overlay errors
    }

    banner.style.display = "flex";
    if (!countdownTicker) {
      countdownTicker = setInterval(function () {
        syncCountdownBanner(roomSnap && roomSnap.game);
      }, 1000);
    }
  }

  function maybeScheduleRoomCleanup(g) {
    if (roomCleanupTimer) return;
    if (g.stage !== "finished" && g.stage !== "abandoned") return;
    roomCleanupTimer = setTimeout(function () {
      Mp2Firebase.roomRef(roomId).remove().catch(function () {});
    }, 120000);
  }

  function maybeResolveDisconnect(room) {
    if (!room || !room.game || !room.players) return;
    var g = room.game;
    if (g.stage === "finished" || g.stage === "abandoned" || g.stage === "lobby") {
      if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
      }
      return;
    }
    var offlineSlots = Object.keys(room.players).filter(function (slot) {
      return room.players[slot] && room.players[slot].online === false;
    });
    if (!offlineSlots.length) {
      if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
        try { console.log("maybeResolveDisconnect: offline players reconnected, clearing timeout"); } catch(e){}
      }
      return;
    }
    if (disconnectTimeout) return;
    try { console.log("maybeResolveDisconnect: player offline detected. Starting 15s grace period timer."); } catch(e){}
    disconnectTimeout = setTimeout(function () {
      disconnectTimeout = null;
      var latestRoom = roomSnap;
      if (!latestRoom || !latestRoom.game || !latestRoom.players) return;
      var latestG = latestRoom.game;
      if (latestG.stage === "finished" || latestG.stage === "abandoned" || latestG.stage === "lobby") return;
      var currentOffline = Object.keys(latestRoom.players).filter(function (slot) {
        return latestRoom.players[slot] && latestRoom.players[slot].online === false;
      });
      if (!currentOffline.length) return;
      var myTeam = Mp2Core.teamForSlot(latestG, mySlot);
      if (!myTeam) return;
      var teamOffline = currentOffline.some(function (slot) { return Mp2Core.teamForSlot(latestG, slot) === myTeam; });
      if (teamOffline) {
        Mp2Firebase.abandonRoom(roomId, mySlot, "disconnect").catch(function () {});
      } else {
        commit(function (game) { return Mp2Core.winByDisconnect(game, mySlot); }).catch(function () {});
      }
    }, 15000);
  }

  function startBallTimeoutWatcher() {
    if (ballTimeoutWatcher) return;
    ballTimeoutWatcher = setInterval(function () {
      maybeEnforceBallTimeout(roomSnap);
    }, 1000);
  }

  function stopBallTimeoutWatcher() {
    if (!ballTimeoutWatcher) return;
    clearInterval(ballTimeoutWatcher);
    ballTimeoutWatcher = null;
  }

  function wireHandlers(g, p) {
    var manual = document.getElementById("mp2ManualTeams");
    if (manual) manual.addEventListener("click", function () {
      var teams = { teamX: [], teamY: [] };
      root.querySelectorAll(".mp2-team-select").forEach(function (sel) { teams[sel.value].push(sel.getAttribute("data-slot")); });
      if (teams.teamX.length !== 2 || teams.teamY.length !== 2) { showErr("Each team must have exactly two players."); return; }
      commit(function (game) { return Mp2Core.setTeams(game, teams, "manual"); });
    });
    var random = document.getElementById("mp2RandomTeams");
    if (random) random.addEventListener("click", function () { commit(Mp2Core.randomizeTeams); });

    bind(".mp2-toss-call", function (el) { commit(function (game) { game.toss.call = el.getAttribute("data-val"); game.stage = "toss_2"; game.turn = null; return game; }); });
    bind(".mp2-toss-num-x", function (el) {
      commit(function (game) {
        if (!game.toss) game.toss = {};
        if (!game.toss.nums) game.toss.nums = {};
        game.toss.nums.teamX = parseInt(el.getAttribute("data-num"), 10);
        return (game.toss.nums.teamY != null) ? Mp2Core.applyTossNumbers(game) : game;
      });
    });
    bind(".mp2-toss-num-y", function (el) {
      commit(function (game) {
        if (!game.toss) game.toss = {};
        if (!game.toss.nums) game.toss.nums = {};
        game.toss.nums.teamY = parseInt(el.getAttribute("data-num"), 10);
        return (game.toss.nums.teamX != null) ? Mp2Core.applyTossNumbers(game) : game;
      });
    });
    bind(".mp2-toss-role", function (el) { commit(function (game) { return Mp2Core.applyTossRole(game, el.getAttribute("data-val")); }); });
    bind(".mp2-opener", function (el) { commit(function (game) { return Mp2Core.applyOpenerPick(game, mySlot, el.getAttribute("data-player")); }); });
    bind(".mp2-striker", function (el) { commit(function (game) { return Mp2Core.applyStrikerPick(game, el.getAttribute("data-player")); }); });
    bind(".mp2-opening-bowling-slot", function (el) { commit(function (game) { return Mp2Core.applyOpeningBowlingSlot(game, el.getAttribute("data-slot")); }); });
    bind(".mp2-opening-bowler", function (el) {
      if (el.dataset && el.dataset.locked === "1") return;
      el.dataset.locked = "1";
      var clickedPlayer = el.getAttribute("data-player");
      commit(function (game) {
        if (!game.lineup || game.lineup.phase !== "opening_bowler") {
          throw new Error("Lineup changed. Try again.");
        }
        var slot = game.lineup.opening_bowling_slot;
        if (!slot) {
          throw new Error("Bowling slot not ready yet. Try again.");
        }
        return Mp2Core.applyOpeningBowler(game, slot, clickedPlayer);
      }).catch(function () {
        // Unlock on error so the user can retry.
        el.dataset.locked = "0";
      });
    });

    bind(".mp2-lineup-pick", function (el) { commit(function (game) { return Mp2Core.applyLineupPick(game, mySlot, el.getAttribute("data-player")); }); });
    bind(".mp2-play-bat", function (el) {
      if (busy) return;
      busy = true;
      root.querySelectorAll(".mp2-play-bat").forEach(function (btn) {
        btn.disabled = true;
        btn.classList.add("num-btn-disabled");
        btn.classList.remove("num-btn-active");
      });
      Mp2Firebase.submitBallPick(roomId, mySlot, "bat", parseInt(el.getAttribute("data-num"), 10))
        .catch(function (err) { showErr(err.message || "Pick failed"); })
        .finally(function () { busy = false; });
    });

    bind(".mp2-play-bowl", function (el) {
      if (busy) return;
      busy = true;
      root.querySelectorAll(".mp2-play-bowl").forEach(function (btn) {
        btn.disabled = true;
        btn.classList.add("num-btn-disabled");
        btn.classList.remove("num-btn-active");
      });
      Mp2Firebase.submitBallPick(roomId, mySlot, "bowl", parseInt(el.getAttribute("data-num"), 10))
        .catch(function (err) { showErr(err.message || "Pick failed"); })
        .finally(function () { busy = false; });
    });
    var start2 = document.getElementById("mp2StartInn2");
    if (start2) {
      start2.addEventListener("click", function () { commit(Mp2Core.startSecondInnings); });
      var timerEl = document.getElementById("mp2InningsBreakTimer");
      if (timerEl) {
        var secondsLeft = 30;
        var interval = setInterval(function () {
          secondsLeft--;
          var liveTimer = document.getElementById("mp2InningsBreakTimer");
          if (liveTimer) liveTimer.textContent = String(secondsLeft);
          if (secondsLeft <= 0) {
            clearInterval(interval);
            var liveBtn = document.getElementById("mp2StartInn2");
            if (liveBtn && !liveBtn.disabled) {
              liveBtn.disabled = true;
              commit(Mp2Core.startSecondInnings);
            }
          }
        }, 1000);
      }
    }
    var terminateBtn = document.getElementById("mp2TerminateRoom");
    if (terminateBtn) {
      terminateBtn.addEventListener("click", function () {
        if (!confirm("Terminate room? This will close the room and remove all players.")) return;
        Mp2Firebase.terminateRoom(roomId, boot.userId).then(function () {
          showErr("Room terminated.");
        }).catch(function (err) {
          showErr(err.message || "Could not terminate room");
        });
      });
    }
  }

  if (!Mp2Firebase.init()) {
    root.innerHTML = '<section class="match-stage"><p class="match-detail">Firebase not configured.</p></section>';
    return;
  }
  Mp2Firebase.setPlayerOnline(roomId, mySlot, true);
  try { Mp2Firebase.registerDisconnect(roomId, mySlot); } catch (err) {}
  function showGiveUpConfirmOverlay() {
    var existing = document.getElementById("mp2GiveUpConfirmOverlay");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "mp2GiveUpConfirmOverlay";
    overlay.className = "mp-confirm-overlay";
    var box = document.createElement("div");
    box.className = "mp-confirm-box";
    var heading = document.createElement("h2");
    heading.textContent = "Give Up";
    box.appendChild(heading);
    var detail = document.createElement("p");
    detail.className = "mp-confirm-detail";
    detail.textContent = "Request to give up? Your teammate must also approve before the match ends.";
    box.appendChild(detail);
    var actions = document.createElement("div");
    actions.className = "mp-confirm-actions";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "mp-confirm-btn mp-confirm-btn-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () { overlay.remove(); });
    var confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "mp-confirm-btn mp-confirm-btn-giveup";
    confirmBtn.textContent = "Request Give Up";
    confirmBtn.addEventListener("click", function () {
      overlay.remove();
      doGiveUpRequest();
    });
    actions.appendChild(cancel);
    actions.appendChild(confirmBtn);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function showTeamGiveUpApprovalOverlay(game) {
    var existing = document.getElementById("mp2GiveUpApprovalOverlay");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "mp2GiveUpApprovalOverlay";
    overlay.className = "mp-confirm-overlay";
    var box = document.createElement("div");
    box.className = "mp-confirm-box";
    box.style.borderColor = "rgba(251,191,36,0.35)";
    var heading = document.createElement("h2");
    heading.textContent = "Teammate Proposes Surrender";
    box.appendChild(heading);
    var detail = document.createElement("p");
    detail.className = "mp-confirm-detail";
    detail.textContent = "Your teammate has proposed giving up the match.";
    box.appendChild(detail);
    var countdownEl = document.createElement("p");
    countdownEl.id = "mp2GiveUpCountdown";
    countdownEl.style.cssText = "text-align:center;font-size:1.2rem;font-weight:700;color:#fde047;margin-bottom:16px;";
    countdownEl.textContent = "10";
    box.appendChild(countdownEl);
    var actions = document.createElement("div");
    actions.className = "mp-confirm-actions";
    var stayBtn = document.createElement("button");
    stayBtn.type = "button";
    stayBtn.className = "mp-confirm-btn";
    stayBtn.style.cssText = "flex:1;padding:14px 18px;border-radius:999px;border:none;font:inherit;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;background:linear-gradient(135deg,var(--silver),var(--slate-light));color:var(--base-deep);";
    stayBtn.textContent = "Stay";
    stayBtn.addEventListener("click", function () {
      overlay.remove();
      commit(function (g) { return Mp2Core.declineGiveUp(g, mySlot); });
    });
    var giveUpBtn = document.createElement("button");
    giveUpBtn.type = "button";
    giveUpBtn.className = "mp-confirm-btn mp-confirm-btn-giveup";
    giveUpBtn.textContent = "Give Up";
    giveUpBtn.addEventListener("click", function () {
      overlay.remove();
      commit(function (g) { return Mp2Core.requestGiveUp(g, mySlot); });
    });
    actions.appendChild(stayBtn);
    actions.appendChild(giveUpBtn);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var secondsLeft = 10;
    countdownEl.textContent = String(secondsLeft);
    var timer = setInterval(function () {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(timer);
        var live = document.getElementById("mp2GiveUpApprovalOverlay");
        if (live) {
          live.remove();
          commit(function (g) { return Mp2Core.declineGiveUp(g, mySlot); });
        }
        return;
      }
      var liveEl = document.getElementById("mp2GiveUpCountdown");
      if (liveEl) liveEl.textContent = String(secondsLeft);
    }, 1000);
    lastGiveUpApprovalPrompt = (game.stage || "") + ":" + (Mp2Core.otherSlotInTeam(game, mySlot) || "");
  }

  ["mpGiveUpBtn", "mpGiveUpMobile"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      showGiveUpConfirmOverlay();
    });
  });
  function clearDeclinedNoticeIfNeeded(room) {
    if (!room || !room.game) return;
    var g = room.game;
    var team = myTeam(g);
    if (!team || !g.give_up_declined || !g.give_up_requests) return;
    var declined = g.give_up_declined[team];
    if (!declined) return;
    var requests = g.give_up_requests[team] || {};
    if (requests[mySlot] && !requests[declined]) {
      commit(function (game) {
        if (game.give_up_declined && game.give_up_declined[team]) {
          delete game.give_up_declined[team];
          if (Object.keys(game.give_up_declined).length === 0) delete game.give_up_declined;
        }
        return game;
      });
    }
  }

  function onRoom(room) {
    if (room) {
      clearDeclinedNoticeIfNeeded(room);
    }
    if (room && room.game) {
      var fxState = maybeShowBallFx(room.game);
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

  Mp2Firebase.listenRoom(roomId, onRoom);
})();
