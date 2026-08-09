<?php

function makeTeamPlayers(int $size): array
{
    $players = [];
    for ($i = 1; $i <= $size; $i++) {
        $players[] = sprintf("Player %02d", $i);
    }
    return $players;
}

function defaultCpuCooldownSeconds(): int
{
    return 60;
}

function normalizeCpuCooldownSeconds($seconds): int
{
    $value = is_numeric($seconds) ? (int) $seconds : defaultCpuCooldownSeconds();
    return max(15, min(300, $value));
}

function normalizePowerplayOvers($powerplay, int $overs): int
{
    $value = is_numeric($powerplay) ? (int) $powerplay : 0;
    return max(0, min($overs, $value));
}

function nowCpuCooldownMs(): int
{
    return (int) floor(microtime(true) * 1000);
}

function startCpuCooldown(array &$match): void
{
    $match["cooldown_seconds"] = normalizeCpuCooldownSeconds($match["cooldown_seconds"] ?? null);
    $match["cooldown_deadline_ms"] = nowCpuCooldownMs() + ($match["cooldown_seconds"] * 1000);
}

function clearCpuCooldown(array &$match): void
{
    $match["cooldown_seconds"] = normalizeCpuCooldownSeconds($match["cooldown_seconds"] ?? null);
    unset($match["cooldown_deadline_ms"]);
}

function ensureCpuCooldownState(array &$match): void
{
    if (!in_array($match["match_status"] ?? "", ["gameplay_1", "gameplay_2"], true)) {
        return;
    }
    if (!isset($match["cooldown_deadline_ms"]) || !is_numeric($match["cooldown_deadline_ms"])) {
        startCpuCooldown($match);
    }
}

function cpuCooldownExpired(array $match): bool
{
    if (!in_array($match["match_status"] ?? "", ["gameplay_1", "gameplay_2"], true)) {
        return false;
    }
    if (!isset($match["cooldown_deadline_ms"]) || !is_numeric($match["cooldown_deadline_ms"])) {
        return false;
    }
    return nowCpuCooldownMs() >= (int) $match["cooldown_deadline_ms"];
}

function initCpuMatch(int $overs, int $wickets, string $username, int $powerplayOvers = 0): array
{
    $teamSize = $wickets + 1;
    $players = makeTeamPlayers($teamSize);
    $powerplayOvers = normalizePowerplayOvers($powerplayOvers, $overs);

    return [
        "mode"               => "cpu",
        "match_status"       => "toss_1",
        "overs"              => $overs,
        "powerplay_overs"    => $powerplayOvers,
        "wickets"            => $wickets,
        "team_size"          => $teamSize,
        "player_1"           => $username,
        "player_2"           => "CPU",
        "players_p1"         => $players,
        "players_p2"         => $players,
        "toss_call"          => null,
        "toss_num_p1"        => null,
        "toss_num_p2"        => null,
        "toss_winner"        => null,
        "toss_role"          => null,
        "batting_first"      => null,
        "user_role"          => null,
        "opening_batters_p1" => [],
        "opening_bowler_p1"  => null,
        "opening_batters_p2" => [],
        "opening_bowler_p2"  => null,
        "striker_p1"         => null,
        "non_striker_p1"     => null,
        "striker_p2"         => null,
        "non_striker_p2"     => null,
        "batting_order_p1"   => $players,
        "batting_order_p2"   => $players,
        "bowling_order_p1"   => array_reverse($players),
        "bowling_order_p2"   => array_reverse($players),
        "current_innings"    => 1,
        "innings"            => [],
        "target"             => null,
        "pick_mode"          => null,
        "pending_openers"    => [],
        "result"             => null,
        "user_won"           => null,
        "cooldown_seconds"   => defaultCpuCooldownSeconds(),
        "cooldown_deadline_ms" => null,
    ];
}

function tossSumWinsForUser(string $call, int $sum): bool
{
    $isOdd = ($sum % 2) === 1;
    return ($call === "odd" && $isOdd) || ($call === "even" && !$isOdd);
}

function applyTossRoles(array &$match, string $roleForPlayer1): void
{
    if ($roleForPlayer1 === "bat") {
        $match["batting_first"] = "player_1";
        $match["user_role"]     = "bat";
    } else {
        $match["batting_first"] = "player_2";
        $match["user_role"]     = "bowl";
    }
}

