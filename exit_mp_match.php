<?php
session_start();
$room = $_SESSION["mp_room"] ?? "";
$slot = $_SESSION["mp_slot"] ?? "";
unset($_SESSION["mp_room"], $_SESSION["mp_slot"]);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Leaving match…</title>
</head>
<body>
<p style="text-align:center;font-family:sans-serif;margin-top:40vh;color:#9ca3af;">Leaving match…</p>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp2_core.js"></script>
<script src="assets/JS/mp2_firebase.js"></script>
<script>
(function () {
    var room = <?php echo json_encode($room); ?>;
    var slot = <?php echo json_encode($slot); ?>;
    function go() { window.location.href = "game.php"; }
    if (!room || !slot || !Mp2Firebase.init()) { go(); return; }
    Mp2Firebase.abandonRoom(room, slot, "exit").catch(function () {}).finally(go);
})();
</script>
</body>
</html>
