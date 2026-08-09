<?php
session_start();

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit;
}

include "assets/includes/db.php";
require_once "assets/includes/cpu_match_logic.php";

// ── POST actions ─────────────────────────────────────────────────────

if ($_SERVER["REQUEST_METHOD"] === "POST") {

    if (isset($_POST["overs"], $_POST["wickets"], $_POST["cooldown_seconds"])) {
        $overs            = max(1, min(20, (int) $_POST["overs"]));
        $wickets          = max(1, min(10, (int) $_POST["wickets"]));
        $cooldownSeconds  = max(15, min(300, (int) $_POST["cooldown_seconds"]));
        $powerplayOvers   = isset($_POST["powerplay"]) ? (int) $_POST["powerplay"] : 0;
        if ($powerplayOvers < 0 || $powerplayOvers > $overs) {
            $_SESSION["setup_cpu_error"] = "Powerplay overs must be between 0 and total overs.";
            header("Location: setup_cpu.php");
            exit;
        }
        $_SESSION["match"] = initCpuMatch($overs, $wickets, $_SESSION["username"], $powerplayOvers);
        $_SESSION["match"]["cooldown_seconds"] = $cooldownSeconds;
        header("Location: cpu_match.php");
        exit;
    }

    if (!isset($_SESSION["match"])) {
        header("Location: setup_cpu.php");
        exit;
    }

    $match = &$_SESSION["match"];
    ensureCpuCooldownState($match);
    if (cpuCooldownExpired($match)) {
        giveUpMatch($match);
        $_SESSION["match"] = $match;
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["toss_call"]) && $match["match_status"] === "toss_1") {
        $call = strtolower(trim($_POST["toss_call"]));
        if (in_array($call, ["odd", "even"], true)) {
            $match["toss_call"]    = $call;
            $match["match_status"] = "toss_2";
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["toss_number"]) && $match["match_status"] === "toss_2") {
        $num = (int) $_POST["toss_number"];
        if ($num >= 0 && $num <= 6) {
            $cpuNum = random_int(0, 6);
            $sum    = $num + $cpuNum;
            $userWon = tossSumWinsForUser($match["toss_call"], $sum);
            $match["toss_num_p1"] = $num;
            $match["toss_num_p2"] = $cpuNum;
            $match["match_status"] = "toss_3";
            if ($userWon) {
                $match["toss_winner"] = "player_1";
            } else {
                $match["toss_winner"] = "player_2";
                $cpuRole = random_int(0, 1) ? "bat" : "bowl";
                $match["toss_role"] = $cpuRole;
                applyTossRoles($match, $cpuRole === "bat" ? "bowl" : "bat");
            }
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["toss_role"]) && $match["match_status"] === "toss_3" && $match["toss_winner"] === "player_1") {
        $role = strtolower(trim($_POST["toss_role"]));
        if (in_array($role, ["bat", "bowl"], true)) {
            $match["toss_role"] = $role;
            applyTossRoles($match, $role);
            $match["match_status"] = "innings_1";
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["toss_proceed"]) && $match["match_status"] === "toss_3" && $match["toss_winner"] === "player_2") {
        $match["match_status"] = "innings_1";
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["confirm_lineup"]) && in_array($match["match_status"], ["innings_1", "innings_2"], true)) {
        $players = $match["players_p1"];
        $isInn2 = $match["match_status"] === "innings_2";

        if ($isInn2 || $match["user_role"] === "bat") {
            $picked = isset($_POST["openers"]) ? (array) $_POST["openers"] : [];
            $picked = array_values(array_unique(array_intersect($picked, $players)));
            if (count($picked) === 2) {
                $match["pending_openers"] = $picked;
                $match["opening_batters_p1"] = $picked;
                if ($isInn2) {
                    $match["opening_bowler_p2"] = $match["bowling_order_p2"][0];
                } else {
                    autoCpuOpenersWhenUserBats($match);
                    $playersCpu = $match["players_p2"];
                    $match["opening_bowler_p2"] = $playersCpu[count($playersCpu) - 1];
                }
                $match["match_status"] = $isInn2 ? "innings_2_striker" : "innings_1_striker";
            }
        } else {
            $bowler = isset($_POST["bowler"]) ? trim($_POST["bowler"]) : "";
            if (in_array($bowler, $players, true)) {
                $match["opening_bowler_p1"] = $bowler;
                autoCpuOpenersWhenUserBowls($match);
                startInnings($match, 1);
                $match["match_status"] = "gameplay_1";
            }
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["striker"], $_POST["non_striker"]) && in_array($match["match_status"], ["innings_1_striker", "innings_2_striker"], true)) {
        $st = trim($_POST["striker"]);
        $ns = trim($_POST["non_striker"]);
        $openers = $match["pending_openers"] ?? $match["opening_batters_p1"];
        if (in_array($st, $openers, true) && in_array($ns, $openers, true) && $st !== $ns) {
            $match["striker_p1"]     = $st;
            $match["non_striker_p1"] = $ns;
            $innNum = $match["match_status"] === "innings_2_striker" ? 2 : 1;
            startInnings($match, $innNum);
            $match["match_status"] = gameplayStatusForInnings($innNum);
            $match["pending_openers"] = [];
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["play_ball"]) && in_array($match["match_status"], ["gameplay_1", "gameplay_2"], true)) {
        $num = (int) $_POST["play_ball"];
        $cpuNum = isset($_POST["cpu_ball"]) ? (int) $_POST["cpu_ball"] : -1;
        $inn = $match["innings"][$match["current_innings"]];
        $validBall = isValidBallNumber($match, $inn, $num) && isValidBallNumber($match, $inn, $cpuNum);
        if (!empty($_POST["ajax"])) {
            while (ob_get_level()) {
                ob_end_clean();
            }
            header("Content-Type: application/json; charset=utf-8");
            if ($validBall) {
                $result = processBall($match, $num, $cpuNum);
                if ($result["event"] === "innings_end") {
                    finishInnings($match);
                }
                echo json_encode(buildAjaxPlayResponse());
            } else {
                echo json_encode(["ok" => false]);
            }
            exit;
        }
        if ($validBall) {
            $result = processBall($match, $num, $cpuNum);
            if ($result["event"] === "innings_end") {
                finishInnings($match);
            }
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["pick_player"]) && $match["match_status"] === "lineup_pick") {
        $player = trim($_POST["pick_player"]);
        if ($match["pick_mode"] === "batsman") {
            applyUserBatsmanPick($match, $player);
        } elseif ($match["pick_mode"] === "bowler") {
            applyUserBowlerPick($match, $player);
        }
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["continue_innings"]) && $match["match_status"] === "innings_break") {
        proceedAfterInningsBreak($match);
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["give_up"])) {
        giveUpMatch($match);
        header("Location: cpu_match.php");
        exit;
    }

    if (isset($_POST["finish_match"]) && $match["match_status"] === "match_result") {
        $won = !empty($match["user_won"]);
        saveMatchToDb($conn, (int) $_SESSION["user_id"], $won);
        refreshUserSessionFromDb($conn, (int) $_SESSION["user_id"]);
        unset($_SESSION["match"]);
        header("Location: dashboard.php");
        exit;
    }

    header("Location: cpu_match.php");
    exit;
}