function autoCpuOpenersWhenUserBats(array &$match): void
{
    $players = $match["players_p2"];
    $match["opening_batters_p2"] = [$players[0], $players[1]];
    $match["striker_p2"]         = $players[0];
    $match["non_striker_p2"]     = $players[1];
    $match["opening_bowler_p2"]  = $players[count($players) - 1];
}

function autoCpuOpenersWhenUserBowls(array &$match): void
{
    $players = $match["players_p2"];
    $match["opening_batters_p2"] = [$players[0], $players[1]];
    $match["striker_p2"]         = $players[0];
    $match["non_striker_p2"]     = $players[1];
}

function initPlayerBatStats(array $players): array
{
    $stats = [];
    foreach ($players as $p) {
        $stats[$p] = ["runs" => 0, "balls" => 0, "out" => false];
    }
    return $stats;
}

function initPlayerBowlStats(array $players): array
{
    $stats = [];
    foreach ($players as $p) {
        $stats[$p] = ["runs" => 0, "wickets" => 0, "balls" => 0];
    }
    return $stats;
}

function battingTeamKeyForInnings(array $match, int $inningsNum): string
{
    $first = $match["batting_first"];
    return ($inningsNum === 1) ? $first : ($first === "player_1" ? "player_2" : "player_1");
}

function bowlingTeamKeyForInnings(array $match, int $inningsNum): string
{
    $bat = battingTeamKeyForInnings($match, $inningsNum);
    return $bat === "player_1" ? "player_2" : "player_1";
}

function teamPlayers(array $match, string $teamKey): array
{
    return $match["players_p" . substr($teamKey, -1)];
}

function startInnings(array &$match, int $inningsNum): void
{
    $batKey  = battingTeamKeyForInnings($match, $inningsNum);
    $bowlKey = bowlingTeamKeyForInnings($match, $inningsNum);
    $batPlayers  = teamPlayers($match, $batKey);
    $bowlPlayers = teamPlayers($match, $bowlKey);

    $suffix = substr($batKey, -1);
    $striker     = $match["striker_p" . $suffix];
    $nonStriker  = $match["non_striker_p" . $suffix];
    $bowlSuffix  = substr($bowlKey, -1);
    $bowler      = $match["opening_bowler_p" . $bowlSuffix];

    if (!$striker || !$nonStriker) {
        $striker    = $match["opening_batters_p" . $suffix][0] ?? $batPlayers[0];
        $nonStriker = $match["opening_batters_p" . $suffix][1] ?? $batPlayers[1];
    }
    if (!$bowler) {
        $bowler = $match["bowling_order_p" . $bowlSuffix][0];
    }

    $match["innings"][$inningsNum] = [
        "batting_team"  => $batKey,
        "bowling_team"  => $bowlKey,
        "runs"          => 0,
        "wickets"       => 0,
        "balls_in_over" => 0,
        "overs_done"    => 0,
        "striker"       => $striker,
        "non_striker"   => $nonStriker,
        "bowler"        => $bowler,
        "prev_bowler"   => null,
        "dismissed"     => [],
        "bat_stats"     => initPlayerBatStats($batPlayers),
        "bowl_stats"    => initPlayerBowlStats($bowlPlayers),
        "ball_log"      => [],
        "bowler_index"  => array_search($bowler, $match["bowling_order_p" . $bowlSuffix], true) ?: 0,
    ];
    $match["current_innings"] = $inningsNum;
}

function userTeamKey(array $match): string
{
    return "player_1";
}

function isUserBattingInnings(array $match, array $inn): bool
{
    return $inn["batting_team"] === userTeamKey($match);
}

function isUserBowlingInnings(array $match, array $inn): bool
{
    return $inn["bowling_team"] === userTeamKey($match);
}

function onCrease(array $inn): array
{
    return [$inn["striker"], $inn["non_striker"]];
}

function availableBatsmen(array $match, array $inn): array
{
    $batKey = $inn["batting_team"];
    $all = teamPlayers($match, $batKey);
    $on = onCrease($inn);
    $out = $inn["dismissed"];
    return array_values(array_filter($all, function ($p) use ($on, $out) {
        return !in_array($p, $on, true) && !in_array($p, $out, true);
    }));
}

