<?php
$host = "localhost";
$user = "root";
$pass = "";
$db   = "handcricket";

$conn = new mysqli($host, $user, $pass, $db);

// check connection
if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}
?>