if (!isset($_SESSION["match"])) {
    header("Location: setup_cpu.php");
    exit;
}

$match  = $_SESSION["match"];
ensureCpuCooldownState($match);
if (cpuCooldownExpired($match)) {
    giveUpMatch($match);
}
$_SESSION["match"] = $match;
$match = $_SESSION["match"];
$status = $match["match_status"];
$p1Name = $match["player_1"];
$p2Name = $match["player_2"];

$ballFx = null;
if (!empty($match["last_fx"]) && in_array($status, ["gameplay_1", "gameplay_2", "lineup_pick", "innings_break"], true)) {
    $ballFx = $match["last_fx"];
    unset($_SESSION["match"]["last_fx"]);
    $match = $_SESSION["match"];
}

function renderInningsScorecard(array $match, int $innNum, bool $showTarget = false): void
{
    if (!isset($match["innings"][$innNum])) {
        return;
    }
    $inn = $match["innings"][$innNum];
    $batName  = $match["player_" . substr($inn["batting_team"], -1)];
    $bowlName = $match["player_" . substr($inn["bowling_team"], -1)];
    ?>
    <div class="scorecard-innings">
        <h3>Innings <?php echo $innNum; ?> — <?php echo h($batName); ?></h3>
        <p class="scorecard-total scorecard-total-hero">
            <?php echo (int) $inn["runs"]; ?>/<?php echo (int) $inn["wickets"]; ?>
            <span class="scorecard-overs">(<?php echo h(formatOvers($inn)); ?> ov)</span>
        </p>
        <?php if ($showTarget && !empty($match["target"])): ?>
            <p class="scorecard-target-line">Target to win: <strong><?php echo (int) $match["target"]; ?></strong></p>
        <?php endif; ?>
        <table class="scorecard-table">
            <thead><tr><th>Batter</th><th>R</th><th>B</th></tr></thead>
            <tbody>
            <?php foreach ($inn["bat_stats"] as $name => $s): ?>
                <tr>
                    <td><?php echo h($name); ?><?php echo $s["out"] ? " (out)" : ""; ?></td>
                    <td><?php echo (int) $s["runs"]; ?></td>
                    <td><?php echo (int) $s["balls"]; ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <table class="scorecard-table">
            <thead><tr><th>Bowler</th><th>W</th><th>R</th><th>B</th></tr></thead>
            <tbody>
            <?php foreach ($inn["bowl_stats"] as $name => $s): ?>
                <?php if ($s["balls"] > 0): ?>
                <tr>
                    <td><?php echo h($name); ?></td>
                    <td><?php echo (int) $s["wickets"]; ?></td>
                    <td><?php echo (int) $s["runs"]; ?></td>
                    <td><?php echo (int) $s["balls"]; ?></td>
                </tr>
                <?php endif; ?>
            <?php endforeach; ?>
            </tbody>
        </table>
        <p class="scorecard-vs">vs <?php echo h($bowlName); ?> bowling</p>
    </div>
    <?php
}