function availableBowlers(array $match, array $inn): array
{
    $bowlKey = $inn["bowling_team"];
    $all = $match["bowling_order_p" . substr($bowlKey, -1)];
    $current = $inn["bowler"];
    $others = array_values(array_filter($all, function ($p) use ($current) {
        return $p !== $current;
    }));
    return count($others) > 0 ? $others : $all;
}

function swapStriker(array &$inn): void
{
    $t = $inn["striker"];
    $inn["striker"] = $inn["non_striker"];
    $inn["non_striker"] = $t;
}

function nextCpuBatsman(array $match, array $inn): ?string
{
    $avail = availableBatsmen($match, $inn);
    if (count($avail) === 0) {
        return null;
    }
    $batKey = $inn["batting_team"];
    $order = $match["batting_order_p" . substr($batKey, -1)];
    foreach ($order as $p) {
        if (in_array($p, $avail, true)) {
            return $p;
        }
    }
    return $avail[0];
}

function nextCpuBowler(array &$match, array &$inn): void
{
    $bowlKey = $inn["bowling_team"];
    $order = $match["bowling_order_p" . substr($bowlKey, -1)];
    $idx = (int) $inn["bowler_index"];
    $n = count($order);
    for ($i = 1; $i <= $n; $i++) {
        $next = $order[($idx + $i) % $n];
        if ($next !== $inn["bowler"]) {
            $inn["prev_bowler"] = $inn["bowler"];
            $inn["bowler"] = $next;
            $inn["bowler_index"] = array_search($next, $order, true);
            return;
        }
    }
}

function formatOvers(array $inn): string
{
    return $inn["overs_done"] . "." . $inn["balls_in_over"];
}

function currentOverSummary(array $inn): array
{
    $log = $inn["ball_log"] ?? [];
    $ballsInOver = (int) ($inn["balls_in_over"] ?? 0);
    $take = $ballsInOver > 0 ? $ballsInOver : min(6, count($log));
    $balls = $take > 0 ? array_slice($log, -$take) : [];
    $items = [];
    $runs = 0;

    foreach ($balls as $ball) {
        $runs += (int) ($ball["runs"] ?? 0);
        $items[] = !empty($ball["out"]) ? "W" : (string) ((int) ($ball["runs"] ?? 0));
    }

    return [
        "items" => $items,
        "runs" => $runs,
    ];
}

function chaseSummary(array $match, array $inn): ?array
{
    if ((int) ($match["current_innings"] ?? 1) !== 2 || ($match["target"] ?? null) === null) {
        return null;
    }

    $runsNeeded = max(0, (int) $match["target"] - (int) ($inn["runs"] ?? 0));
    $ballsRemaining = max(0, inningsMaxBalls($match) - inningsTotalBalls($inn));

    return [
        "runs" => $runsNeeded,
        "balls" => $ballsRemaining,
    ];
}

function inningsMaxBalls(array $match): int
{
    return (int) $match["overs"] * 6;
}

function inningsTotalBalls(array $inn): int
{
    return (int) $inn["overs_done"] * 6 + (int) $inn["balls_in_over"];
}

function isPowerplayOver(array $match, array $inn): bool
{
    return (int) $inn["overs_done"] < (int) ($match["powerplay_overs"] ?? 0);
}

function allowedNumberRange(array $match, array $inn): array
{
    return isPowerplayOver($match, $inn) ? [3, 10] : [0, 6];
}

function isValidBallNumber(array $match, array $inn, int $num): bool
{
    [$min, $max] = allowedNumberRange($match, $inn);
    return $num >= $min && $num <= $max;
}

function isInningsComplete(array $match, array $inn): bool
{
    if ($inn["wickets"] >= (int) $match["wickets"]) {
        return true;
    }
    return inningsTotalBalls($inn) >= inningsMaxBalls($match);
}

function chaseWon(array $match, array $inn): bool
{
    if ($match["current_innings"] < 2 || $match["target"] === null) {
        return false;
    }
    return $inn["runs"] >= (int) $match["target"];
}

function chaseLost(array $match, array $inn): bool
{
    if ($match["current_innings"] < 2 || $match["target"] === null) {
        return false;
    }
    if ($inn["wickets"] >= (int) $match["wickets"]) {
        return $inn["runs"] < (int) $match["target"];
    }
    if (isInningsComplete($match, $inn)) {
        return $inn["runs"] < (int) $match["target"];
    }
    return false;
}

