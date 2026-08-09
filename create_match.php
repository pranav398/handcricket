<?php
session_start();
if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit;
}
$username = $_SESSION["username"];
$userId = (int) $_SESSION["user_id"];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create Match - HandCricket</title>
</head>
<body>
<?php include "assets/includes/header.php"; ?>

<main class="main">
    <section class="section section-center">
        <div class="section-tag">Multiplayer</div>
        <h2 class="section-title">Create <strong>Private Room</strong></h2>
        <p class="section-body">Set match rules. Share the 4-letter code with your friend.</p>
        <div class="silk-divider" style="margin:40px auto;"></div>

        <div class="pricing-card" style="max-width:520px; margin:0 auto;">
            <div id="mpCreateMsg" class="match-detail" style="display:none;margin-bottom:16px;"></div>
            <form id="createRoomForm">
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Overs (1 - 20)</label>
                    <input type="number" id="mpOvers" min="1" max="20" value="5" required class="game-input">
                </div>
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Powerplay Overs (0 - total overs)</label>
                    <input type="number" id="mpPowerplay" min="0" value="0" required class="game-input">
                </div>
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Wickets (1 - 10)</label>
                    <input type="number" id="mpWickets" min="1" max="10" value="3" required class="game-input">
                </div>
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Cooldown Timer (secs) (15 - 300)</label>
                    <input type="number" id="mpCooldown" min="15" max="300" step="1" value="60" required class="game-input">
                </div>
                <button type="submit" class="btn-primary" style="width:100%;" id="createBtn">Create Room</button>
            </form>
            <div id="roomCreated" class="room-created-block" style="display:none;">
                <p class="match-kicker">ROOM CODE</p>
                <p class="break-stat-value room-code-display" id="roomCodeDisplay"></p>
                <p class="match-detail"><strong>Overs:</strong> <span id="roomOvers"></span> · <strong>Wickets:</strong> <span id="roomWickets"></span> · <strong>Cooldown:</strong> <span id="roomCooldown"></span>s</p>
                <p class="match-hint room-wait-hint">Waiting for opponent to join…</p>
                <a href="#" id="enterRoomBtn" class="btn-primary room-join-btn">Join Room</a>
                <button type="button" id="terminateRoomBtn" class="btn-secondary" style="display:block;width:100%;margin-top:14px;">Terminate Room</button>
            </div>
        </div>
    </section>
</main>

<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp_core.js?v=5"></script>
<script src="assets/JS/mp_firebase.js?v=4"></script>
<script>
(function () {
    var boot = { username: <?php echo json_encode($username); ?>, userId: <?php echo (int) $userId; ?> };
    var msg = document.getElementById("mpCreateMsg");
    var form = document.getElementById("createRoomForm");
    var created = document.getElementById("roomCreated");
    var codeEl = document.getElementById("roomCodeDisplay");
    var enterBtn = document.getElementById("enterRoomBtn");
    var roomId = null;
    var oversInput = document.getElementById("mpOvers");
    var powerplayInput = document.getElementById("mpPowerplay");

    function showErr(t) {
        msg.style.display = "block";
        msg.style.color = "#f87171";
        msg.textContent = t;
    }

    if (!MpFirebase.init()) {
        showErr("Firebase not configured. Copy assets/JS/firebase_config.sample.js to firebase_config.js and add your keys, including databaseURL.");
        return;
    }

    function syncPowerplayLimit() {
        var overs = Math.max(1, Math.min(20, parseInt(oversInput.value, 10) || 1));
        powerplayInput.max = String(overs);
    }

    function showPowerplayMessage() {
        var overs = parseInt(oversInput.value, 10);
        var powerplay = parseInt(powerplayInput.value, 10);
        if (Number.isFinite(overs) && Number.isFinite(powerplay) && powerplay > overs) {
            showErr("Powerplay overs cannot be greater than total overs.");
            return false;
        }
        msg.style.display = "none";
        return true;
    }

    oversInput.addEventListener("input", function () {
        syncPowerplayLimit();
        showPowerplayMessage();
    });
    powerplayInput.addEventListener("input", showPowerplayMessage);
    syncPowerplayLimit();

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        msg.style.display = "none";
        var overs = Math.max(1, Math.min(20, parseInt(document.getElementById("mpOvers").value, 10)));
        var powerplay = parseInt(document.getElementById("mpPowerplay").value, 10);
        if (!Number.isFinite(powerplay)) powerplay = 0;
        if (powerplay < 0 || powerplay > overs) {
            showErr("Powerplay overs cannot be greater than total overs.");
            return;
        }
        var wickets = Math.max(1, Math.min(10, parseInt(document.getElementById("mpWickets").value, 10)));
        var cooldown = parseInt(document.getElementById("mpCooldown").value, 10);
        if (!Number.isFinite(cooldown)) cooldown = 60;
        cooldown = Math.max(15, Math.min(300, cooldown));
        var btn = document.getElementById("createBtn");
        btn.disabled = true;

        function tryCreate(attempt) {
            var id = MpFirebase.genRoomId();
            MpFirebase.roomExists(id).then(function (exists) {
                if (exists && attempt < 8) return tryCreate(attempt + 1);
                var game = MpCore.createLobbyGame(overs, wickets, cooldown, powerplay);
                return MpFirebase.createRoom(id, boot, overs, wickets, game).then(function () {
                    return fetch("mp_api.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ room: id, slot: "player1" }),
                    }).then(function (r) { return r.json(); }).then(function (res) {
                        if (!res.ok) throw new Error("Session error");
                        roomId = id;
                        form.style.display = "none";
                        created.style.display = "block";
                        codeEl.textContent = id;
                        document.getElementById("roomOvers").textContent = overs;
                        if (document.getElementById("roomPowerplay")) {
                            document.getElementById("roomPowerplay").textContent = powerplay;
                        }
                        document.getElementById("roomWickets").textContent = wickets;
                        document.getElementById("roomCooldown").textContent = cooldown;
                        enterBtn.href = "mp_match.php";
                        enterBtn.textContent = "Join Room";
                        MpFirebase.listenRoom(id, function (room) {
                            if (room && room.players && room.players.player2) {
                                window.location.href = "mp_match.php";
                            }
                        });
                        var terminateButton = document.getElementById("terminateRoomBtn");
                        terminateButton.addEventListener("click", function () {
                            terminateButton.disabled = true;
                            MpFirebase.deleteRoom(id)
                                .then(function () {
                                    window.location.href = "create_match.php";
                                })
                                .catch(function (err) {
                                    showErr(err.message || "Could not terminate room");
                                })
                                .finally(function () {
                                    terminateButton.disabled = false;
                                });
                        });
                    });
                });
            }).catch(function (err) {
                showErr(err.message || "Could not create room");
                btn.disabled = false;
            });
        }
        tryCreate(0);
    });
})();
</script>
</body>
</html>