function renderBallFxOverlay(?string $fx): void
{
    if (!$fx || !in_array($fx, ["out", "six", "four", "run7", "run8", "run9", "run10"], true)) {
        return;
    }
    $labels = [
        "out" => "OUT!",
        "six" => "SIX!",
        "four" => "FOUR!",
        "run7" => "SEVEN!",
        "run8" => "EIGHT!",
        "run9" => "NINE!",
        "run10" => "TEN!",
    ];
    ?>
    <div class="ball-fx-overlay ball-fx-<?php echo h($fx); ?>" id="ballFxOverlay" aria-hidden="true">
        <div class="ball-fx-burst"></div>
        <p class="ball-fx-text"><?php echo h($labels[$fx]); ?></p>
    </div>
    <script>
    (function () {
        var el = document.getElementById("ballFxOverlay");
        if (!el) return;
        document.body.classList.add("ball-fx-active");
        setTimeout(function () {
            el.classList.add("ball-fx-hide");
            document.body.classList.remove("ball-fx-active");
        }, 1400);
        setTimeout(function () { el.remove(); }, 2000);
    })();
    </script>
    <?php
}

function renderNumberPad(bool $userActive, string $activeName, string $disabledName, string $formId, int $minNum = 0, int $maxNum = 6): void
{
    ?>
    <div class="play-pads">
        <div class="toss-pad-col<?php echo $userActive ? "" : " toss-pad-col-disabled"; ?>">
            <div class="toss-player-tag"><?php echo h($activeName); ?></div>
            <?php if ($userActive): ?>
            <form method="post" id="<?php echo h($formId); ?>">
                <input type="hidden" name="play_ball" id="<?php echo h($formId); ?>Val" value="">
                <div class="number-grid">
                    <?php for ($n = $minNum; $n <= $maxNum; $n++): ?>
                        <button type="button" class="num-btn num-btn-active play-num" data-form="<?php echo h($formId); ?>" data-num="<?php echo $n; ?>"><?php echo $n; ?></button>
                    <?php endfor; ?>
                </div>
            </form>
            <?php else: ?>
            <div class="number-grid">
                <?php for ($n = $minNum; $n <= $maxNum; $n++): ?>
                    <button type="button" class="num-btn num-btn-disabled" disabled><?php echo $n; ?></button>
                <?php endfor; ?>
            </div>
            <?php endif; ?>
        </div>
        <div class="toss-pad-col<?php echo !$userActive ? "" : " toss-pad-col-disabled"; ?>">
            <div class="toss-player-tag"><?php echo h($disabledName); ?></div>
            <div class="number-grid">
                <?php for ($n = $minNum; $n <= $maxNum; $n++): ?>
                    <button type="button" class="num-btn num-btn-disabled" disabled><?php echo $n; ?></button>
                <?php endfor; ?>
            </div>
        </div>
    </div>
    <?php
}

