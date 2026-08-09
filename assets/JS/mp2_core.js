/**
 * 2 vs 2 multiplayer game rules.
 */
(function (global) {
  "use strict";

  var SLOTS = ["player1", "player2", "player3", "player4"];
  var TEAMS = ["teamX", "teamY"];

  function makeTeamPlayers(size) {
    var list = [];
    for (var i = 1; i <= size; i++) list.push("Player " + String(i).padStart(2, "0"));
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

  function createGame(overs, wickets, cooldownSeconds, powerplayOvers, teamingMode) {
    var teamSize = wickets + 1;
    return {
      mode: "2v2",
      stage: "lobby",
      turn: "player1",
      host: "player1",
      overs: overs,
      powerplay_overs: normalizePowerplayOvers(powerplayOvers, overs),
      wickets: wickets,
      cooldown_seconds: normalizeCooldownSeconds(cooldownSeconds),
      team_size: teamSize,
      teams: null,
      team_assignment_method: teamingMode || "random",
      captains: {},
      batting_first: null,
      current_innings: 1,
      target: null,
      toss: { caller_team: "teamX", call: null, nums: {}, winner_team: null, role: null },
      innings: {},
      lineup: null,
      pick_mode: null,
      pick_team: null,
      pick_slot: null,
      pick_replaces: null,
      followup_pick: null,
      ball_picks: {},
      ball_deadline: null,
      ball_timeout_for: null,
      last_ball: null,
      last_fx: null,
      result: null,
      count_stats: false,
      abandon: null,
    };
  }

  function otherTeam(team) {
    return team === "teamX" ? "teamY" : "teamX";
  }

  function otherSlotInTeam(game, slot) {
    var team = teamForSlot(game, slot);
    if (!team || !game.teams) return null;
    return (game.teams[team] || []).find(function (s) { return s !== slot; }) || null;
  }

  function teamForSlot(game, slot) {
    if (!game.teams) return null;
    if ((game.teams.teamX || []).indexOf(slot) !== -1) return "teamX";
    if ((game.teams.teamY || []).indexOf(slot) !== -1) return "teamY";
    return null;
  }

  function setTeams(game, teams, method, captains) {
    if (!teams || (teams.teamX || []).length !== 2 || (teams.teamY || []).length !== 2) return game;
    game.teams = { teamX: teams.teamX.slice(), teamY: teams.teamY.slice() };
    game.team_assignment_method = method;
    game.captains = captains || {
      teamX: game.teams.teamX[0],
      teamY: game.teams.teamY[0],
    };
      game.stage = "toss_1";
      game.turn = game.captains.teamX;
      // Randomly decide which team's captain will call the toss
      game.toss.caller_team = Math.random() < 0.5 ? "teamX" : "teamY";
      return game;
  }

  function randomizeTeams(game) {
    var slots = SLOTS.slice();
    for (var i = slots.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = slots[i];
      slots[i] = slots[j];
      slots[j] = t;
    }
    var teams = { teamX: slots.slice(0, 2), teamY: slots.slice(2, 4) };
    var captains = {
      teamX: teams.teamX[Math.floor(Math.random() * 2)],
      teamY: teams.teamY[Math.floor(Math.random() * 2)],
    };
    return setTeams(game, teams, "random", captains);
  }

  function tossSumWins(call, sum) {
    var odd = sum % 2 === 1;
    return (call === "odd" && odd) || (call === "even" && !odd);
  }

  function applyTossNumbers(game) {
    var t = game.toss;
    var xNum = parseInt(t.nums.teamX, 10);
    var yNum = parseInt(t.nums.teamY, 10);
    t.winner_team = tossSumWins(t.call, xNum + yNum) ? t.caller_team : otherTeam(t.caller_team);
    game.stage = "toss_3";
    game.turn = game.captains[t.winner_team];
    return game;
  }

  function applyTossRole(game, role) {
    var winner = game.toss.winner_team;
    game.toss.role = role;
    game.batting_first = role === "bat" ? winner : otherTeam(winner);
    return startInningsSetup(game, 1);
  }

  function ensureInningsRoot(game) {
    if (!game.innings || typeof game.innings !== "object") game.innings = {};
  }

  function innKey(n) {
    return String(n);
  }

  function teamForInnings(game, innNum) {
    return innNum === 1 ? game.batting_first : otherTeam(game.batting_first);
  }

  function getInnings(game, innNum) {
    if (!game || !game.innings) return null;
    var n = innNum != null ? innNum : game.current_innings;
    return game.innings[innKey(n)] || null;
  }

  function initPlayerStats(players) {
    var stats = {};
    players.forEach(function (p) {
      stats[p] = { runs: 0, balls: 0, out: false };
    });
    return stats;
  }

  function initBowlerStats(players) {
    var stats = {};
    players.forEach(function (p) {
      stats[p] = { runs: 0, wickets: 0, balls: 0 };
    });
    return stats;
  }

  function startInningsSetup(game, innNum) {
    var bat = teamForInnings(game, innNum);
    var bowl = otherTeam(bat);
    game.current_innings = innNum;
    game.stage = "innings_setup";
    game.turn = null;
    game.lineup = {
      inning: innNum,
      phase: "openers",
      batting_team: bat,
      bowling_team: bowl,
      opener_picks: {},
      striker: null,
      non_striker: null,
      opening_bowling_slot: null,
      bowler: null,
    };
    return game;
  }

  function applyOpenerPick(game, slot, player) {
    var lu = game.lineup;
    if (!lu || lu.phase !== "openers" || (game.teams[lu.batting_team] || []).indexOf(slot) === -1) return game;
    var picks = lu.opener_picks || {};
    var other = otherSlotInTeam(game, slot);
    if (other && picks[other] === player) return game;
    picks[slot] = player;
    lu.opener_picks = picks;
    if (game.teams[lu.batting_team].every(function (s) { return picks[s]; })) {
      lu.phase = "striker";
      game.turn = game.captains[lu.batting_team];
    }
    return game;
  }

  function applyStrikerPick(game, striker) {
    var lu = game.lineup;
    if (!lu || lu.phase !== "striker") return game;
    var picked = Object.keys(lu.opener_picks).map(function (s) { return lu.opener_picks[s]; });
    if (picked.indexOf(striker) === -1) return game;
    lu.striker = striker;
    lu.non_striker = picked.find(function (p) { return p !== striker; });
    lu.phase = "opening_bowling_slot";
    game.turn = game.captains[lu.bowling_team];
    return game;
  }

  function applyOpeningBowlingSlot(game, slot) {
  var lu = game.lineup;
  if (!lu || lu.phase !== "opening_bowling_slot") return game;

  // Defensive: accept the slot if it belongs to either team array
  // (sometimes UI may send a slot string that doesn't match due to state drift).
  var allowed = false;
  if (game.teams) {
    var bowlTeam = lu.bowling_team;
    allowed = Array.isArray(game.teams[bowlTeam]) && game.teams[bowlTeam].indexOf(slot) !== -1;
    if (!allowed) {
      // allow if it exists in either team list
      allowed = (Array.isArray(game.teams.teamX) && game.teams.teamX.indexOf(slot) !== -1) ||
                (Array.isArray(game.teams.teamY) && game.teams.teamY.indexOf(slot) !== -1);
    }
  }
  if (!allowed) return game;

  lu.opening_bowling_slot = slot;
  lu.phase = "opening_bowler";
  game.turn = slot;
  game.last_update = Date.now();
  return game;
}

  function applyOpeningBowler(game, slot, player) {
    var lu = game.lineup;
    if (!lu || lu.phase !== "opening_bowler" || lu.opening_bowling_slot !== slot) return game;
    lu.bowler = player;
    initInnings(game, lu.inning, lu);
    game.stage = "gameplay_" + lu.inning;
    game.turn = null;
    game.last_update = Date.now(); // ensure update propagates to all clients
    game.lineup = null;
    return startBallCountdown(game);
  }

  function initInnings(game, innNum, lu) {
    ensureInningsRoot(game);
    var players = makeTeamPlayers(game.team_size);
    var owner = {};
    Object.keys(lu.opener_picks).forEach(function (slot) { owner[lu.opener_picks[slot]] = slot; });
    game.innings[innKey(innNum)] = {
      batting_team: lu.batting_team,
      bowling_team: lu.bowling_team,
      runs: 0,
      wickets: 0,
      balls_in_over: 0,
      overs_done: 0,
      striker: lu.striker,
      non_striker: lu.non_striker,
      bowler: lu.bowler,
      bowling_slot: lu.opening_bowling_slot,
      prev_bowling_slot: null,
      dismissed: [],
      player_owner: owner,
      bat_stats: initPlayerStats(players),
      bowl_stats: initBowlerStats(players),
      ball_log: [],
    };
  }

  function inningsTotalBalls(inn) {
    return inn.overs_done * 6 + inn.balls_in_over;
  }

  function inningsMaxBalls(game) {
    return game.overs * 6;
  }

  function isPowerplayOver(game, inn) {
    var powerplay = parseInt(game.powerplay_overs, 10);
    return Number.isFinite(powerplay) && inn.overs_done < powerplay;
  }

  function allowedNumberRange(game, inn) {
    return isPowerplayOver(game, inn) ? { min: 3, max: 10 } : { min: 0, max: 6 };
  }

  function isValidBallNumber(game, inn, num) {
    var range = allowedNumberRange(game, inn);
    return num >= range.min && num <= range.max;
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

  function swapStriker(inn) {
    var t = inn.striker;
    inn.striker = inn.non_striker;
    inn.non_striker = t;
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
    return players.filter(function (p) { return p !== inn.bowler; });
  }

  function startBallCountdown(game) {
    game.cooldown_seconds = normalizeCooldownSeconds(game.cooldown_seconds);
    game.ball_deadline = Date.now() + game.cooldown_seconds * 1000;
    game.ball_timeout_for = null;
    game.ball_picks = {};
    return game;
  }

  function clearBallCountdown(game) {
    game.ball_deadline = null;
    game.ball_timeout_for = null;
    game.ball_picks = {};
    return game;
  }

  function activeBattingSlot(inn) {
    return inn.player_owner[inn.striker];
  }

  function activeBowlingSlot(inn) {
    return inn.bowling_slot;
  }

  function recordBallPick(game, slot, role, num) {
    if (game.stage !== "gameplay_1" && game.stage !== "gameplay_2") return game;
    var inn = getInnings(game, game.current_innings);
    if (!inn || !isValidBallNumber(game, inn, num)) return game;
    if (!game.ball_picks) game.ball_picks = {};
    if (game.ball_picks[slot] != null) return game;
    if (role === "bat" && slot === activeBattingSlot(inn)) game.ball_picks[slot] = num;
    if (role === "bowl" && slot === activeBowlingSlot(inn)) game.ball_picks[slot] = num;

    var batSlot = activeBattingSlot(inn);
    var bowlSlot = activeBowlingSlot(inn);
    if (game.ball_picks[batSlot] != null && game.ball_picks[bowlSlot] != null) {
      return processBall(game, game.ball_picks[batSlot], game.ball_picks[bowlSlot]);
    }
    return game;
  }

  function ensureArray(val) {
    if (Array.isArray(val)) return val;
    if (!val || typeof val !== "object") return [];
    // Firebase serializes arrays as objects {"0":x,"1":y,...}
    var keys = Object.keys(val);
    var arr = [];
    keys.forEach(function (k) { arr[parseInt(k, 10)] = val[k]; });
    return arr;
  }

  function processBall(game, batNum, bowlNum) {
    var inn = getInnings(game, game.current_innings);
    if (!inn || !isValidBallNumber(game, inn, batNum) || !isValidBallNumber(game, inn, bowlNum)) return game;
    // Normalize array fields that Firebase may have converted to objects (prevents crashes)
    inn.ball_log = ensureArray(inn.ball_log);
    inn.dismissed = ensureArray(inn.dismissed);
    if (!inn.bat_stats) inn.bat_stats = {};
    if (!inn.bowl_stats) inn.bowl_stats = {};

    var out = isBallOut(batNum, bowlNum);
    var runs = out ? 0 : batNum;
    var striker = inn.striker;

    inn.ball_log.push({ bat: batNum, bowl: bowlNum, runs: runs, out: out, striker: striker });
    if (!inn.bat_stats[striker]) inn.bat_stats[striker] = { runs: 0, balls: 0, out: false };
    if (!inn.bowl_stats[inn.bowler]) inn.bowl_stats[inn.bowler] = { runs: 0, wickets: 0, balls: 0 };
    inn.bat_stats[striker].balls++;
    inn.bowl_stats[inn.bowler].balls++;
    if (out) {
      inn.bat_stats[striker].out = true;
      inn.dismissed = ensureArray(inn.dismissed);
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
    clearBallCountdown(game);

    if (chaseWon(game, inn) || isInningsComplete(game, inn)) return endInnings(game);

    if (out) {
      var owner = inn.player_owner[striker];
      var playersRemaining = availableBatsmen(game, inn);
      if (playersRemaining.length === 0) return endInnings(game);
      var pickSlot = owner;
      // Normalize dismissed before filter
      inn.dismissed = ensureArray(inn.dismissed);
      var ownerRemaining = playersRemaining.filter(function (p) {
        return !inn.player_owner[p] || inn.player_owner[p] === owner;
      }).length;
      if (ownerRemaining === 0) {
        var teammate = otherSlotInTeam(game, owner);
        if (teammate) pickSlot = teammate;
      }
      game.stage = "lineup_pick";
      game.pick_mode = "batsman";
      game.pick_team = inn.batting_team;
      game.pick_slot = pickSlot;
      game.pick_replaces = "striker";
      game.followup_pick = overEnded ? "bowling_slot" : null;
      game.turn = pickSlot;
      return game;
    }

    if (overEnded) {
      return startBowlingSlotPick(game, inn);
    }

    game.stage = "gameplay_" + game.current_innings;
    game.turn = null;
    return startBallCountdown(game);
  }

  function startBowlingSlotPick(game, inn) {
    var nextSlot = otherSlotInTeam(game, inn.bowling_slot);
    inn.prev_bowling_slot = inn.bowling_slot;
    inn.bowling_slot = nextSlot;
    game.stage = "lineup_pick";
    game.pick_mode = "bowler";
    game.pick_team = inn.bowling_team;
    game.pick_slot = nextSlot;
    game.turn = nextSlot;
    return game;
  }

  function applyLineupPick(game, slot, player) {
    var inn = getInnings(game, game.current_innings);
    if (!inn || game.turn !== slot) return game;
    if (game.pick_mode === "batsman") {
      if (availableBatsmen(game, inn).indexOf(player) === -1) return game;
      if (game.followup_pick === "bowling_slot" && game.pick_replaces === "striker" && inn.dismissed.indexOf(inn.striker) !== -1 && inn.balls_in_over === 0) {
        var previousNonStriker = inn.non_striker;
        inn.striker = previousNonStriker;
        inn.non_striker = player;
      } else {
        inn.striker = player;
      }
      inn.player_owner[player] = slot;
      if (game.followup_pick === "bowling_slot") {
        game.followup_pick = null;
        return startBowlingSlotPick(game, inn);
      }
    } else if (game.pick_mode === "bowler") {
      if (availableBowlers(game, inn).indexOf(player) === -1) return game;
      inn.bowler = player;
    }
    game.stage = "gameplay_" + game.current_innings;
    game.pick_mode = null;
    game.pick_team = null;
    game.pick_slot = null;
    game.turn = null;
    return startBallCountdown(game);
  }

  function isInningsComplete(game, inn) {
    if (inn.wickets >= game.wickets) return true;
    return inningsTotalBalls(inn) >= inningsMaxBalls(game);
  }

  function chaseWon(game, inn) {
    return game.current_innings === 2 && game.target != null && inn.runs >= game.target;
  }

  function endInnings(game) {
    var inn = getInnings(game, game.current_innings);
    if (game.current_innings === 1) {
      game.target = inn.runs + 1;
      game.stage = "innings_break";
      game.turn = game.captains[teamForInnings(game, 2)];
      return game;
    }
    return finishMatch(game, true);
  }

  function startSecondInnings(game) {
    return startInningsSetup(game, 2);
  }

  function teamRuns(game, team) {
    var total = 0;
    [1, 2].forEach(function (n) {
      var inn = getInnings(game, n);
      if (inn && inn.batting_team === team) total += inn.runs;
    });
    return total;
  }

  function finishMatch(game, countStats) {
    var x = teamRuns(game, "teamX");
    var y = teamRuns(game, "teamY");
    game.result = { teamX: x, teamY: y, winner: x > y ? "teamX" : x < y ? "teamY" : "tie" };
    game.stage = "finished";
    game.turn = null;
    game.count_stats = !!countStats;
    return clearBallCountdown(game);
  }

  function winByDisconnect(game, slot) {
    var team = teamForSlot(game, slot);
    if (!team) return game;
    var x = teamRuns(game, "teamX");
    var y = teamRuns(game, "teamY");
    game.result = { teamX: x, teamY: y, winner: team, disconnect_win: slot };
    game.stage = "finished";
    game.turn = null;
    game.count_stats = true;
    return clearBallCountdown(game);
  }

  function giveUpMatch(game, slot) {
    var team = teamForSlot(game, slot);
    var winner = team ? otherTeam(team) : "teamY";
    game.result = { teamX: teamRuns(game, "teamX"), teamY: teamRuns(game, "teamY"), winner: winner, gave_up: slot, timeout: !!game.ball_timeout_for };
    game.stage = "finished";
    game.count_stats = true;
    game.turn = null;
    return clearBallCountdown(game);
  }

  function requestGiveUp(game, slot) {
    var team = teamForSlot(game, slot);
    if (!team) return game;
    if (["lobby", "team_setup", "toss_1", "toss_2", "toss_3"].indexOf(game.stage) !== -1) return game;
    if (!game.give_up_requests) {
      game.give_up_requests = { teamX: {}, teamY: {} };
    }
    if (!game.give_up_requests[team]) {
      game.give_up_requests[team] = {};
    }
    if (game.give_up_requests[team][slot]) return game;
    game.give_up_requests[team][slot] = true;
    var teammates = (game.teams && game.teams[team]) || [];
    if (teammates.length === 2 && teammates.every(function (s) { return game.give_up_requests[team][s]; })) {
      return giveUpMatch(game, slot);
    }
    return game;
  }

  function declineGiveUp(game, slot) {
    var team = teamForSlot(game, slot);
    if (!team) return game;
    if (!game.give_up_declined) game.give_up_declined = {};
    game.give_up_declined[team] = slot;
    return game;
  }

  function getMissingBallSlot(game) {
    var inn = getInnings(game, game.current_innings);
    if (!inn) return null;
    var batSlot = activeBattingSlot(inn);
    var bowlSlot = activeBowlingSlot(inn);
    var picks = game.ball_picks || {};
    if (picks[batSlot] != null && picks[bowlSlot] != null) return null;
    if (picks[batSlot] == null && picks[bowlSlot] != null) return batSlot;
    if (picks[batSlot] != null && picks[bowlSlot] == null) return bowlSlot;
    return batSlot;
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

  function formatOvers(inn) {
    return inn.overs_done + "." + inn.balls_in_over;
  }

  global.Mp2Core = {
    SLOTS: SLOTS,
    TEAMS: TEAMS,
    makeTeamPlayers: makeTeamPlayers,
    createGame: createGame,
    setTeams: setTeams,
    randomizeTeams: randomizeTeams,
    applyTossNumbers: applyTossNumbers,
    applyTossRole: applyTossRole,
    applyOpenerPick: applyOpenerPick,
    applyStrikerPick: applyStrikerPick,
    applyOpeningBowlingSlot: applyOpeningBowlingSlot,
    applyOpeningBowler: applyOpeningBowler,
    applyLineupPick: applyLineupPick,
    recordBallPick: recordBallPick,
    processBall: processBall,
    startSecondInnings: startSecondInnings,
    winByDisconnect: winByDisconnect,
    giveUpMatch: giveUpMatch,
    requestGiveUp: requestGiveUp,
    declineGiveUp: declineGiveUp,
    getInnings: getInnings,
    teamForInnings: teamForInnings,
    teamForSlot: teamForSlot,
    otherSlotInTeam: otherSlotInTeam,
    otherTeam: otherTeam,
    activeBattingSlot: activeBattingSlot,
    activeBowlingSlot: activeBowlingSlot,
    availableBatsmen: availableBatsmen,
    availableBowlers: availableBowlers,
    allowedNumberRange: allowedNumberRange,
    isPowerplayOver: isPowerplayOver,
    isValidBallNumber: isValidBallNumber,
    inningsTotalBalls: inningsTotalBalls,
    formatOvers: formatOvers,
    getMissingBallSlot: getMissingBallSlot,
    resolveBallTimeout: resolveBallTimeout,
  };
})(window);