function ballFxType(bool $out, int $runs): ?string
{
    if ($out) {
        return "out";
    }
    if (in_array($runs, [7, 8, 9, 10], true)) {
        return "run" . $runs;
    }
    if ($runs === 6) {
        return "six";
    }
    if ($runs === 4) {
        return "four";
    }
    return null;
}

function isBallOut(int $batNum, int $bowlNum): bool
{
    return $batNum === $bowlNum && $batNum !== 0;
}

function processBall(array &$match, int $userNum, int $cpuNum): array
{
    $innNum = (int) $match["current_innings"];
    $inn = &$match["innings"][$innNum];
    $userBats = isUserBattingInnings($match, $inn);

    if (!isValidBallNumber($match, $inn, $userNum) || !isValidBallNumber($match, $inn, $cpuNum)) {
        return ["event" => "invalid"];
    }

    $batNum  = $userBats ? $userNum : $cpuNum;
    $bowlNum = $userBats ? $cpuNum : $userNum;

    $out = isBallOut($batNum, $bowlNum);
    $runs = $out ? 0 : $batNum;
    $match["last_fx"] = ballFxType($out, $runs);

    $striker = $inn["striker"];
    $log = [
        "bat" => $batNum,
        "bowl" => $bowlNum,
        "runs" => $runs,
        "out" => $out,
        "striker" => $striker,
    ];
    $inn["ball_log"][] = $log;

    $inn["bat_stats"][$striker]["balls"]++;
    $inn["bowl_stats"][$inn["bowler"]]["balls"]++;

    if ($out) {
        $inn["bat_stats"][$striker]["out"] = true;
        $inn["dismissed"][] = $striker;
        $inn["wickets"]++;
        $inn["bowl_stats"][$inn["bowler"]]["wickets"]++;
    } else {
        $inn["runs"] += $runs;
        $inn["bat_stats"][$striker]["runs"] += $runs;
        $inn["bowl_stats"][$inn["bowler"]]["runs"] += $runs;
        if ($runs % 2 === 1) {
            swapStriker($inn);
        }
    }

    $inn["balls_in_over"]++;
    $overEnded = false;
    if ($inn["balls_in_over"] >= 6) {
        $inn["balls_in_over"] = 0;
        $inn["overs_done"]++;
        $overEnded = true;
        if (!$out) {
            swapStriker($inn);
        }
    }

    $needBatsmanPick = false;
    $needBowlerPick  = false;

    if ($out) {
        if (isInningsComplete($match, $inn) || chaseLost($match, $inn)) {
            return ["event" => "innings_end"];
        }
        if (isUserBattingInnings($match, $inn)) {
            $match["match_status"] = "lineup_pick";
            $match["pick_mode"] = "batsman";
            $match["pick_replaces"] = "striker";
            $needBatsmanPick = true;
        } else {
            $newB = nextCpuBatsman($match, $inn);
            if ($newB === null) {
                return ["event" => "innings_end"];
            }
            $inn["striker"] = $newB;
        }
    }

    if ($overEnded && !isInningsComplete($match, $inn)) {
        if (isUserBowlingInnings($match, $inn)) {
            $match["match_status"] = "lineup_pick";
            $match["pick_mode"] = "bowler";
            $needBowlerPick = true;
        } else {
            nextCpuBowler($match, $inn);
        }
    }

    if (chaseWon($match, $inn)) {
        return ["event" => "innings_end", "won" => true];
    }

    if (isInningsComplete($match, $inn)) {
        return ["event" => "innings_end"];
    }

    if ($needBatsmanPick || $needBowlerPick) {
        return ["event" => "pick"];
    }

    startCpuCooldown($match);
    return ["event" => "continue"];
}

function applyUserBatsmanPick(array &$match, string $player): bool
{
    $inn = &$match["innings"][$match["current_innings"]];
    $avail = availableBatsmen($match, $inn);
    if (!in_array($player, $avail, true)) {
        return false;
    }
    $replaces = $match["pick_replaces"] ?? "non_striker";
    if ($replaces === "striker") {
        $inn["striker"] = $player;
    } else {
        $inn["non_striker"] = $player;
    }
    $match["match_status"] = $match["current_innings"] === 1 ? "gameplay_1" : "gameplay_2";
    $match["pick_mode"] = null;
    $match["pick_replaces"] = null;
    startCpuCooldown($match);
    return true;
}

