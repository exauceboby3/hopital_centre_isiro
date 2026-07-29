<?php
session_start();
if (!isset($_SESSION['id'])) {
    echo 0;
    exit();
}

try {
    $db = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $user_id = $_SESSION['id'];
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM message WHERE idReceiver = :id AND lu = 0");
    $stmt->execute(['id' => $user_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo $row['total'] ?? 0;
} catch (PDOException $e) {
    echo 0;
}
?>
