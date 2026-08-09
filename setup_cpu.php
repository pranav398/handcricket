<?php
    session_start();

    if (!isset($_SESSION["user_id"])) {
        header("Location: login.php");
        exit;
    }

    $setupError = $_SESSION["setup_cpu_error"] ?? "";
    unset($_SESSION["setup_cpu_error"]);
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

    <div class="main">
        <section class="section section-center">
            <div class="section-tag">Single Player</div>
            <h2 class="section-title">Setup <strong>CPU Match</strong></h2>
            <p class="section-body">Choose overs and wickets before starting the match.</p>
            <div class="silk-divider" style="margin:40px auto;"></div>

            <div class="pricing-card" style="max-width:520px; margin:0 auto;">
                <?php if ($setupError): ?>
                    <div id="cpuSetupMsg" class="match-detail" style="color:#f87171;margin-bottom:16px;"><?php echo htmlspecialchars($setupError, ENT_QUOTES, "UTF-8"); ?></div>
                <?php else: ?>
                    <div id="cpuSetupMsg" class="match-detail" style="display:none;color:#f87171;margin-bottom:16px;"></div>
                <?php endif; ?>
                <form method="POST" action="cpu_match.php" id="cpuSetupForm">
                    <div style="margin-bottom:30px;">
                        <div class="stepper-label">Overs (1 - 20)</div>
                        <input type="number" name="overs" id="cpuOvers" min="1" max="20" value="5" required class="game-input">
                    </div>
                    <div style="margin-bottom:30px;">
                        <div class="stepper-label">Powerplay Overs (0 - total overs)</div>
                        <input type="number" name="powerplay" id="cpuPowerplay" min="0" value="0" required class="game-input">
                    </div>
                    <div style="margin-bottom:30px;">
                        <div class="stepper-label">Wickets (1 - 10)</div>
                        <input type="number" name="wickets" min="1" max="10" value="3" required class="game-input">
                    </div>
                    <div style="margin-bottom:40px;">
                        <div class="stepper-label">Cooldown timer (seconds)</div>
                        <input type="number" name="cooldown_seconds" min="15" max="300" value="60" required class="game-input">
                        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Set how long each player has to choose a number each ball.</p>
                    </div>
                    <button type="submit" class="btn-primary" style="width:100%;">Start Match</button>
                </form>
            </div>
        </section>
    </div>

    <script>
        const cpuSetupForm = document.getElementById("cpuSetupForm");
        const cpuSetupMsg = document.getElementById("cpuSetupMsg");
        const cpuOvers = document.getElementById("cpuOvers");
        const cpuPowerplay = document.getElementById("cpuPowerplay");

        function syncCpuPowerplayLimit() {
            const overs = Math.max(1, Math.min(20, parseInt(cpuOvers.value, 10) || 1));
            cpuPowerplay.max = String(overs);
        }

        function showCpuPowerplayMessage() {
            const overs = parseInt(cpuOvers.value, 10);
            const powerplay = parseInt(cpuPowerplay.value, 10);
            if (Number.isFinite(overs) && Number.isFinite(powerplay) && powerplay > overs) {
                cpuSetupMsg.style.display = "block";
                cpuSetupMsg.textContent = "Powerplay overs cannot be greater than total overs.";
                return false;
            }
            cpuSetupMsg.style.display = "none";
            return true;
        }

        cpuOvers.addEventListener("input", function () {
            syncCpuPowerplayLimit();
            showCpuPowerplayMessage();
        });
        cpuPowerplay.addEventListener("input", showCpuPowerplayMessage);
        cpuSetupForm.addEventListener("submit", function (e) {
            syncCpuPowerplayLimit();
            if (!showCpuPowerplayMessage()) {
                e.preventDefault();
            }
        });
        syncCpuPowerplayLimit();

        let limits = {
            overs: { min: 1, max: 20, value: 5 },
            wickets: { min: 1, max: 10, value: 3 }
        };

        function changeValue(type, delta){
            let obj = limits[type];

            obj.value += delta;

            if(obj.value < obj.min) obj.value = obj.min;
            if(obj.value > obj.max) obj.value = obj.max;

            document.getElementById(type + "Value").innerText = obj.value;
            document.getElementById(type + "Input").value = obj.value;
        }
    </script>
</body>
</html>