function renderScorebar(array $match): void
{
    $innNum = (int) $match["current_innings"];
    if (!isset($match["innings"][$innNum])) {
        return;
    }
    $inn = $match["innings"][$innNum];
    $userBats = isUserBattingInnings($match, $inn);
    $batKey = $inn["batting_team"];
    $bowlKey = $inn["bowling_team"];
    $batLabel = $match["player_" . substr($batKey, -1)];
    $bowlLabel = $match["player_" . substr($bowlKey, -1)];

    $striker = $inn["striker"];
    $nonStriker = $inn["non_striker"];
    $bowler = $inn["bowler"];
    $bs = $inn["bat_stats"];
    $bls = $inn["bowl_stats"];
    $overSummary = currentOverSummary($inn);
    $chaseSummary = chaseSummary($match, $inn);

    $showTarget = ($innNum === 2 && $match["target"] !== null);
    ?>
    <div class="scorebar">
        <div class="scorebar-bats">
            <span class="scorebar-side-label"><?php echo h($batLabel); ?></span>
            <div class="scorebar-bat on-strike">
                <em>*</em><span class="scorebar-bat-name"><?php echo h($striker); ?></span>
                <span class="scorebar-bat-fig"><strong><?php echo (int) $bs[$striker]["runs"]; ?></strong> (<?php echo (int) $bs[$striker]["balls"]; ?>)</span>
            </div>
            <div class="scorebar-bat">
                <span class="scorebar-bat-name"><?php echo h($nonStriker); ?></span>
                <span class="scorebar-bat-fig"><strong><?php echo (int) $bs[$nonStriker]["runs"]; ?></strong> (<?php echo (int) $bs[$nonStriker]["balls"]; ?>)</span>
            </div>
        </div>

        <div class="scorebar-center">
            <span class="scorebar-score"><?php echo (int) $inn["runs"]; ?>-<?php echo (int) $inn["wickets"]; ?></span>
            <div class="scorebar-center-meta">
                <span class="scorebar-overs"><?php echo h(formatOvers($inn)); ?> ov</span>
                <?php if ($showTarget): ?>
                    <span class="scorebar-target">T <?php echo (int) $match["target"]; ?></span>
                <?php endif; ?>
            </div>
        </div>

        <div class="scorebar-bowl">
            <span class="scorebar-side-label"><?php echo h($bowlLabel); ?></span>
            <div class="scorebar-bowler">
                <span class="scorebar-bowler-name"><?php echo h($bowler); ?></span>
                <span class="scorebar-bowler-fig"><strong><?php echo (int) $bls[$bowler]["wickets"]; ?></strong>-<?php echo (int) $bls[$bowler]["runs"]; ?>-<?php echo (int) $bls[$bowler]["balls"]; ?></span>
            </div>
        </div>

        <div class="scorebar-over">
            <span class="scorebar-over-label">This over</span>
            <div class="scorebar-over-balls">
                <?php if ($overSummary["items"]): ?>
                    <?php foreach ($overSummary["items"] as $item): ?>
                        <span class="scorebar-ball<?php echo $item === "W" ? " scorebar-ball-wicket" : ""; ?>"><?php echo h($item); ?></span>
                    <?php endforeach; ?>
                <?php else: ?>
                    <span class="scorebar-ball scorebar-ball-empty">-</span>
                <?php endif; ?>
            </div>
            <strong class="scorebar-over-runs">Over: <?php echo (int) $overSummary["runs"]; ?></strong>
        </div>

        <p class="scorebar-hint"><?php echo $userBats ? "You bat — pick a number" : "You bowl — pick a number"; ?></p>
        <?php if ($chaseSummary): ?>
            <p class="scorebar-chase"><?php echo (int) $chaseSummary["runs"]; ?> runs in <?php echo (int) $chaseSummary["balls"]; ?> balls</p>
        <?php endif; ?>
    </div>
    <?php
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Match - HandCricket</title>
</head>
<body class="match-body<?php echo in_array($status, ["gameplay_1", "gameplay_2", "lineup_pick"], true) ? " match-body-play" : ""; ?>">
<?php include "assets/includes/header_mini.php"; ?>

<?php
$showGiveUp = !in_array($status, ["match_result", "toss_1", "toss_2", "toss_3"], true)
    && !in_array($status, ["innings_1", "innings_2", "innings_1_striker", "innings_2_striker"], true);
if ($showGiveUp):
?>
<form method="post" id="cpuGiveUpForm" class="match-giveup-form" onsubmit="return confirm('Give up? Your opponent wins the match.');">
    <button type="submit" name="give_up" value="1" class="match-giveup-btn">Give Up</button>
</form>
<form method="post" class="match-giveup-mobile" onsubmit="return confirm('Give up? Your opponent wins the match.');">
    <button type="submit" name="give_up" value="1" class="match-giveup-btn">Give Up</button>
</form>
<?php endif; ?>

<main class="match-main<?php echo in_array($status, ["gameplay_1", "gameplay_2"], true) ? " match-main-play" : ""; ?>">

<?php if ($status === "toss_1"): ?>
    <section class="match-stage">
        <p class="match-kicker">MATCH TOSS</p>
        <h1 class="match-title">Choose <strong>Your Call</strong></h1>
        <form method="post" class="match-choice-row">
            <button type="submit" name="toss_call" value="odd" class="match-choice-btn">ODD</button>
            <button type="submit" name="toss_call" value="even" class="match-choice-btn">EVEN</button>
        </form>
    </section>

<?php elseif ($status === "toss_2"): $call = $match["toss_call"]; ?>
    <section class="match-stage match-stage-wide">
        <div class="match-call-display">
            <span class="match-call-pill<?php echo $call === "odd" ? " is-active" : ""; ?>">ODD</span>
            <span class="match-call-pill<?php echo $call === "even" ? " is-active" : ""; ?>">EVEN</span>
        </div>
        <div class="toss-pads">
            <div class="toss-pad-col">
                <div class="toss-player-tag"><?php echo h($p1Name); ?></div>
                <form method="post" id="tossNumForm">
                    <input type="hidden" name="toss_number" id="tossNumberInput" value="">
                    <div class="number-grid">
                        <?php for ($n = 0; $n <= 6; $n++): ?>
                            <button type="button" class="num-btn num-btn-active toss-num" data-num="<?php echo $n; ?>"><?php echo $n; ?></button>
                        <?php endfor; ?>
                    </div>
                </form>
            </div>
            <div class="toss-pad-col toss-pad-col-disabled">
                <div class="toss-player-tag"><?php echo h($p2Name); ?></div>
                <div class="number-grid">
                    <?php for ($n = 0; $n <= 6; $n++): ?><button type="button" class="num-btn num-btn-disabled" disabled><?php echo $n; ?></button><?php endfor; ?>
                </div>
            </div>
        </div>
    </section>
    <script>
    document.querySelectorAll(".toss-num").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.getElementById("tossNumberInput").value = btn.getAttribute("data-num");
            document.getElementById("tossNumForm").submit();
        });
    });
    </script>

