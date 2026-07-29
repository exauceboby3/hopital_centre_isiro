<?php
session_start();
$connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
$connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['id'] ?? 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $receiver_id = intval($_POST['receiver_id']);
    $message_content = trim($_POST['message_content']);

    if ($user_id && $receiver_id && $message_content) {
        $stmt = $connexionDB->prepare("INSERT INTO message (idSender, idReceiver, contenu) VALUES (?, ?, ?)");
        $stmt->execute([$user_id, $receiver_id, $message_content]);
        echo "OK";
    } else {
        echo "Erreur";
    }
}
?>
