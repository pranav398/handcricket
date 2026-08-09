/**
 * Firebase helpers for 2 vs 2 rooms.
 */
(function (global) {
  "use strict";

  var db = null;
  var authReady = Promise.resolve();
  var ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function init() {
    if (!global.FIREBASE_CONFIG || !global.FIREBASE_CONFIG.databaseURL) return false;
    if (!global.firebase) return false;
    if (!firebase.apps.length) firebase.initializeApp(global.FIREBASE_CONFIG);

    // Realtime DB does not strictly require auth for the client-side logic,
    // but we used anonymous auth to gate everything behind waitForAuth().
    // If anonymous auth is misconfigured/disabled, multiplayer becomes unusable.
    // So: keep auth attempt, but never block DB operations if it fails.
    authReady = Promise.resolve(null);
    if (firebase.auth) {
      try {
        var auth = firebase.auth();
        authReady = Promise.resolve(auth.currentUser || null).then(function (u) {
          if (u) return u;
          return auth.signInAnonymously().catch(function (err) {
            try { console.error("Firebase anonymous sign-in failed (continuing without auth):", err); } catch (e) {}
            return null;
          });
        });
      } catch (err) {
        try { console.error("Firebase auth init failed (continuing without auth):", err); } catch (e) {}
        authReady = Promise.resolve(null);
      }
    }

    db = firebase.database();
    return true;
  }

  function waitForAuth() {
    return authReady;
  }

  function roomRef(roomId) {
    return db.ref("rooms2v2/" + roomId);
  }

  function genRoomId() {
    var id = "";
    for (var i = 0; i < 4; i++) id += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
    return id;
  }

  function roomExists(roomId) {
    return waitForAuth().then(function () {
      return roomRef(roomId).child("meta").once("value").then(function (snap) { return snap.exists(); });
    });
  }

  function playerPayload(player) {
    return {
      userId: player.userId,
      username: player.username,
      online: true,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
    };
  }

  function createRoom(roomId, hostPlayer, gameState) {
    return waitForAuth().then(function () {
      var players = {};
      if (gameState.team_assignment_method !== "slot") {
        players.player1 = playerPayload(hostPlayer);
      }
      return roomRef(roomId).set({
        meta: {
          mode: "2v2",
          overs: gameState.overs,
          wickets: gameState.wickets,
          powerplay_overs: gameState.powerplay_overs,
          cooldown_seconds: gameState.cooldown_seconds,
          status: "waiting",
          teaming_mode: gameState.team_assignment_method || "random",
          created: firebase.database.ServerValue.TIMESTAMP,
          creator: {
            userId: hostPlayer.userId,
            username: hostPlayer.username,
          },
        },
        players: players,
        game: gameState,
      });
    });
  }

  function joinRoom(roomId, player) {
    return waitForAuth().then(function () {
      var ref = roomRef(roomId);
      return ref.once("value").then(function (snap) {
        var room = snap.val();
        if (!room || !room.meta) throw new Error("Room not found");
        if (room.meta.cleanupAt && Date.now() > room.meta.cleanupAt) {
          return roomRef(roomId).remove().then(function () {
            throw new Error("Room expired");
          });
        }
        if (room.meta && room.meta.status === "terminated") {
          throw new Error("Room has been terminated");
        }
        var players = room.players || {};
        var existing = Object.keys(players).find(function (slot) {
          return players[slot] && players[slot].userId === player.userId;
        });
        if (existing) return existing;
        var open = Mp2Core.SLOTS.find(function (slot) { return !players[slot]; });
        if (!open) throw new Error("Room is full");

        var randomTeams = null;
        var randomCaptains = null;
        if (open === "player4" && room.game && room.game.stage === "lobby" && room.game.team_assignment_method === "random") {
          var slots = Mp2Core.SLOTS.slice();
          for (var i = slots.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = slots[i];
            slots[i] = slots[j];
            slots[j] = t;
          }
          randomTeams = { teamX: slots.slice(0, 2), teamY: slots.slice(2, 4) };
          randomCaptains = {
            teamX: randomTeams.teamX[Math.floor(Math.random() * 2)],
            teamY: randomTeams.teamY[Math.floor(Math.random() * 2)],
          };
        }

        return ref.child("players/" + open).transaction(function (current) {
          if (current) return current;
          return playerPayload(player);
        }).then(function (result) {
          if (!result.committed) throw new Error("Slot already taken");
          return ref.child("game").transaction(function (game) {
            if (!game) return game;
            if (open === "player4" && game.stage === "lobby") {
              if (game.team_assignment_method === "random") {
                game.teams = randomTeams;
                game.team_assignment_method = "random";
                game.captains = randomCaptains;
                game.stage = "toss_1";
                game.turn = game.captains.teamX;
              } else {
                game.stage = "team_setup";
                game.turn = "player1";
              }
            }
            return game;
          }).then(function () {
            return ref.child("meta/status").set(open === "player4" ? "playing" : "waiting");
          }).then(function () {
            return open;
          });
        });
      });
    });
  }

  function joinSlot(roomId, slot, player) {
    return waitForAuth().then(function () {
      var ref = roomRef(roomId);
      return ref.child("meta").once("value").then(function (snap) {
        var meta = snap.val();
        if (meta && meta.status === "terminated") {
          throw new Error("Room has been terminated");
        }
        // Try the slot transaction with retries on contention
        var tries = 0;
        function tryTx() {
          tries++;
          return ref.child("players/" + slot).transaction(function (current) {
            if (current != null) return current;
            return playerPayload(player);
          }).then(function (result) {
            if (!result) throw new Error("Transaction failed");
            if (!result.committed) {
              if (tries < 4) {
                return new Promise(function (resolve) { setTimeout(resolve, 120 + Math.random() * 200); }).then(tryTx);
              }
              throw new Error("Slot already taken");
            }
            if (!result.snapshot || !result.snapshot.exists()) {
              throw new Error("Slot write did not persist");
            }
            return ref.child("players").once("value").then(function (snap2) {
              var players = snap2.val() || {};
              var count = Mp2Core.SLOTS.filter(function (s) { return players[s] != null; }).length;
              if (count < 4) {
                return slot;
              }
              return ref.child("game").transaction(function (game) {
                if (!game || game.stage !== "lobby") return game;
                game.teams = {
                  teamX: ["player1", "player2"],
                  teamY: ["player3", "player4"]
                };
                game.team_assignment_method = "slot";
                game.captains = {
                  teamX: "player1",
                  teamY: "player3"
                };
                game.stage = "toss_1";
                game.turn = "player1";
                return game;
              }).then(function () {
                return ref.child("meta/status").set("playing");
              }).then(function () {
                return slot;
              });
            });
          }).catch(function (err) {
            // Surface Firebase errors with details
            try { console.error("joinSlot error (room=%s, slot=%s):", roomId, slot, err); } catch (e) {}
            throw err;
          });
        }
        return tryTx();
      });
    });
  }

  function commitGame(roomId, mutator) {
    return waitForAuth().then(function () {
      var aborted = false;
      return roomRef(roomId).child("game").transaction(function (current) {
        if (!current) return current;
        var next = mutator(JSON.parse(JSON.stringify(current)));
        if (next == null) {
          aborted = true;
          return;
        }
        return next;
      }).then(function (result) {
        if (aborted) throw new Error("Game mutation aborted");
        var game = result.snapshot.val();
        if (game && (game.stage === "finished" || game.stage === "abandoned")) {
          var status = game.stage === "finished" ? "finished" : "abandoned";
          var cleanupAt = Date.now() + 120000;
          return roomRef(roomId).child("meta").update({ status: status, cleanupAt: cleanupAt }).then(function () {
            return game;
          });
        }
        return game;
      });
    });
  }

  function enforceBallTimeout(roomId) {
    return commitGame(roomId, function (game) {
      if (!game || (game.stage !== "gameplay_1" && game.stage !== "gameplay_2")) return game;
      if (!game.ball_deadline) return game;
      return Mp2Core.resolveBallTimeout(game);
    });
  }

  function listenRoom(roomId, callback) {
    return waitForAuth().then(function () {
      return roomRef(roomId).on("value", function (snap) {
        callback(snap.val());
      });
    });
  }

  function setPlayerOnline(roomId, slot, online) {
    return waitForAuth().then(function () {
      return roomRef(roomId).child("players/" + slot + "/online").set(!!online);
    });
  }

  function registerDisconnect(roomId, slot) {
    return waitForAuth().then(function () {
      try {
        return roomRef(roomId).child("players/" + slot + "/online").onDisconnect().set(false);
      } catch (err) {
        return Promise.resolve();
      }
    });
  }

  function terminateRoom(roomId, userId) {
    return waitForAuth().then(function () {
      var ref = roomRef(roomId);
      return ref.child("meta").transaction(function (meta) {
        if (!meta) return meta;
        if (meta.status === "terminated" || meta.status === "playing" || meta.status === "finished" || meta.status === "abandoned") return meta;
        meta.status = "terminated";
        meta.terminatedByUserId = userId;
        meta.terminatedAt = firebase.database.ServerValue.TIMESTAMP;
        meta.cleanupAt = Date.now() + 120000;
        return meta;
      });
    });
  }

  function requestGiveUp(roomId, slot) {
    return waitForAuth().then(function () {
      return commitGame(roomId, function (game) {
        if (!game) return game;
        if (["lobby", "team_setup", "toss_1", "toss_2", "toss_3"].indexOf(game.stage) !== -1) return game;
        var team = Mp2Core.teamForSlot(game, slot);
        if (!team) return game;
        if (!game.give_up_requests) game.give_up_requests = { teamX: {}, teamY: {} };
        if (!game.give_up_requests[team]) game.give_up_requests[team] = {};
        if (game.give_up_requests[team][slot]) return game;
        game.give_up_requests[team][slot] = true;
        var teammates = (game.teams && game.teams[team]) || [];
        if (teammates.length === 2 && teammates.every(function (s) { return game.give_up_requests[team][s]; })) {
          return Mp2Core.giveUpMatch(game, slot);
        }
        return game;
      });
    });
  }

  function abandonRoom(roomId, slot, reason) {
    return waitForAuth().then(function () {
      return commitGame(roomId, function (game) {
        return Mp2Core.abandonMatch(game, slot, reason);
      }).then(function (game) {
        return roomRef(roomId).child("meta/status").set("abandoned").then(function () {
          return game;
        });
      });
    });
  }

  function submitBallPick(roomId, slot, role, num) {
    return waitForAuth().then(function () {
      return roomRef(roomId).child("game").transaction(function (current) {
        if (!current) return current;
        var game = JSON.parse(JSON.stringify(current));
        game = Mp2Core.recordBallPick(game, slot, role, num);
        // Previously processed ball here; now defer to enforceBallTimeout.
        return game;
      }).then(function (result) {
        return result.snapshot.val();
      });
    });
  }

  function declineGiveUp(roomId, slot) {
    return waitForAuth().then(function () {
      return commitGame(roomId, function (game) {
        if (!game) return game;
        if (["lobby", "team_setup", "toss_1", "toss_2", "toss_3"].indexOf(game.stage) !== -1) return game;
        return Mp2Core.declineGiveUp(game, slot);
      });
    });
  }

  global.Mp2Firebase = {
    init: init,
    genRoomId: genRoomId,
    roomExists: roomExists,
    roomRef: roomRef,
    createRoom: createRoom,
    joinRoom: joinRoom,
    joinSlot: joinSlot,
    commitGame: commitGame,
    enforceBallTimeout: enforceBallTimeout,
    listenRoom: listenRoom,
    setPlayerOnline: setPlayerOnline,
    registerDisconnect: registerDisconnect,
    terminateRoom: terminateRoom,
    requestGiveUp: requestGiveUp,
    declineGiveUp: declineGiveUp,
    abandonRoom: abandonRoom,
    submitBallPick: submitBallPick,
  };
})(window);