<?php elseif ($status === "toss_3"):
    $playLine = "You played <strong>" . (int) $match["toss_num_p1"] . "</strong> · CPU played <strong>" . (int) $match["toss_num_p2"] . "</strong>";
?>
    <?php if ($match["toss_winner"] === "player_1"): ?>
    <section class="match-stage">
        <p class="match-kicker">TOSS RESULT</p>
        <h1 class="match-title">You <strong>Won</strong> The Toss</h1>
        <p class="match-detail"><?php echo $playLine; ?></p>
        <form method="post" class="match-choice-row">
            <button type="submit" name="toss_role" value="bat" class="match-choice-btn">BAT</button>
            <button type="submit" name="toss_role" value="bowl" class="match-choice-btn match-choice-btn-outline">BOWL</button>
        </form>
    </section>
    <?php else: ?>
    <section class="match-stage">
        <p class="match-kicker">TOSS RESULT</p>
        <h1 class="match-title">CPU <strong>Won</strong> The Toss</h1>
        <p class="match-detail"><?php echo $playLine; ?></p>
        <p class="match-detail">CPU chose to <strong><?php echo h(strtoupper($match["toss_role"])); ?></strong></p>
        <form method="post"><button type="submit" name="toss_proceed" value="1" class="match-choice-btn match-choice-btn-wide">PROCEED</button></form>
    </section>
    <?php endif; ?>

