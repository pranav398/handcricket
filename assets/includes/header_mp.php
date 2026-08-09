<?php
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
?>

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel=" icon" href="assets/images/logo.png">
    <link rel="stylesheet" href="assets/CSS/header.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>

<svg class="grain" width="100%" height="100%">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="5" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <rect width="100%" height="100%" filter="url(#n)"/>
</svg>

<div class="atmosphere"></div>

<nav class="top-nav" id="topNav">
    <a href="#" class="nav-brand">Hand<span>Cricket</span></a>
    <ul class="nav-links">
        <li><a id="mpNavUser"><?php echo htmlspecialchars($_SESSION["username"] ?? "Player", ENT_QUOTES, "UTF-8"); ?></a></li>
        <li><a id="mpNavRoom" style="letter-spacing:0.12em;"></a></li>
    </ul>
    <div class="nav-user nav-user-match">
        <button type="button" id="mpGiveUpBtn" class="nav-cta nav-cta-muted">Give Up</button>
        <button type="button" id="mpGiveUpMobile" class="match-giveup-mobile">Give Up</button>
    </div>
</nav>

<script src="assets/JS/header.js"></script>
