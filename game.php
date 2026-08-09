<?php
    session_start();

    if (!isset($_SESSION["user_id"])) {
        header("Location: login.php");
        exit;
    }
    // Clear any lingering multiplayer match session variables when returning to game selection
    unset($_SESSION["mp_room"], $_SESSION["mp_slot"]);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Play - HandCricket</title>
</head>
<body>
    <?php include 'assets/includes/header.php'; ?>

    <div class="main">
        <section class="section section-center">
            <div class="section-tag">Game Mode</div>
            <h2 class="section-title">Choose <strong>How You Want to Play</strong></h2>
            <p class="section-body">Select a mode to start your hand cricket match.</p>
            <div class="silk-divider" style="margin:40px auto;"></div>
            <div class="pricing-grid game-mode-grid">
                <!-- VS COMPUTER -->
                <div class="pricing-card">
                    <div class="pricing-tier">Single Player</div>
                    <h3 style="margin-bottom:10px;">👤 vs Computer</h3>
                    <p class="pricing-desc">Play instantly against AI. No waiting. Perfect for practice matches.</p>
                    <a href="setup_cpu.php" class="btn-primary">Play Now</a>
                </div>
                <!-- VS FRIEND -->
                <div class="pricing-card featured">
                    <div class="pricing-badge">Popular</div>
                    <div class="pricing-tier">Multiplayer</div>
                    <div class="mode-highlight">1 vs 1</div>
                    <h3 style="margin-bottom:10px;">👥 Play with Friend</h3>
                    <p class="pricing-desc">Create a private room or join using a 4-character code.</p>
                    <a href="create_match.php" class="btn-primary" style="margin-bottom:12px;">Create Match</a>
                    <a href="join_match.php" class="btn-secondary">Join Match</a>

                </div>
                <!-- 2 VS 2 -->
                <div class="pricing-card featured">
                    <div class="pricing-tier">Team Mode</div>
                    <div class="mode-highlight mode-highlight-alt">2 vs 2</div>
                    <h3 style="margin-bottom:10px;">Team Match</h3>
                    <p class="pricing-desc">A squad-style mode for four players. Match rules and room flow will be added next.</p>
                    <a href="create_2v2_match.php" class="btn-primary" style="margin-bottom:12px;">Create 2 vs 2</a>
                    <a href="join_2v2_match.php" class="btn-secondary">Join 2 vs 2</a>
                </div>
                <!-- FUTURE -->
                <div class="pricing-card">
                    <div class="pricing-tier">Coming Soon</div>
                    <h3 style="margin-bottom:10px;">🏆 Tournament</h3>
                    <p class="pricing-desc">Compete in brackets, knockouts and leagues.</p>
                    <button class="btn-secondary" disabled>Locked</button>
                </div>
            </div>
        </section>
    </div>
</body>
</html>
