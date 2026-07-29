<?php
session_start();
if ($_SESSION['type'] !== 'medecin') {
    die("Accès interdit");
}

try {
    $db = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $db->prepare("INSERT INTO examen (idPatient, type, observation, dateDemande, statut)
                          VALUES (?, ?, ?, NOW(), 'En attente')");
    $stmt->execute([
        $_POST['id_patient'],
        $_POST['type'],
        $_POST['observation']
    ]);

    header("Location: details.php?idp=" . $_POST['id_patient']);
    exit();

} catch (PDOException $e) {
    die("Erreur DB : " . $e->getMessage());
}
