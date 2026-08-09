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

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $username = trim($_POST["name"]);
    $email = trim($_POST["mail"]);
    $password = $_POST["pass"];
    $confirm = $_POST["pass2"];

    // ❌ 1. Password check FIRST
    if ($password !== $confirm) {
        $msg = "Passwords do not match";
    }
    else if (!empty($username) && !empty($email) && !empty($password)) {

        // 🔍 2. Check username
        $checkUser = $conn->prepare("SELECT id FROM users WHERE username = ?");
        $checkUser->bind_param("s", $username);
        $checkUser->execute();
        $checkUser->store_result();

        if ($checkUser->num_rows > 0) {
            $msg = "Username already taken";
        }
        else {

            // 🔍 3. Check email
            $checkEmail = $conn->prepare("SELECT id FROM users WHERE email = ?");
            $checkEmail->bind_param("s", $email);
            $checkEmail->execute();
            $checkEmail->store_result();

            if ($checkEmail->num_rows > 0) {
                $msg = "Email already registered";
            }
            else {

                // 🔐 4. Insert user
                $hashed_password = password_hash($password, PASSWORD_DEFAULT);

                $stmt = $conn->prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
                $stmt->bind_param("sss", $username, $email, $hashed_password);

                if ($stmt->execute()) {
                    echo "<script>alert('Account created successfully!'); window.location.href='login.php';</script>";
                    exit;
                }
                else {
                    $msg = "Something went wrong";
                }
            }
        }
    }
    else{
        $msg = "All fields are required";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register - HandCricket</title>
</head>
<body>
    <?php include 'assets/includes/header.php'; ?>

    <main class="main auth-page">
        <section class="auth-wrapper">
            <div class="auth-left">
                <p class="auth-tag">CREATE ACCOUNT</p>
                <h1>Start Your<br><span>Journey</span></h1>
                <p class="auth-text">Create your account and begin competingwith friends in real-time hand cricket matches.</p>
            </div>

            <div class="auth-card">
                <h2>Register</h2>
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
                        <input type="text" placeholder="Choose username" name="name" required>
                    </div>
                    <div class="auth-field">
                        <label>Email</label>
                        <input type="email" placeholder="Enter email" name="mail" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" placeholder="Create password" name="pass" required>
                    </div>
                    <div class="auth-field">
                        <label>Confirm Password</label>
                        <input type="password" placeholder="Confirm password" name="pass2" required>
                    </div>
                    <button type="submit" class="auth-btn" name="sub">Create Account</button>
                </form>
                
                <div class="auth-divider"><span></span><p>OR</p><span></span></div>
                <a href="login.php" class="auth-secondary-btn">Already Have An Account</a>
            </div>
        </section>
    </main>
</body>
</html>
