<?php
session_start();
header("Content-Type: application/json; charset=utf-8");

if (!isset($_SESSION["user_id"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "login"]);
    exit;
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$action = $body["action"] ?? "";

function validRoomCode($value) {
    return is_string($value) && preg_match('/^[A-Z0-9]{4}$/', $value);
}

function validMpSlot($slot) {
    $validSlots = ["player1", "player2", "player3", "player4"];
    return is_string($slot) && in_array($slot, $validSlots, true);
}

function firebaseDatabaseUrl() {
    $configPath = __DIR__ . '/assets/JS/firebase_config.js';
    if (!file_exists($configPath)) {
        return null;
    }
    $content = file_get_contents($configPath);
    if ($content === false) {
        return null;
    }
    if (preg_match('/databaseURL\s*:\s*["\']([^"\']+)["\']/', $content, $matches)) {
        return rtrim($matches[1], '/');
    }
    return null;
}

function fetchFirebaseJson($url) {
    $json = @file_get_contents($url);
    if ($json === false) {
        return null;
    }
    return json_decode($json, true);
}

function userOwnsRoomSlot($room, $slot, $userId) {
    $dbUrl = firebaseDatabaseUrl();
    if (!$dbUrl) {
        return false;
    }
    $paths = [
        "rooms/$room/players/$slot/userId.json",
        "rooms2v2/$room/players/$slot/userId.json",
    ];
    foreach ($paths as $path) {
        $value = fetchFirebaseJson($dbUrl . '/' . $path);
        if ($value === null) {
            continue;
        }
        if ((int) $value === (int) $userId) {
            return true;
        }
    }
    return false;
}

if ($action === "finish") {
    require_once "assets/includes/cpu_match_logic.php";
    include "assets/includes/db.php";
    if (empty($_SESSION["mp_room"]) || empty($_SESSION["mp_slot"])) {
        http_response_code(400);
        echo json_encode(["ok" => false, "error" => "session"]);
        exit;
    }
    $won = !empty($body["won"]);
    saveMatchToDb($conn, (int) $_SESSION["user_id"], $won);
    refreshUserSessionFromDb($conn, (int) $_SESSION["user_id"]);
    unset($_SESSION["mp_room"], $_SESSION["mp_slot"]);
    echo json_encode(["ok" => true]);
    exit;
}

$room = strtoupper(trim($body["room"] ?? $_POST["room"] ?? ""));
$slot = $body["slot"] ?? $_POST["slot"] ?? "";

if (!validRoomCode($room) || !validMpSlot($slot)) {
    echo json_encode(["ok" => false, "error" => "invalid"]);
    exit;
}

if (!empty($_SESSION["mp_room"]) && $_SESSION["mp_room"] !== $room) {
    echo json_encode(["ok" => false, "error" => "session_mismatch"]);
    exit;
}

if (!empty($_SESSION["mp_slot"]) && $_SESSION["mp_slot"] !== $slot) {
    echo json_encode(["ok" => false, "error" => "slot_mismatch"]);
    exit;
}

if (!userOwnsRoomSlot($room, $slot, $_SESSION["user_id"])) {
    // Help debugging: include whether Firebase thinks the slot belongs to anyone
    $debug = [
        "ok" => false,
        "error" => "invalid_room_slot",
        "room" => $room,
        "slot" => $slot,
        "userId" => (int) $_SESSION["user_id"],
    ];
    echo json_encode($debug);
    exit;
}


$_SESSION["mp_room"] = $room;
$_SESSION["mp_slot"] = $slot;

echo json_encode([
    "ok"       => true,
    "room"     => $room,
    "slot"     => $slot,
    "username" => $_SESSION["username"] ?? "Player",
    "userId"   => (int) $_SESSION["user_id"],
]);
