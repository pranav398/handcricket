<?php
session_start();

    if (!isset($_SESSION["user_id"])) {
        header("Location: login.php");
        exit;
    }

    // values from session (you said you're storing them at login)
    $username = $_SESSION["username"];
    $total = $_SESSION["total"] ?? 0;
    $wins = $_SESSION["wins"] ?? 0;

    $winRate = ($total > 0) ? round(($wins / $total) * 100) : 0;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Dashboard - HandCricket</title>
</head>
<body>

<?php include 'assets/includes/header.php'; ?>

<main class="main">

    <!-- HERO STYLE WELCOME -->
    <section class="section section-center">
        <p class="section-tag">PLAYER DASHBOARD</p>

        <h1 class="section-title">
            Welcome, <strong><?php echo htmlspecialchars($username); ?></strong>
        </h1>

        <p class="section-body">
            Track your performance and continue your hand cricket journey.
        </p>
    </section>

    <!-- STATS -->
    <section class="section">
        <div class="pricing-grid">
            <div class="pricing-card">
                <p class="pricing-tier">Matches Played</p>
                <div class="metric-value"><?php echo $total; ?></div>
            </div>

            <div class="pricing-card">
                <p class="pricing-tier">Wins</p>
                <div class="metric-value"><?php echo $wins; ?></div>
            </div>

            <div class="pricing-card">
                <p class="pricing-tier">Losses</p>
                <div class="metric-value"><?php echo $total - $wins; ?></div>
            </div>

            <div class="pricing-card featured">
                <p class="pricing-tier">Win Rate</p>
                <div class="metric-value"><?php echo $winRate; ?><span>%</span></div>
            </div>
        </div>
    </section>

    <!-- ACTIONS -->
    <section class="section section-center">
        <a href="game.php" class="btn-primary">Play Now</a>
        <a href="rules.php" class="btn-secondary">View Rules</a>
    </section>

</main>
</body>
</html>