<?php elseif (in_array($status, ["innings_1", "innings_2"], true)):
    $userBats = ($status === "innings_2") || ($match["user_role"] === "bat");
    $innLabel = $status === "innings_2" ? "SECOND" : "FIRST";
?>
    <section class="match-stage match-stage-wide">
        <p class="match-kicker"><?php echo $innLabel; ?> INNINGS</p>
        <h1 class="match-title">Choose <strong><?php echo $userBats ? "Opening Batters" : "Opening Bowler"; ?></strong></h1>
        <p class="match-hint"><?php echo $userBats ? "Select 2 players, then choose striker & non-striker." : "Select 1 player to bowl the first over."; ?></p>
        <form method="post" id="lineupForm">
            <input type="hidden" name="confirm_lineup" value="1">
            <?php if ($userBats): ?>
                <div class="opener-grid" id="openerGrid">
                    <?php foreach ($match["players_p1"] as $p): ?>
                        <label class="opener-card">
                            <input type="checkbox" name="openers[]" value="<?php echo h($p); ?>" class="opener-check">
                            <span class="opener-name"><?php echo h($p); ?></span>
                            <span class="opener-sub">Tap To Select</span>
                        </label>
                    <?php endforeach; ?>
                </div>
            <?php else: ?>
                <div class="opener-grid" id="openerGrid">
                    <?php foreach ($match["players_p1"] as $p): ?>
                        <label class="opener-card">
                            <input type="radio" name="bowler" value="<?php echo h($p); ?>" class="opener-check">
                            <span class="opener-name"><?php echo h($p); ?></span>
                            <span class="opener-sub">Tap To Select</span>
                        </label>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
            <button type="submit" id="lineupBtn" class="match-choice-btn match-choice-btn-wide" disabled>NEXT</button>
        </form>
    </section>
    <script>
    (function () {
        const grid = document.getElementById("openerGrid");
        const btn = document.getElementById("lineupBtn");
        const need = <?php echo $userBats ? 2 : 1; ?>;
        const isRadio = need === 1;
        function update() {
            let c = 0;
            grid.querySelectorAll(".opener-check").forEach(function (inp) {
                const card = inp.closest(".opener-card");
                if (inp.checked) { c++; card.classList.add("is-selected"); }
                else { card.classList.remove("is-selected"); }
            });
            btn.disabled = c !== need;
        }
        grid.addEventListener("change", function (e) {
            if (!isRadio) {
                const ch = grid.querySelectorAll(".opener-check:checked");
                if (ch.length > need) e.target.checked = false;
            }
            update();
        });
        update();
    })();
    </script>

<?php elseif (in_array($status, ["innings_1_striker", "innings_2_striker"], true)):
    $openers = $match["pending_openers"] ?? [];
?>
    <section class="match-stage match-stage-wide">
        <p class="match-kicker"><?php echo $status === "innings_2_striker" ? "SECOND" : "FIRST"; ?> INNINGS</p>
        <h1 class="match-title">Striker & <strong>Non-Striker</strong></h1>
        <p class="match-hint">Tap who faces the first ball (striker).</p>
        <form method="post" id="strikerForm">
            <input type="hidden" name="striker" id="strikerIn" value="">
            <input type="hidden" name="non_striker" id="nonStrikerIn" value="">
            <div class="opener-grid striker-pick-grid">
                <?php foreach ($openers as $p): ?>
                    <button type="button" class="opener-card striker-pick-card" data-player="<?php echo h($p); ?>">
                        <span class="opener-name"><?php echo h($p); ?></span>
                        <span class="opener-sub striker-role-label">Tap for striker</span>
                    </button>
                <?php endforeach; ?>
            </div>
            <button type="submit" id="strikerBtn" class="match-choice-btn match-choice-btn-wide" disabled>START INNINGS</button>
        </form>
    </section>
    <script>
    (function () {
        const cards = document.querySelectorAll(".striker-pick-card");
        const stIn = document.getElementById("strikerIn");
        const nsIn = document.getElementById("nonStrikerIn");
        const btn = document.getElementById("strikerBtn");
        const openers = <?php echo json_encode(array_values($openers)); ?>;
        cards.forEach(function (card) {
            card.addEventListener("click", function () {
                const p = card.getAttribute("data-player");
                stIn.value = p;
                nsIn.value = openers.find(function (x) { return x !== p; });
                cards.forEach(function (c) {
                    c.classList.remove("is-striker", "is-non-striker");
                    c.querySelector(".striker-role-label").textContent = "Tap for striker";
                });
                card.classList.add("is-striker");
                card.querySelector(".striker-role-label").textContent = "Striker *";
                openers.forEach(function (o) {
                    if (o !== p) {
                        document.querySelector('.striker-pick-card[data-player="' + o + '"]')
                            .classList.add("is-non-striker");
                        document.querySelector('.striker-pick-card[data-player="' + o + '"] .striker-role-label')
                            .textContent = "Non-striker";
                    }
                });
                btn.disabled = false;
            });
        });
    })();
    </script>

