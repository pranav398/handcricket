<?php
session_start();
if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit;
}
// Clear any lingering multiplayer match session variables when joining a new match
unset($_SESSION["mp_room"], $_SESSION["mp_slot"]);
$username = $_SESSION["username"];
$userId = (int) $_SESSION["user_id"];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Join 2 vs 2 - HandCricket</title>
    <style>
    .slots-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 20px;
    }
    .team-section {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 20px;
    }
    .team-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--slate-warm);
        margin-bottom: 15px;
        text-align: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        padding-bottom: 10px;
    }
    .slot-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 15px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: 0.3s ease;
    }
    .slot-card.occupied {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.15);
    }
    .slot-role {
        font-size: 10px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--slate-warm);
    }
    .slot-player {
        font-size: 15px;
        font-weight: 600;
        color: var(--ivory);
    }
    .slot-join-btn {
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: transparent;
        color: var(--ivory);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
        transition: 0.3s ease;
    }
    .slot-join-btn:hover {
        background: var(--ivory);
        color: var(--base-deep);
    }
    @media (max-width: 600px) {
        .slots-container {
            grid-template-columns: 1fr;
        }
    }
    </style>
</head>
<body>
<?php include "assets/includes/header.php"; ?>

<main class="main">
    <section class="section section-center">
        <div class="section-tag">Team Multiplayer</div>
        <h2 class="section-title">Join <strong>2 vs 2 Room</strong></h2>
        <p class="section-body">Enter the 4-character code from the room host.</p>
        <div class="silk-divider" style="margin:40px auto;"></div>

        <div class="pricing-card" style="max-width:420px; margin:0 auto;">
            <div id="mp2JoinMsg" class="match-detail" style="display:none;margin-bottom:16px;"></div>
            <form id="joinRoomForm">
                <div style="margin-bottom:30px;">
                    <label class="stepper-label">Room Code</label>
                    <input type="text" id="roomCode" maxlength="4" minlength="4" required
                           class="game-input" style="text-align:center;letter-spacing:0.35em;text-transform:uppercase;"
                           placeholder="ABCD" autocomplete="off">
                </div>
                <button type="submit" class="btn-primary" style="width:100%;">Join 2 vs 2</button>
            </form>
            <div id="slotSelectionBlock" style="display:none;"></div>
            <a href="create_2v2_match.php" class="btn-secondary" style="display:block;text-align:center;margin-top:16px;">Create Room Instead</a>
        </div>
    </section>
</main>

