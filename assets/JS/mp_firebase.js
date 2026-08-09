/**
 * Firebase Realtime Database helpers for multiplayer rooms.
 */
(function (global) {
  "use strict";

  var db = null;
  var ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function init() {
    if (!global.FIREBASE_CONFIG || !global.FIREBASE_CONFIG.databaseURL) {
      return false;
    }
    if (!global.firebase) return false;
    if (!firebase.apps.length) {
      firebase.initializeApp(global.FIREBASE_CONFIG);
    }
    if (firebase.auth) {
      var auth = firebase.auth();
      if (!auth.currentUser) {
        auth.signInAnonymously().catch(function () {
          // Permit auth to establish in the background; database rules may require auth.
        });
      }
    }
    db = firebase.database();
    return true;
  }

  function roomRef(roomId) {
    return db.ref("rooms/" + roomId);
  }

  function genRoomId() {
    var id = "";
    for (var i = 0; i < 4; i++) {
      id += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
    }
    return id;
  }

  function roomExists(roomId) {
    return roomRef(roomId)
      .child("meta")
      .once("value")
      .then(function (snap) {
        return snap.exists();
      });
  }

  function createRoom(roomId, hostPlayer, overs, wickets, gameState) {
    var players = {};
    var cooldownSeconds = 60;
    if (gameState && gameState.cooldown_seconds != null) {
      cooldownSeconds = gameState.cooldown_seconds;
    }
    players.player1 = {
      userId: hostPlayer.userId,
      username: hostPlayer.username,
      online: true,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
    };
    return roomRef(roomId).set({
      meta: {
        overs: overs,
        powerplay_overs: gameState && gameState.powerplay_overs != null ? gameState.powerplay_overs : 0,
        wickets: wickets,
        cooldown_seconds: cooldownSeconds,
        status: "waiting",
        created: firebase.database.ServerValue.TIMESTAMP,
      },
      players: players,
      game: gameState,
    });
  }

  function joinRoom(roomId, guestPlayer) {
    return roomRef(roomId)
      .child("players/player2")
      .transaction(function (current) {
        if (current !== null) return;
        return {
          userId: guestPlayer.userId,
          username: guestPlayer.username,
          online: true,
          joinedAt: firebase.database.ServerValue.TIMESTAMP,
        };
      })
      .then(function (result) {
        if (!result.committed) {
          throw new Error("Room is full");
        }
        return roomRef(roomId).child("meta/status").set("playing");
      })
      .then(function () {
        return roomRef(roomId).child("game").transaction(function (g) {
          if (!g || g.stage !== "lobby") return g;
          g.stage = "toss_1";
          g.turn = "player1";
          if (!g.names) g.names = {};
          return g;
        });
      });
  }

  function updateGame(roomId, game) {
    return roomRef(roomId).child("game").set(game);
  }

  function patchGame(roomId, partial) {
    return roomRef(roomId).child("game").update(partial);
  }

  function commitGame(roomId, mutator) {
    return roomRef(roomId)
      .child("game")
      .once("value")
      .then(function (snap) {
        var current = snap.val();
        if (!current) {
          throw new Error("Game state missing");
        }
        var next = mutator(JSON.parse(JSON.stringify(current)));
        if (!next || typeof next !== "object") {
          throw new Error("Invalid game update");
        }
        return roomRef(roomId).child("game").set(next).then(function () {
          return next;
        });
      });
  }

  function sanitizeRoom(room, viewerSlot) {
    if (!room) return null;
    var game = room.game || {};
    var pickInfo = null;
    var inn = MpCore.getInnings(game, game.current_innings);
    if (inn && viewerSlot) {
      var secrets = room.secret_picks || {};
      var bat = MpCore.battingSlot(inn);
      var bowl = MpCore.bowlingSlot(inn);
      var batPick = secrets[bat];
      var bowlPick = secrets[bowl];
      var bothReady = batPick != null && bowlPick != null;
      var storedReveal = game.ball_reveal || null;
      pickInfo = {
        myPick: secrets[viewerSlot] != null ? secrets[viewerSlot] : null,
        oppBatReady: batPick != null,
        oppBowlReady: bowlPick != null,
        revealed: bothReady
          ? { bat: batPick, bowl: bowlPick }
          : storedReveal
            ? { bat: storedReveal.bat, bowl: storedReveal.bowl }
            : null,
      };
    }
    return {
      meta: room.meta,
      players: room.players,
      game: room.game,
      pickInfo: pickInfo,
    };
  }

  function listenRoom(roomId, viewerSlot, callback) {
    if (typeof viewerSlot === "function") {
      callback = viewerSlot;
      viewerSlot = null;
    }
    return roomRef(roomId).on("value", function (snap) {
      callback(sanitizeRoom(snap.val(), viewerSlot));
    });
  }

  function unlistenRoom(roomId) {
    roomRef(roomId).off();
  }

  function setPlayerOnline(roomId, slot, online) {
    return roomRef(roomId)
      .child("players/" + slot + "/online")
      .set(!!online);
  }

  function abandonRoom(roomId, leaverSlot, reason) {
    return commitGame(roomId, function (game) {
      return MpCore.abandonMatch(game, leaverSlot, reason);
    }).then(function () {
      return roomRef(roomId).child("meta/status").set("cancelled");
    });
  }

  function registerDisconnect(roomId, slot) {
    try {
      return roomRef(roomId)
        .child("players/" + slot + "/online")
        .onDisconnect()
        .set(false);
    } catch (err) {
      return Promise.resolve();
    }
  }

  function deleteRoom(roomId) {
    return roomRef(roomId).remove();
  }

  function tryResolveBall(roomId) {
    var ref = roomRef(roomId);
    return ref.once("value").then(function (snap) {
      var room = snap.val();
      if (!room || !room.game) return;
      var game = room.game;
      if (game.stage !== "gameplay_1" && game.stage !== "gameplay_2") {
        return ref.child("secret_picks").remove();
      }
      var inn = MpCore.getInnings(game, game.current_innings);
      if (!inn) return;
      var secrets = room.secret_picks || {};
      var bat = MpCore.battingSlot(inn);
      var bowl = MpCore.bowlingSlot(inn);
      if (secrets[bat] == null || secrets[bowl] == null) return;

      var batNum = secrets[bat];
      var bowlNum = secrets[bowl];
      return ref
        .child("game/ball_resolve_lock")
        .transaction(function (cur) {
          if (cur) return;
          return 1;
        })
        .then(function (tr) {
          if (!tr.committed) return;
          return commitGame(roomId, function (g) {
            if (g.stage !== "gameplay_1" && g.stage !== "gameplay_2") return g;
            var inn2 = MpCore.getInnings(g, g.current_innings);
            if (!inn2) return g;
            var logLen = inn2.ball_log ? inn2.ball_log.length : 0;
            var ballId = String(g.current_innings) + "-" + String(logLen);
            if (g._last_resolved_ball_id === ballId) return g;
            g._last_resolved_ball_id = ballId;
            return MpCore.processBall(g, batNum, bowlNum);
          })
            .then(function () {
              return ref.child("secret_picks").remove();
            })
            .finally(function () {
              return ref.child("game/ball_resolve_lock").remove();
            });
        });
    });
  }

  function submitBallPick(roomId, slot, role, num) {
    var ref = roomRef(roomId);
    return MpFirebase.commitGame(roomId, function (game) {
      return MpCore.recordBallPick(game, slot, role, num);
    })
      .then(function (game) {
        var inn = MpCore.getInnings(game, game.current_innings);
        if (!inn || !MpCore.isValidBallNumber(game, inn, num)) {
          throw new Error("Pick is outside the allowed range");
        }
        return ref.child("secret_picks/" + slot).transaction(function (current) {
          if (current != null) return;
          return num;
        });
      })
      .then(function () {
        return tryResolveBall(roomId);
      });
  }

  global.MpFirebase = {
    init: init,
    genRoomId: genRoomId,
    roomExists: roomExists,
    createRoom: createRoom,
    joinRoom: joinRoom,
    updateGame: updateGame,
    patchGame: patchGame,
    commitGame: commitGame,
    listenRoom: listenRoom,
    unlistenRoom: unlistenRoom,
    setPlayerOnline: setPlayerOnline,
    registerDisconnect: registerDisconnect,
    abandonRoom: abandonRoom,
    submitBallPick: submitBallPick,
    roomRef: roomRef,
    deleteRoom: deleteRoom,
  };
})(window);
