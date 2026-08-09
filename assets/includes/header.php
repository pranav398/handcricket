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
        <li><a href="index.php">Home</a></li>
        <li><a href="rules.php">Rules</a></li>
        <li><a href="game.php">Play</a></li>
        <li><a href="comments.php">Comments</a></li>
    </ul>

    <?php if (isset($_SESSION["user_id"])) { ?>
        <div class="nav-user">
            <a href="logout.php" class="nav-cta"><?php echo $_SESSION["username"]; ?> - Logout</a>
        </div>
    <?php } else { ?>
        <a href="login.php" class="nav-cta">Get Started</a>
    <?php } ?>

    <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
        <span class="toggle-bar"></span><span class="toggle-bar"></span>
    </button>
</nav>

<div class="mobile-menu" id="mobileMenu">
    <div class="mobile-menu-inner">
        <div class="mobile-menu-links">
            <a href="index.php" class="mobile-menu-link" data-index="01">Home</a>
            <a href="rules.php" class="mobile-menu-link" data-index="02">Rules</a>
            <a href="game.php" class="mobile-menu-link" data-index="03">Play</a>
            <a href="comments.php" class="mobile-menu-link" data-index="04">Comments</a>

            <?php if (isset($_SESSION["user_id"])) { ?>
                <a href="logout.php" class="mobile-menu-link" data-index="07"><?php echo $_SESSION["username"]; ?> - Logout</a>
            <?php } else { ?>
                <a href="login.php" class="mobile-menu-link" data-index="07">Get Started</a>
            <?php } ?>
            
        </div>
    </div>
</div>

<script src="assets/JS/header.js"></script>