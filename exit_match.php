<?php
    session_start();
    unset($_SESSION["match"]);
    header("Location: game.php");
    exit;
?>