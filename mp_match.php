<?php
session_start();

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit;
}

if (empty($_SESSION["mp_room"]) || empty($_SESSION["mp_slot"])) {
    header("Location: game.php");
    exit;
}

$room = $_SESSION["mp_room"];
$slot = $_SESSION["mp_slot"];
$username = $_SESSION["username"] ?? "Player";
$userId = (int) $_SESSION["user_id"];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multiplayer Match - HandCricket</title>
</head>
<body class="match-body">
<?php include "assets/includes/header_mp.php"; ?>

<main class="match-main match-main-play" id="mpMain">
    <div id="mpApp">
        <section class="match-stage">
            <p class="match-kicker">MULTIPLAYER</p>
            <h1 class="match-title">Connecting…</h1>
            <p class="match-detail">Loading room <?php echo htmlspecialchars($room, ENT_QUOTES, "UTF-8"); ?></p>
        </section>
    </div>
</main>

<div id="scorebarWrap"></div>

<script>
window.MP_BOOT = <?php echo json_encode([
    "room"     => $room,
    "slot"     => $slot,
    "username" => $username,
    "userId"   => $userId,
], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
document.getElementById("mpNavRoom").textContent = "ROOM <?php echo htmlspecialchars($room, ENT_QUOTES, "UTF-8"); ?>";
</script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp_core.js?v=5"></script>
<script src="assets/JS/mp_firebase.js?v=4"></script>
<script src="assets/JS/mp_match.js?v=9"></script>
</body>
</html>
