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
    <title>Join Match - HandCricket</title>
</head>
<body>
<?php include "assets/includes/header.php"; ?>

<main class="main">
    <section class="section section-center">
        <div class="section-tag">Multiplayer</div>
        <h2 class="section-title">Join <strong>Friend's Room</strong></h2>
        <p class="section-body">Enter the 4-character room code from your friend.</p>
        <div class="silk-divider" style="margin:40px auto;"></div>

        <div class="pricing-card" style="max-width:420px; margin:0 auto;">
            <div id="mpJoinMsg" class="match-detail" style="display:none;margin-bottom:16px;"></div>
            <form id="joinRoomForm">
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Room Code</label>
                    <input type="text" id="roomCode" maxlength="4" minlength="4" required
                           class="game-input" style="text-align:center;letter-spacing:0.35em;text-transform:uppercase;"
                           placeholder="ABCD" autocomplete="off">
                </div>
                <button type="submit" class="btn-primary" style="width:100%;">Join Match</button>
            </form>
            <a href="create_match.php" class="btn-secondary" style="display:block;text-align:center;margin-top:16px;">Create Room Instead</a>
        </div>
    </section>
</main>

<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp_firebase.js"></script>
<script>
(function () {
    var boot = { username: <?php echo json_encode($username); ?>, userId: <?php echo (int) $userId; ?> };
    var msg = document.getElementById("mpJoinMsg");
    var input = document.getElementById("roomCode");

    function showErr(t) {
        msg.style.display = "block";
        msg.style.color = "#f87171";
        msg.textContent = t;
    }

    input.addEventListener("input", function () {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });

    if (!MpFirebase.init()) {
        showErr("Firebase not configured. Copy assets/JS/firebase_config.sample.js to firebase_config.js and add your keys, including databaseURL.");
        return;
    }

    document.getElementById("joinRoomForm").addEventListener("submit", function (e) {
        e.preventDefault();
        msg.style.display = "none";
        var code = input.value.trim().toUpperCase();
        if (code.length !== 4) {
            showErr("Enter a 4-character code.");
            return;
        }

        MpFirebase.roomExists(code).then(function (exists) {
            if (!exists) throw new Error("Room not found");
            return MpFirebase.roomRef(code).child("players/player1/userId").once("value").then(function (snap) {
                if (snap.val() === boot.userId) throw new Error("You created this room — use Join Room on the create page");
                return MpFirebase.joinRoom(code, boot);
            });
        }).then(function () {
            return fetch("mp_api.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room: code, slot: "player2" }),
            });
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (!res.ok) throw new Error("Session error");
            window.location.href = "mp_match.php";
        }).catch(function (err) {
            showErr(err.message || "Could not join room");
        });
    });
})();
</script>
</body>
</html>