<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
<script src="assets/JS/firebase_config.js"></script>
<script src="assets/JS/mp2_core.js?v=1"></script>
<script src="assets/JS/mp2_firebase.js?v=8"></script>
<script>
(function () {
    var boot = { username: <?php echo json_encode($username); ?>, userId: <?php echo (int) $userId; ?> };
    var msg = document.getElementById("mp2JoinMsg");
    var input = document.getElementById("roomCode");
    var form = document.getElementById("joinRoomForm");
    var slotBlock = document.getElementById("slotSelectionBlock");
    var pricingCard = document.querySelector(".pricing-card");
    var createInsteadBtn = pricingCard.querySelector(".btn-secondary");
    var ref = null;
    var hasRedirected = false;
    var isJoiningSlot = false;

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s == null ? "" : String(s);
        return d.innerHTML;
    }

    function showErr(t) {
        msg.style.display = "block";
        msg.style.color = "#f87171";
        msg.textContent = t;
    }

    input.addEventListener("input", function () {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });

    if (!Mp2Firebase.init()) {
        showErr("Firebase not configured.");
        return;
    }

    function proceedToMatch(code, slot) {
        if (hasRedirected) return;
        hasRedirected = true;
        fetch("mp_api.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room: code, slot: slot }),
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (!res.ok) throw new Error("Session error");
            window.location.href = "mp_2v2_match.php";
        }).catch(function (err) {
            showErr(err.message || "Could not join room session");
            hasRedirected = false;
        });
    }

    function doStandardJoin(code) {
        Mp2Firebase.joinRoom(code, boot).then(function (slot) {
            proceedToMatch(code, slot);
        }).catch(function (err) {
            showErr(err.message || "Could not join room");
        });
    }

    function renderSlotsUI(code, players, room) {
        pricingCard.style.maxWidth = "800px";
        form.style.display = "none";
        if (createInsteadBtn) createInsteadBtn.style.display = "none";
        slotBlock.style.display = "block";

        var html = '<h3 class="stepper-label" style="text-align:center;margin-bottom:20px;font-size:13px;">Choose Your Slot (Room: ' + esc(code) + ')</h3>';
        html += '<div class="slots-container">';

        // Team A (Team X)
        html += '<div class="team-section"><div class="team-title">Team A</div>';
        html += renderSlotCard(code, "player1", "Captain / Player 1", players["player1"]);
        html += renderSlotCard(code, "player2", "Player 2", players["player2"]);
        html += '</div>';

        // Team B (Team Y)
        html += '<div class="team-section"><div class="team-title">Team B</div>';
        html += renderSlotCard(code, "player3", "Captain / Player 1", players["player3"]);
        html += renderSlotCard(code, "player4", "Player 2", players["player4"]);
        html += '</div>';

        html += '</div>';
        if (room && room.meta && room.meta.creator && room.meta.creator.userId === boot.userId && Object.keys(players).length < 4 && room.game && room.game.stage === "lobby" && room.meta.status !== "terminated") {
            html += '<div style="margin-top:24px;"><button type="button" id="terminateRoomBtn" class="btn-secondary" style="width:100%;">Terminate Room</button></div>';
        }
        html += '<button type="button" class="btn-secondary" id="cancelSlotSelection" style="display:block;width:100%;margin-top:20px;">Cancel</button>';
        slotBlock.innerHTML = html;

        // Wire event handlers
        slotBlock.querySelectorAll(".slot-join-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var slot = btn.getAttribute("data-slot");
                btn.disabled = true;
                btn.textContent = "Joining...";
                isJoiningSlot = true;
                Mp2Firebase.joinSlot(code, slot, boot).then(function (joinedSlot) {
                    if (ref) ref.off("value");
                    proceedToMatch(code, joinedSlot);
                }).catch(function (err) {
                    showErr(err.message || "Could not join slot");
                    btn.disabled = false;
                    btn.textContent = "Join Slot";
                }).finally(function () {
                    isJoiningSlot = false;
                });
            });
        });

        document.getElementById("cancelSlotSelection").addEventListener("click", function () {
            if (ref) {
                ref.off("value");
                ref = null;
            }
            slotBlock.style.display = "none";
            form.style.display = "block";
            if (createInsteadBtn) createInsteadBtn.style.display = "block";
            pricingCard.style.maxWidth = "420px";
        });

        var terminateBtn = document.getElementById("terminateRoomBtn");
        if (terminateBtn) {
            terminateBtn.addEventListener("click", function () {
                if (!confirm("Terminate room? All players will be removed and the room will close.")) return;
                Mp2Firebase.terminateRoom(code, boot.userId).then(function () {
                    showErr("Room terminated.");
                }).catch(function (err) {
                    showErr(err.message || "Could not terminate room");
                });
            });
        }
    }

    function renderSlotCard(code, slot, roleLabel, occupant) {
        var html = '';
        if (occupant) {
            html += '<div class="slot-card occupied">';
            html += '<span class="slot-role">' + esc(roleLabel) + '</span>';
            html += '<span class="slot-player">' + esc(occupant.username) + '</span>';
            html += '</div>';
        } else {
            html += '<div class="slot-card">';
            html += '<span class="slot-role">' + esc(roleLabel) + '</span>';
            html += '<span class="slot-player" style="color:var(--slate-warm);font-style:italic;">Available</span>';
            html += '<button type="button" class="slot-join-btn" data-slot="' + slot + '">Join Slot</button>';
            html += '</div>';
        }
        return html;
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        msg.style.display = "none";
        var code = input.value.trim().toUpperCase();
        if (code.length !== 4) {
            showErr("Enter a 4-character code.");
            return;
        }

        var roomRef = Mp2Firebase.roomRef(code);
        roomRef.once("value").then(function (snap) {
            if (!snap.exists()) {
                throw new Error("Room not found");
            }
            var room = snap.val();
            if (room.meta.teaming_mode === "slot") {
                ref = roomRef;
                ref.on("value", function (snap) {
                    var room = snap.val();
                    if (!room) return;
                    var players = room.players || {};
                    // If the game has moved past lobby, redirect to match page
                    // Redirect to match page when game has progressed beyond lobby
                    if (room.game && room.game.stage !== "lobby") {
                        if (isJoiningSlot) return;
                        if (ref) ref.off("value");
                        window.location.href = "mp_2v2_match.php";
                        return;
                    }
                    var existingSlot = Object.keys(players).find(function (s) {
                        return players[s] && players[s].userId === boot.userId;
                    });
                    if (existingSlot) {
                        if (ref) ref.off("value");
                        proceedToMatch(code, existingSlot);
                        return;
                    }

                    var isFull = Object.keys(players).length >= 4;
                    if (isFull) {
                        showErr("Room is full.");
                        if (ref) ref.off("value");
                        return;
                    }
                    
                    renderSlotsUI(code, players, room);
                });
            } else {
                doStandardJoin(code);
            }
        }).catch(function (err) {
            showErr(err.message || "Room not found or error occurred");
        });
    });

    var urlParams = new URLSearchParams(window.location.search);
    var roomCodeParam = urlParams.get("room");
    if (roomCodeParam) {
        input.value = roomCodeParam.toUpperCase().slice(0, 4);
        setTimeout(function() {
            form.dispatchEvent(new Event("submit"));
        }, 100);
    }
})();
</script>
</body>
</html>