function applyUserBowlerPick(array &$match, string $player): bool
{
    $inn = &$match["innings"][$match["current_innings"]];
    $avail = availableBowlers($match, $inn);
    if (!in_array($player, $avail, true)) {
        return false;
    }
    $inn["prev_bowler"] = $inn["bowler"];
    $inn["bowler"] = $player;
    $bowlKey = $inn["bowling_team"];
    $order = $match["bowling_order_p" . substr($bowlKey, -1)];
    $idx = array_search($player, $order, true);
    if ($idx !== false) {
        $inn["bowler_index"] = $idx;
    }
    $match["match_status"] = $match["current_innings"] === 1 ? "gameplay_1" : "gameplay_2";
    $match["pick_mode"] = null;
    startCpuCooldown($match);
    return true;
}

function finishInnings(array &$match): void
{
    $innNum = (int) $match["current_innings"];
    $inn = $match["innings"][$innNum];

    clearCpuCooldown($match);

    if ($innNum === 1) {
        $match["target"] = $inn["runs"] + 1;
        $bat2 = battingTeamKeyForInnings($match, 2);
        $bowl2 = bowlingTeamKeyForInnings($match, 2);
        $s2 = substr($bat2, -1);
        $sBowl = substr($bowl2, -1);
        $batPlayers = teamPlayers($match, $bat2);
        $match["opening_batters_p" . $s2] = [$batPlayers[0], $batPlayers[1]];
        $match["striker_p" . $s2] = $batPlayers[0];
        $match["non_striker_p" . $s2] = $batPlayers[1];
        $bowlPlayers = teamPlayers($match, $bowl2);
        $match["opening_bowler_p" . $sBowl] = $match["bowling_order_p" . $sBowl][0];

        $match["match_status"] = "innings_break";
        return;
    }

    resolveMatchResult($match);
    $match["match_status"] = "match_result";
}

function proceedAfterInningsBreak(array &$match): void
{
    $bat2 = battingTeamKeyForInnings($match, 2);
    if ($bat2 === userTeamKey($match)) {
        $match["match_status"] = "innings_2";
    } else {
        startInnings($match, 2);
        $match["match_status"] = "gameplay_2";
        startCpuCooldown($match);
    }
}

function giveUpMatch(array &$match): void
{
    $userKey = userTeamKey($match);
    $userRuns = 0;
    $cpuRuns  = 0;
    foreach ([1, 2] as $n) {
        if (!isset($match["innings"][$n])) {
            continue;
        }
        $inn = $match["innings"][$n];
        if ($inn["batting_team"] === $userKey) {
            $userRuns += $inn["runs"];
        } else {
            $cpuRuns += $inn["runs"];
        }
    }
    $match["final_user_runs"] = $userRuns;
    $match["final_cpu_runs"]  = $cpuRuns;
    $match["result"]   = "loss";
    $match["user_won"] = false;
    $match["match_status"] = "match_result";
}

function resolveMatchResult(array &$match): void
{
    $inn1 = $match["innings"][1];
    $inn2 = $match["innings"][2];
    $userKey = userTeamKey($match);

    $userRuns = 0;
    $cpuRuns  = 0;
    foreach ([1, 2] as $n) {
        $inn = $match["innings"][$n];
        if ($inn["batting_team"] === $userKey) {
            $userRuns += $inn["runs"];
        } else {
            $cpuRuns += $inn["runs"];
        }
    }

    if ($userRuns > $cpuRuns) {
        $match["result"] = "win";
        $match["user_won"] = true;
    } elseif ($userRuns < $cpuRuns) {
        $match["result"] = "loss";
        $match["user_won"] = false;
    } else {
        $match["result"] = "tie";
        $match["user_won"] = false;
    }
    $match["final_user_runs"] = $userRuns;
    $match["final_cpu_runs"]  = $cpuRuns;
}

function saveMatchToDb(mysqli $conn, int $userId, bool $won): void
{
    if ($won) {
        $stmt = $conn->prepare("UPDATE users SET total = total + 1, wins = wins + 1 WHERE id = ?");
    } else {
        $stmt = $conn->prepare("UPDATE users SET total = total + 1 WHERE id = ?");
    }
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $stmt->close();
}

function refreshUserSessionFromDb(mysqli $conn, int $userId): void
{
    $stmt = $conn->prepare("SELECT total, wins FROM users WHERE id = ?");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row) {
        $_SESSION["total"] = (int) $row["total"];
        $_SESSION["wins"]  = (int) $row["wins"];
    }
}

