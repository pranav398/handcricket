<?php
    session_start();
    
    if (isset($_SESSION["user_id"])) {
        header("Location: dashboard.php");
        exit;
    }
?>  

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - HandCricket</title>
</head>
<body>
    <?php include 'assets/includes/header.php'; ?>
    <section class="hero" id="hero">
        <div class="hero-grid"></div>
        <div class="hero-badge">
            <div class="hero-badge-dot"></div>
            <span>Now in Public Beta</span>
        </div>
        <h1>Cricket<br><em>Reimagined</em></h1>
        <p class="hero-sub">
        Play hand cricket online with friends, challenge real opponents,
        track your stats, and experience the classic game in a completely modern way.
        </p>
        <div class="hero-ctas">
            <a href="game.php" class="btn-primary">Start Now</a>
            <a href="rules.php" class="btn-secondary">See How It Works</a>
        </div>
    </section>
</body>
</html>