<?php elseif ($status === "innings_break"):
    renderBallFxOverlay($ballFx);
    $inn1 = $match["innings"][1];
    $bat1Name = $match["player_" . substr($inn1["batting_team"], -1)];
?>
    <section class="match-stage match-stage-wide innings-break-stage">
        <p class="match-kicker">INNINGS BREAK</p>
        <h1 class="match-title">End of <strong>First Innings</strong></h1>
        <div class="innings-break-summary">
            <div class="break-stat">
                <span class="break-stat-label"><?php echo h($bat1Name); ?> scored</span>
                <span class="break-stat-value"><?php echo (int) $inn1["runs"]; ?>/<?php echo (int) $inn1["wickets"]; ?></span>
            </div>
            <div class="break-stat break-stat-target">
                <span class="break-stat-label">Target</span>
                <span class="break-stat-value"><?php echo (int) $match["target"]; ?></span>
            </div>
        </div>
        <div class="scorecard scorecard-break">
            <h2 class="scorecard-heading">Innings 1 Scorecard</h2>
            <?php renderInningsScorecard($match, 1, true); ?>
        </div>
        <form method="post" id="cpuInningsBreakForm">
            <div id="cpuInningsBreakCountdown" style="margin-bottom:12px;font-size:13px;color:var(--slate-warm);text-align:center;">Second innings starting in <strong id="cpuInningsBreakTimer">30</strong>s</div>
            <button type="submit" name="continue_innings" value="1" class="match-choice-btn match-choice-btn-wide">START SECOND INNINGS</button>
        </form>
        <script>
        (function() {
            var secondsLeft = 30;
            var timerEl = document.getElementById('cpuInningsBreakTimer');
            var form = document.getElementById('cpuInningsBreakForm');
            if (!timerEl || !form) return;
            var interval = setInterval(function() {
                secondsLeft--;
                if (timerEl) timerEl.textContent = String(secondsLeft);
                if (secondsLeft <= 0) {
                    clearInterval(interval);
                    form.submit();
                }
            }, 1000);
        })();
        </script>
    </section>

<?php elseif ($status === "lineup_pick"):
    renderBallFxOverlay($ballFx);
    $inn = $match["innings"][$match["current_innings"]];
    $isBat = $match["pick_mode"] === "batsman";
    $choices = $isBat ? availableBatsmen($match, $inn) : availableBowlers($match, $inn);
?>
    <section class="match-stage match-stage-wide">
        <p class="match-kicker">INNINGS <?php echo (int) $match["current_innings"]; ?></p>
        <h1 class="match-title">Choose <strong><?php echo $isBat ? "New Batsman" : "Next Bowler"; ?></strong></h1>
        <form method="post">
            <div class="opener-grid">
                <?php foreach ($choices as $p): ?>
                    <button type="submit" name="pick_player" value="<?php echo h($p); ?>" class="opener-card lineup-submit-card">
                        <span class="opener-name"><?php echo h($p); ?></span>
                        <span class="opener-sub">Select</span>
                    </button>
                <?php endforeach; ?>
            </div>
        </form>
    </section>

