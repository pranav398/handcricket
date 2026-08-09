<?php
session_start();
if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit;
}
// Clear any lingering multiplayer match session variables when creating a new match
unset($_SESSION["mp_room"], $_SESSION["mp_slot"]);
$username = $_SESSION["username"];
$userId = (int) $_SESSION["user_id"];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create 2 vs 2 - HandCricket</title>
</head>
<body>
<?php include "assets/includes/header.php"; ?>

<main class="main">
    <section class="section section-center">
        <div class="section-tag">Team Multiplayer</div>
        <h2 class="section-title">Create <strong>2 vs 2 Room</strong></h2>
        <p class="section-body">Set match rules. Four players join, then teams and captains are decided.</p>
        <div class="silk-divider" style="margin:40px auto;"></div>

        <div class="pricing-card" style="max-width:520px; margin:0 auto;">
            <div id="mp2CreateMsg" class="match-detail" style="display:none;margin-bottom:16px;"></div>
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
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Teaming Mode</label>
                    <select id="teamingMode" class="game-input" required>
                        <option value="random">Random Teaming</option>
                        <option value="slot">Slot Wise Teaming</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="width:100%;" id="createBtn">Create 2 vs 2 Room</button>
            </form>
            <div id="roomCreated" class="room-created-block" style="display:none;">
                <p class="match-kicker">ROOM CODE</p>
                <p class="break-stat-value room-code-display" id="roomCodeDisplay"></p>
                <p class="match-detail"><strong>Mode:</strong> 2 vs 2 · <strong>Overs:</strong> <span id="roomOvers"></span> · <strong>Powerplay:</strong> <span id="roomPowerplay"></span></p>
                <p class="match-hint room-wait-hint">Waiting for three more players...</p>
                <a href="mp_2v2_match.php" class="btn-primary room-join-btn">Enter Room</a>
            </div>
        </div>
    </section>
</main>

<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp2_core.js?v=1"></script>
<script src="assets/JS/mp2_firebase.js?v=8"></script>
<script>
(function () {
    var boot = { username: <?php echo json_encode($username); ?>, userId: <?php echo (int) $userId; ?> };
    var msg = document.getElementById("mp2CreateMsg");
    var form = document.getElementById("createRoomForm");
    var created = document.getElementById("roomCreated");
    var codeEl = document.getElementById("roomCodeDisplay");
    var oversInput = document.getElementById("mpOvers");
    var powerplayInput = document.getElementById("mpPowerplay");

    function showErr(t) {
        msg.style.display = "block";
        msg.style.color = "#f87171";
        msg.textContent = t;
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

    if (!Mp2Firebase.init()) {
        showErr("Firebase not configured.");
        return;
    }

    form.noValidate = true;
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        msg.style.display = "none";
        var overs = Math.max(1, Math.min(20, parseInt(oversInput.value, 10)));
        var powerplay = parseInt(powerplayInput.value, 10);
        if (!Number.isFinite(powerplay)) powerplay = 0;
        if (powerplay < 0 || powerplay > overs) {
            showErr("Powerplay overs cannot be greater than total overs.");
            return;
        }
        var wickets = Math.max(1, Math.min(10, parseInt(document.getElementById("mpWickets").value, 10)));
        var cooldown = parseInt(document.getElementById("mpCooldown").value, 10);
        if (!Number.isFinite(cooldown)) cooldown = 60;
        cooldown = Math.max(15, Math.min(300, cooldown));
        var teamingMode = document.getElementById("teamingMode").value;
        var btn = document.getElementById("createBtn");
        btn.disabled = true;

        function tryCreate(attempt) {
            var id = Mp2Firebase.genRoomId();
            Mp2Firebase.roomExists(id).then(function (exists) {
                if (exists && attempt < 8) return tryCreate(attempt + 1);
                var game = Mp2Core.createGame(overs, wickets, cooldown, powerplay, teamingMode);
                return Mp2Firebase.createRoom(id, boot, game).then(function () {
                    if (teamingMode === "slot") {
                        form.style.display = "none";
                        created.style.display = "block";
                        codeEl.textContent = id;
                        document.getElementById("roomOvers").textContent = overs;
                        document.getElementById("roomPowerplay").textContent = powerplay;

                        var joinBtn = created.querySelector(".room-join-btn");
                        joinBtn.href = "join_2v2_match.php?room=" + id;
                        // Automatically redirect creator to join page for slot selection
                        window.location.href = joinBtn.href;

                        var hintEl = created.querySelector(".room-wait-hint");
                        hintEl.textContent = "Choose your slot in the room to begin.";
                    } else {
                        return fetch("mp_api.php", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ room: id, slot: "player1" }),
                        }).then(function (r) { return r.json(); }).then(function (res) {
                            if (!res.ok) throw new Error("Session error");
                            form.style.display = "none";
                            created.style.display = "block";
                            codeEl.textContent = id;
                            document.getElementById("roomOvers").textContent = overs;
                            document.getElementById("roomPowerplay").textContent = powerplay;

                            var joinBtn = created.querySelector(".room-join-btn");
                            joinBtn.href = "mp_2v2_match.php";
                            joinBtn.textContent = "Enter Room";

                            var hintEl = created.querySelector(".room-wait-hint");
                            hintEl.textContent = "Waiting for three more players...";
                        });
                    }
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