function gameplayStatusForInnings(int $n): string
{
    return $n === 1 ? "gameplay_1" : "gameplay_2";
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, "UTF-8");
}

/** User's recent picks this innings (bat or bowl numbers) — for client CPU only. */
function getUserChoiceHistory(array $match, int $innNum): array
{
    if (!isset($match["innings"][$innNum])) {
        return [];
    }
    $inn = $match["innings"][$innNum];
    $userBats = isUserBattingInnings($match, $inn);
    $hist = [];
    foreach ($inn["ball_log"] as $ball) {
        $hist[] = $userBats ? (int) $ball["bat"] : (int) $ball["bowl"];
    }
    return array_slice($hist, -15);
}

function buildAjaxPlayResponse(): array
{
    $match = $_SESSION["match"] ?? [];
    $status = $match["match_status"] ?? "";
    $redirect = in_array($status, ["gameplay_1", "gameplay_2"], true) ? null : "cpu_match.php";

    $innNum = (int) ($match["current_innings"] ?? 1);
    $ballPayload = null;
    $fx = $match["last_fx"] ?? null;
    if (isset($_SESSION["match"]["last_fx"])) {
        unset($_SESSION["match"]["last_fx"]);
    }

    $scorebar = null;
    $range = [0, 6];
    $isPowerplay = false;
    if (isset($match["innings"][$innNum])) {
        $inn = $match["innings"][$innNum];
        $userBats = isUserBattingInnings($match, $inn);
        $range = allowedNumberRange($match, $inn);
        $isPowerplay = isPowerplayOver($match, $inn);
        $batKey = $inn["batting_team"];
        $bowlKey = $inn["bowling_team"];
        $striker = $inn["striker"];
        $nonStriker = $inn["non_striker"];
        $bowler = $inn["bowler"];
        $bs = $inn["bat_stats"];
        $bls = $inn["bowl_stats"];
        $log = $inn["ball_log"];
        $last = $log ? $log[count($log) - 1] : null;

        if ($last) {
            $ballPayload = [
                "out"      => (bool) $last["out"],
                "runs"     => (int) $last["runs"],
                "bat"      => (int) $last["bat"],
                "bowl"     => (int) $last["bowl"],
                "userBats" => $userBats,
            ];
        }

        $scorebar = [
            "batLabel"   => $match["player_" . substr($batKey, -1)],
            "bowlLabel"  => $match["player_" . substr($bowlKey, -1)],
            "runs"       => (int) $inn["runs"],
            "wickets"    => (int) $inn["wickets"],
            "overs"      => formatOvers($inn),
            "target"     => ($innNum === 2 && !empty($match["target"])) ? (int) $match["target"] : null,
            "striker"    => [
                "name" => $striker,
                "r"    => (int) $bs[$striker]["runs"],
                "b"    => (int) $bs[$striker]["balls"],
            ],
            "nonStriker" => [
                "name" => $nonStriker,
                "r"    => (int) $bs[$nonStriker]["runs"],
                "b"    => (int) $bs[$nonStriker]["balls"],
            ],
            "bowler" => [
                "name" => $bowler,
                "w"    => (int) $bls[$bowler]["wickets"],
                "r"    => (int) $bls[$bowler]["runs"],
                "b"    => (int) $bls[$bowler]["balls"],
            ],
            "hint" => $userBats ? "You bat — pick a number" : "You bowl — pick a number",
            "overSummary" => currentOverSummary($inn),
            "chaseSummary" => chaseSummary($match, $inn),
        ];
    }

    return [
        "ok"                  => true,
        "redirect"            => $redirect,
        "fx"                  => $fx,
        "ball"                => $ballPayload,
        "scorebar"            => $scorebar,
        "userBats"            => isset($match["innings"][$innNum]) ? isUserBattingInnings($match, $match["innings"][$innNum]) : null,
        "userHistory"         => getUserChoiceHistory($match, $innNum),
        "numberMin"           => $range[0],
        "numberMax"           => $range[1],
        "isPowerplay"         => $isPowerplay,
        "cooldownDeadlineMs"  => isset($match["cooldown_deadline_ms"]) ? (int) $match["cooldown_deadline_ms"] : null,
        "cooldownSeconds"     => normalizeCpuCooldownSeconds($match["cooldown_seconds"] ?? null),
    ];
}
