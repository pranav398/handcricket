<?php
    session_start();
    if (isset($_SESSION["user_id"])) {
        header("Location: dashboard.php");
        exit;
    }
?>

<?php
include "assets/includes/db.php";

$msg = "";

if (isset($_POST["submit"])) {
    $username = trim($_POST["name"]);
    $password = $_POST["pass"];

    if (!empty($username) && !empty($password)) {

        // 🔍 1. Find user by username
        $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows == 1) {
            $user = $result->fetch_assoc();

            // 🔐 2. Verify password
            if (password_verify($password, $user["password"])) {

                // 🧠 3. Create session
                $_SESSION["user_id"] = $user["id"];
                $_SESSION["username"] = $user["username"];
                $_SESSION["total"] = $user["total"];
                $_SESSION["wins"] = $user["wins"];

                header("Location: dashboard.php");
                exit;
            } else {
                if($user["password"] == '0'){
                    $msg = "Your account is locked due to unauthorized access attempts";
                }
                else{
                    $msg = "Incorrect password";
                }
            }

        } else {
            $msg = "Username not found";
        }

    } else {
        $msg = "All fields are required";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - HandCricket</title>
</head>
<body>
    <?php include 'assets/includes/header.php'; ?>

    <main class="main auth-page">
        <section class="auth-wrapper">
            <div class="auth-left">
                <p class="auth-tag">WELCOME BACK</p>
                <h1>Enter The<br><span>Arena</span></h1>

                <p class="auth-text">Login to continue your matches,track wins, and challenge your friends.</p>
            </div>

            <div class="auth-card">
                <h2>Login</h2>
                <?php if (!empty($msg)) { ?>
                    <div style="
                        background: #f8d7da;
                        color: #721c24;
                        padding: 10px;
                        margin-bottom: 10px;
                        border-radius: 5px;
                        text-align: center;
                    ">
                        <?php echo $msg; ?>
                    </div>
                <?php } ?>
                <form method="post" action="">
                    <div class="auth-field">
                        <label>Username</label>
                        <input type="text" name="name" placeholder="Enter username" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" name="pass" placeholder="Enter password" required>
                    </div>
                    <button type="submit" class="auth-btn" name="submit">Login</button>
                </form>

                <div class="auth-divider"><span></span><p>OR</p><span></span></div>
                <a href="register.php" class="auth-secondary-btn">Create New Account</a>
            </div>
        </section>
    </main>
</body>
</html>