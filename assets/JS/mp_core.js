/**
 * Hand Cricket multiplayer — client-side game rules (mirrors CPU logic).
 */
(function (global) {
  "use strict";

  function makeTeamPlayers(size) {
    var list = [];
    for (var i = 1; i <= size; i++) {
      list.push("Player " + String(i).padStart(2, "0"));
    }
    return list;
  }

  function normalizeCooldownSeconds(seconds) {
    var val = parseInt(seconds, 10);
    if (!Number.isFinite(val)) return 60;
    return Math.max(15, Math.min(300, val));
  }

  function normalizePowerplayOvers(powerplayOvers, overs) {
    var val = parseInt(powerplayOvers, 10);
    if (!Number.isFinite(val)) return 0;
    return Math.max(0, Math.min(parseInt(overs, 10) || 1, val));
  }

  function createLobbyGame(overs, wickets, cooldownSeconds, powerplayOvers) {
    var teamSize = wickets + 1;
    powerplayOvers = normalizePowerplayOvers(powerplayOvers, overs);
    return {
      stage: "lobby",
      turn: "player1",
      overs: overs,
      powerplay_overs: powerplayOvers,
      wickets: wickets,
      cooldown_seconds: normalizeCooldownSeconds(cooldownSeconds),
      team_size: teamSize,
      batting_first: null,
      current_innings: 1,
      target: null,
      toss: {
        call: null,
        caller: "player1",
        num_p1: null,
        num_p2: null,
        winner: null,
        role: null,
      },
      innings: {},
      ball_pending: { picks: { player1: null, player2: null } },
      ball_picks: { player1: null, player2: null },
      ball_deadline: null,
      ball_timeout_for: null,
      lineup: null,
      pick_mode: null,
      pick_team: null,
      pick_replaces: null,
      followup_pick: null,
      last_fx: null,
      last_ball: null,
      result: null,
      count_stats: false,
      abandon: null,
    };
  }

  function tossSumWins(call, sum) {
    var odd = sum % 2 === 1;
    return (call === "odd" && odd) || (call === "even" && !odd);
  }

  function ensureInningsRoot(game) {
    if (!game.innings || typeof game.innings !== "object") {
      game.innings = {};
    }
  }

  function innKey(innNum) {
    return String(innNum);
  }

  function normalizeInn(inn, teamSize) {
    if (!inn) return inn;
    if (!inn.ball_log) inn.ball_log = [];
    if (!inn.dismissed) inn.dismissed = [];
    if (!inn.bat_stats) inn.bat_stats = {};
    if (!inn.bowl_stats) inn.bowl_stats = {};
    var players = makeTeamPlayers(teamSize || 4);
    players.forEach(function (p) {
      if (!inn.bat_stats[p]) inn.bat_stats[p] = { runs: 0, balls: 0, out: false };
      if (!inn.bowl_stats[p]) inn.bowl_stats[p] = { runs: 0, wickets: 0, balls: 0 };
    });
    return inn;
  }

  function getInnings(game, innNum) {
    if (!game || !game.innings) return null;
    var n = innNum != null ? innNum : game.current_innings;
    var inn = game.innings[innKey(n)] || game.innings[n] || null;
    if (inn) normalizeInn(inn, game.team_size);
    return inn;
  }

  function otherSlot(slot) {
    return slot === "player1" ? "player2" : "player1";
  }

  function initInningsState(game, innNum, opts) {
    opts = opts || {};
    ensureInningsRoot(game);
    var bat = innNum === 1 ? game.batting_first : (game.batting_first === "player1" ? "player2" : "player1");
    var bowl = bat === "player1" ? "player2" : "player1";
    var players = makeTeamPlayers(game.team_size);
    var key = innKey(innNum);
    var striker = opts.striker || players[0];
    var nonStriker = opts.non_striker || players[1];
    var bowler = opts.bowler || players[players.length - 1];

    game.innings[key] = {
      batting_team: bat,
      bowling_team: bowl,
      runs: 0,
      wickets: 0,
      balls_in_over: 0,
      overs_done: 0,
      striker: striker,
      non_striker: nonStriker,
      bowler: bowler,
      dismissed: [],
      bat_stats: {},
      bowl_stats: {},
      ball_log: [],
    };
    players.forEach(function (p) {
      game.innings[key].bat_stats[p] = { runs: 0, balls: 0, out: false };
      game.innings[key].bowl_stats[p] = { runs: 0, wickets: 0, balls: 0 };
    });
    game.current_innings = innNum;
    game.ball_pending = { picks: { player1: null, player2: null } };
    game.lineup = null;
  }

  function startInningsSetup(game, innNum) {
    game.last_fx = null;
    game.last_ball = null;
    game.ball_reveal = null;
    var bat = innNum === 1 ? game.batting_first : (game.batting_first === "player1" ? "player2" : "player1");
    var bowl = bat === "player1" ? "player2" : "player1";
    game.lineup = {
      inning: innNum,
      phase: "openers",
      batting_team: bat,
      bowling_team: bowl,
      openers: [],
      striker: null,
      bowler: null,
    };
    game.stage = "innings_setup";
    game.turn = bat;
    return game;
  }

  function applyOpenersPick(game, selected) {
    if (!game.lineup || game.lineup.phase !== "openers") return game;
    if (!selected || selected.length !== 2) return game;
    game.lineup.openers = selected;
    game.lineup.phase = "striker";
    game.turn = game.lineup.batting_team;
    return game;
  }

  function applyStrikerPick(game, striker, nonStriker) {
    if (!game.lineup || game.lineup.phase !== "striker") return game;
    game.lineup.striker = striker;
    game.lineup.non_striker = nonStriker;
    game.lineup.phase = "bowler";
    game.turn = game.lineup.bowling_team;
    return game;
  }

  function applyBowlerPick(game, bowler) {
    if (!game.lineup || game.lineup.phase !== "bowler") return game;
    game.lineup.bowler = bowler;
    var inn = game.lineup.inning;
    initInningsState(game, inn, {
      striker: game.lineup.striker,
      non_striker: game.lineup.non_striker,
      bowler: bowler,
    });
    game.stage = "gameplay_" + inn;
    game.turn = null;
    return startBallCountdown(game);
  }

  function swapStriker(inn) {
    var t = inn.striker;
    inn.striker = inn.non_striker;
    inn.non_striker = t;
  }

  function inningsMaxBalls(game) {
    return game.overs * 6;
  }

  function inningsTotalBalls(inn) {
    return inn.overs_done * 6 + inn.balls_in_over;
  }

  function isPowerplayOver(game, inn) {
    return inn.overs_done < (parseInt(game.powerplay_overs, 10) || 0);
  }

  function allowedNumberRange(game, inn) {
    return isPowerplayOver(game, inn) ? { min: 3, max: 10 } : { min: 0, max: 6 };
  }

  function isValidBallNumber(game, inn, num) {
    var range = allowedNumberRange(game, inn);
    return num >= range.min && num <= range.max;
  }

  function isInningsComplete(game, inn) {
    if (inn.wickets >= game.wickets) return true;
    return inningsTotalBalls(inn) >= inningsMaxBalls(game);
  }

  function chaseWon(game, inn) {
    return game.current_innings === 2 && game.target != null && inn.runs >= game.target;
  }

  function availableBatsmen(game, inn) {
    var players = makeTeamPlayers(game.team_size);
    var on = [inn.striker, inn.non_striker];
    return players.filter(function (p) {
      return on.indexOf(p) === -1 && inn.dismissed.indexOf(p) === -1;
    });
  }

  function availableBowlers(game, inn) {
    var players = makeTeamPlayers(game.team_size);
    var others = players.filter(function (p) {
      return p !== inn.bowler;
    });
    return others.length ? others : players;
  }

  function isBallOut(batNum, bowlNum) {
    return batNum === bowlNum && batNum !== 0;
  }

  function ballFx(runs, out) {
    if (out) return "out";
    if ([7, 8, 9, 10].indexOf(runs) !== -1) return "run" + runs;
    if (runs === 6) return "six";
    if (runs === 4) return "four";
    return null;
  }

  function clearBallCountdown(game) {
    game.cooldown_seconds = normalizeCooldownSeconds(game.cooldown_seconds);
    game.ball_deadline = null;
    game.ball_timeout_for = null;
    game.ball_picks = { player1: null, player2: null };
    return game;
  }

  function startBallCountdown(game) {
    game.cooldown_seconds = normalizeCooldownSeconds(game.cooldown_seconds);
    game.ball_deadline = Date.now() + game.cooldown_seconds * 1000;
    game.ball_timeout_for = null;
    game.ball_picks = { player1: null, player2: null };
    return game;
  }

  function getMissingBallSlot(game) {
    var picks = game.ball_picks || { player1: null, player2: null };
    if (picks.player1 != null && picks.player2 != null) return null;
    if (picks.player1 == null && picks.player2 != null) return "player1";
    if (picks.player1 != null && picks.player2 == null) return "player2";
    var inn = getInnings(game, game.current_innings);
    return inn ? battingSlot(inn) : "player1";
  }

  function resolveBallTimeout(game) {
    if (!game || !game.stage || (game.stage !== "gameplay_1" && game.stage !== "gameplay_2")) return game;
    if (game.ball_timeout_for) return game;
    if (!game.ball_deadline || Date.now() < game.ball_deadline) return game;
    var missingSlot = getMissingBallSlot(game);
    if (!missingSlot) return game;
    game.ball_timeout_for = missingSlot;
    return giveUpMatch(game, missingSlot);
  }

  function recordBallPick(game, slot, role, num) {
    if (!game || !game.stage || (game.stage !== "gameplay_1" && game.stage !== "gameplay_2")) return game;
    if (game.ball_timeout_for) return game;
    if (!game.ball_picks) {
      game.ball_picks = { player1: null, player2: null };
    }
    if (game.ball_picks[slot] != null) return game;
    if (!game.ball_deadline) {
      game = startBallCountdown(game);
    }
    var inn = getInnings(game, game.current_innings);
    if (!inn) return game;
    if (!isValidBallNumber(game, inn, num)) return game;
    var batSlot = battingSlot(inn);
    var bowlSlot = bowlingSlot(inn);
    if (role === "bat" && slot === batSlot) {
      game.ball_picks[slot] = num;
    } else if (role === "bowl" && slot === bowlSlot) {
      game.ball_picks[slot] = num;
    } else {
      return game;
    }
    return game;
  }

  function computeBallResult(batNum, bowlNum) {
    var out = isBallOut(batNum, bowlNum);
    var runs = out ? 0 : batNum;
    return { out: out, runs: runs, fx: ballFx(runs, out) };
  }

  function battingSlot(inn) {
    return inn.batting_team;
  }

  function bowlingSlot(inn) {
    return inn.bowling_team;
  }

  function processBall(game, batNum, bowlNum) {
    var innNum = game.current_innings;
    var inn = getInnings(game, innNum);
    if (!inn) return game;
    if (!isValidBallNumber(game, inn, batNum) || !isValidBallNumber(game, inn, bowlNum)) return game;
    var out = isBallOut(batNum, bowlNum);
    var runs = out ? 0 : batNum;
    var striker = inn.striker;

    inn.ball_log.push({ bat: batNum, bowl: bowlNum, runs: runs, out: out, striker: striker });
    inn.bat_stats[striker].balls++;
    inn.bowl_stats[inn.bowler].balls++;

    if (out) {
      inn.bat_stats[striker].out = true;
      inn.dismissed.push(striker);
      inn.wickets++;
      inn.bowl_stats[inn.bowler].wickets++;
    } else {
      inn.runs += runs;
      inn.bat_stats[striker].runs += runs;
      inn.bowl_stats[inn.bowler].runs += runs;
      if (runs % 2 === 1) swapStriker(inn);
    }

    var overEnded = false;
    inn.balls_in_over++;
    if (inn.balls_in_over >= 6) {
      inn.balls_in_over = 0;
      inn.overs_done++;
      overEnded = true;
      if (!out) swapStriker(inn);
    }

    game.last_ball = { bat: batNum, bowl: bowlNum, runs: runs, out: out };
    game.last_fx = ballFx(runs, out);
    game.ball_reveal = null;
    game.ball_pending = { picks: { player1: null, player2: null } };
    clearBallCountdown(game);

    if (chaseWon(game, inn) || isInningsComplete(game, inn)) {
      return endInnings(game);
    }

    if (!out) {
      game.followup_pick = null;
    }

    if (out) {
      if (availableBatsmen(game, inn).length === 0) {
        return endInnings(game);
      }
      game.stage = "lineup_pick";
      game.pick_mode = "batsman";
      game.pick_team = inn.batting_team;
      game.pick_replaces = "striker";
      game.turn = inn.batting_team;
      if (overEnded) {
        game.followup_pick = "bowler";
      }
      return game;
    }

    if (overEnded) {
      var bowlers = availableBowlers(game, inn);
      if (bowlers.length > 0) {
        game.stage = "lineup_pick";
        game.pick_mode = "bowler";
        game.pick_team = inn.bowling_team;
        game.turn = inn.bowling_team;
        return game;
      }
    }

    game.stage = "gameplay_" + innNum;
    game.turn = null;
    return startBallCountdown(game);
  }

  function ensureBallPending(game) {
    if (!game.ball_pending) {
      game.ball_pending = { picks: { player1: null, player2: null } };
      return;
    }
    if (!game.ball_pending.picks) {
      var picks = { player1: null, player2: null };
      if (game.ball_pending.bat != null || game.ball_pending.bowl != null) {
        var inn = getInnings(game, game.current_innings);
        if (inn) {
          if (game.ball_pending.bat != null) picks[inn.batting_team] = game.ball_pending.bat;
          if (game.ball_pending.bowl != null) picks[inn.bowling_team] = game.ball_pending.bowl;
        }
      }
      game.ball_pending = { picks: picks };
    }
  }

  function submitBallPick(game, slot, role, num) {
    if (game.stage !== "gameplay_1" && game.stage !== "gameplay_2") return game;
    var inn = getInnings(game, game.current_innings);
    if (!inn) return game;
    var batSlot = battingSlot(inn);
    var bowlSlot = bowlingSlot(inn);
    ensureBallPending(game);
    var picks = game.ball_pending.picks;

    if (role === "bat" && slot === batSlot && picks[slot] === null) {
      picks[slot] = num;
    } else if (role === "bowl" && slot === bowlSlot && picks[slot] === null) {
      picks[slot] = num;
    } else {
      return game;
    }

    if (picks[batSlot] !== null && picks[bowlSlot] !== null) {
      game = processBall(game, picks[batSlot], picks[bowlSlot]);
    }
    return game;
  }

  function ballPickView(game, viewerSlot, pickInfo) {
    var inn = getInnings(game, game.current_innings);
    if (!inn) {
      return {
        canBat: false,
        canBowl: false,
        myBat: null,
        myBowl: null,
        oppBatReady: false,
        oppBowlReady: false,
        revealed: null,
      };
    }
    pickInfo = pickInfo || {};
    var batSlot = battingSlot(inn);
    var bowlSlot = bowlingSlot(inn);
    var revealed = pickInfo.revealed || null;
    var myPick = pickInfo.myPick != null ? pickInfo.myPick : null;
    var iBat = viewerSlot === batSlot;
    var iBowl = viewerSlot === bowlSlot;
    var waitingReveal = !!revealed;
    return {
      canBat: !waitingReveal && iBat && myPick === null,
      canBowl: !waitingReveal && iBowl && myPick === null,
      myBat: iBat ? myPick : null,
      myBowl: iBowl ? myPick : null,
      oppBatReady: !iBat && !!pickInfo.oppBatReady,
      oppBowlReady: !iBowl && !!pickInfo.oppBowlReady,
      revealed: revealed,
    };
  }

  function endInnings(game) {
    var innNum = game.current_innings;
    var inn = getInnings(game, innNum);
    if (!inn) return game;

    if (innNum === 1) {
      game.target = inn.runs + 1;
      game.stage = "innings_break";
      game.turn = "player1";
      game.last_fx = null;
      game.last_ball = null;
      game.ball_reveal = null;
      return game;
    }

    return finishMatch(game, true);
  }

  function runsForSlot(game, slot) {
    var total = 0;
    [1, 2].forEach(function (n) {
      var inn = getInnings(game, n);
      if (inn && inn.batting_team === slot) total += inn.runs;
    });
    return total;
  }

  function finishMatch(game, countStats) {
    var in1 = getInnings(game, 1) || { runs: 0 };
    var in2 = getInnings(game, 2) || { runs: 0 };
    var r1 = in1.runs;
    var r2 = in2.runs;
    var first = game.batting_first;
    var p1Runs = first === "player1" ? r1 : r2;
    var p2Runs = first === "player1" ? r2 : r1;
    game.result = {
      player1: p1Runs,
      player2: p2Runs,
      winner: p1Runs > p2Runs ? "player1" : p1Runs < p2Runs ? "player2" : "tie",
    };
    game.stage = "finished";
    game.turn = null;
    game.count_stats = !!countStats;
    game.last_fx = null;
    game.last_ball = null;
    game.ball_reveal = null;
    return clearBallCountdown(game);
  }

  function abandonMatch(game, leaverSlot, reason) {
    var winner = otherSlot(leaverSlot);
    game.stage = "abandoned";
    game.turn = null;
    game.count_stats = false;
    game.abandon = {
      by: leaverSlot,
      reason: reason,
      winner: winner,
    };
    game.result = {
      player1: runsForSlot(game, "player1"),
      player2: runsForSlot(game, "player2"),
      winner: otherSlot(slot),
      gave_up: slot,
      timeout: !!game.ball_timeout_for,
    };
    game.stage = "finished";
    game.count_stats = true;
    game.turn = null;
    return clearBallCountdown(game);
  }

  function applyTossNumbers(game) {
    var t = game.toss;
    var sum = parseInt(t.num_p1, 10) + parseInt(t.num_p2, 10);
    t.winner = tossSumWins(t.call, sum) ? t.caller : (t.caller === "player1" ? "player2" : "player1");
    game.stage = "toss_3";
    game.turn = t.winner;
    return game;
  }

  function applyTossRole(game, role) {
    if (!game.toss || !game.toss.winner) return game;
    var winner = game.toss.winner;
    game.toss.role = role;
    if (winner === "player1") {
      game.batting_first = role === "bat" ? "player1" : "player2";
    } else {
      game.batting_first = role === "bat" ? "player2" : "player1";
    }
    game.last_fx = null;
    game.last_ball = null;
    return startInningsSetup(game, 1);
  }

  function applyLineupPick(game, playerName) {
    var inn = getInnings(game, game.current_innings);
    if (!inn) return game;
    clearBallCountdown(game);
    if (game.pick_mode === "batsman") {
      inn.striker = playerName;
      if (game.followup_pick === "bowler") {
        game.stage = "lineup_pick";
        game.pick_mode = "bowler";
        game.pick_team = inn.bowling_team;
        game.turn = inn.bowling_team;
        game.followup_pick = null;
        game.pick_replaces = null;
        return game;
      }
      game.stage = "gameplay_" + game.current_innings;
      game.turn = null;
      game.pick_mode = null;
      game.pick_team = null;
      game.pick_replaces = null;
      return startBallCountdown(game);
    }
    if (game.pick_mode === "bowler") {
      inn.bowler = playerName;
      game.stage = "gameplay_" + game.current_innings;
      game.turn = null;
      game.pick_mode = null;
      game.pick_team = null;
      game.pick_replaces = null;
      game.followup_pick = null;
      return startBallCountdown(game);
    }
    return game;
  }

  function formatOvers(inn) {
    return inn.overs_done + "." + inn.balls_in_over;
  }

  global.MpCore = {
    makeTeamPlayers: makeTeamPlayers,
    createLobbyGame: createLobbyGame,
    getInnings: getInnings,
    initInningsState: initInningsState,
    startInningsSetup: startInningsSetup,
    applyOpenersPick: applyOpenersPick,
    applyStrikerPick: applyStrikerPick,
    applyBowlerPick: applyBowlerPick,
    processBall: processBall,
    submitBallPick: submitBallPick,
    ballPickView: ballPickView,
    applyTossNumbers: applyTossNumbers,
    applyTossRole: applyTossRole,
    applyLineupPick: applyLineupPick,
    startSecondInnings: startSecondInnings,
    endInnings: endInnings,
    finishMatch: finishMatch,
    abandonMatch: abandonMatch,
    giveUpMatch: giveUpMatch,
    resolveBallTimeout: resolveBallTimeout,
    recordBallPick: recordBallPick,
    formatOvers: formatOvers,
    battingSlot: battingSlot,
    bowlingSlot: bowlingSlot,
    otherSlot: otherSlot,
    inningsTotalBalls: inningsTotalBalls,
    isPowerplayOver: isPowerplayOver,
    allowedNumberRange: allowedNumberRange,
    isValidBallNumber: isValidBallNumber,
    isInningsComplete: isInningsComplete,
    isBallOut: isBallOut,
    computeBallResult: computeBallResult,
    availableBatsmen: availableBatsmen,
    availableBowlers: availableBowlers,
    tossSumWins: tossSumWins,
  };
})(window);