<?php elseif (in_array($status, ["gameplay_1", "gameplay_2"], true)):
    renderBallFxOverlay($ballFx);
    $inn = $match["innings"][$match["current_innings"]];
    $userBats = isUserBattingInnings($match, $inn);
    [$numberMin, $numberMax] = allowedNumberRange($match, $inn);
    $isPowerplay = isPowerplayOver($match, $inn);
    $lastBall = end($inn["ball_log"]);
    reset($inn["ball_log"]);
    $brClass = "ball-result";
    $brStyle = $lastBall ? "" : ' style="display:none"';
    if ($lastBall) {
        if ($lastBall["out"]) {
            $brClass .= " ball-result-out";
        } elseif ($lastBall["runs"] >= 7 && $lastBall["runs"] <= 10) {
            $brClass .= " ball-result-power";
        } elseif ($lastBall["runs"] === 6) {
            $brClass .= " ball-result-six";
        } elseif ($lastBall["runs"] === 4) {
            $brClass .= " ball-result-four";
        }
    }
?>
    <section class="match-play-area" id="playArea">
        <p class="match-kicker">INNINGS <?php echo (int) $match["current_innings"]; ?><?php if ($match["current_innings"] === 2 && $match["target"]): ?> · TARGET <?php echo (int) $match["target"]; ?><?php endif; ?></p>
        <?php if ($isPowerplay): ?>
            <div class="powerplay-banner" aria-live="polite">
                <span class="powerplay-banner-label">POWERPLAY ON</span>
                <strong>Numbers 3-10</strong>
            </div>
        <?php endif; ?>
        <p class="<?php echo $brClass; ?>" id="ballResult"<?php echo $brStyle; ?>>
            <?php if ($lastBall): ?>
                <?php if ($lastBall["out"]): ?>
                    OUT! Both played <strong><?php echo (int) $lastBall["bat"]; ?></strong>
                <?php else: ?>
                    +<?php echo (int) $lastBall["runs"]; ?> runs (you <?php echo $userBats ? "bat" : "bowl"; ?> <strong><?php echo $userBats ? (int) $lastBall["bat"] : (int) $lastBall["bowl"]; ?></strong> · CPU <strong><?php echo $userBats ? (int) $lastBall["bowl"] : (int) $lastBall["bat"]; ?></strong>)
                <?php endif; ?>
            <?php endif; ?>
        </p>
        <div id="cpuCooldownBanner" class="match-countdown-banner" aria-live="polite"></div>
        <?php renderNumberPad(true, $p1Name, $p2Name, "playForm", $numberMin, $numberMax); ?>
    </section>
    <div id="scorebarWrap"><?php renderScorebar($match); ?></div>
    <script>
    window.MATCH_PLAY = <?php echo json_encode([
        "ajaxUrl"            => "cpu_match.php",
        "userBats"           => $userBats,
        "userHistory"        => getUserChoiceHistory($match, (int) $match["current_innings"]),
        "numberMin"          => $numberMin,
        "numberMax"          => $numberMax,
        "isPowerplay"        => $isPowerplay,
        "cooldownDeadlineMs" => isset($match["cooldown_deadline_ms"]) ? (int) $match["cooldown_deadline_ms"] : null,
    ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
    </script>
    <script src="assets/JS/cpu_ai.js?v=3"></script>
    <script src="assets/JS/match_play.js?v=6"></script>

<?php elseif ($status === "match_result"):
    $inn1 = $match["innings"][1] ?? null;
    $inn2 = $match["innings"][2] ?? null;
    $res = $match["result"];
    $titles = ["win" => "You Won!", "loss" => "You Lost", "tie" => "Match Tied"];
?>
    <section class="match-stage match-stage-wide">
        <p class="match-kicker">FULL TIME</p>
        <h1 class="match-title"><?php echo h($titles[$res] ?? "Result"); ?></h1>
        <p class="match-detail">You <strong><?php echo (int) $match["final_user_runs"]; ?></strong> · CPU <strong><?php echo (int) $match["final_cpu_runs"]; ?></strong></p>

        <div class="scorecard">
            <h2 class="scorecard-heading">Scorecard</h2>
            <?php renderInningsScorecard($match, 1, false); ?>
            <?php if ($inn2): renderInningsScorecard($match, 2, false); endif; ?>
        </div>

        <form method="post">
            <button type="submit" name="finish_match" value="1" class="match-choice-btn match-choice-btn-wide">BACK TO DASHBOARD</button>
        </form>
    </section>

<?php else: ?>
    <section class="match-stage">
        <p class="match-detail">Unknown state: <?php echo h($status); ?></p>
        <a href="exit_match.php" class="match-choice-btn">EXIT</a>
    </section>
<?php endif; ?>

</main>
</body>
</html>
