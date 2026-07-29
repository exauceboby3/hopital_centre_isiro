<?php
session_start();

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'medecin') {
    die("Accès non autorisé.");
}

try {
    $pdo = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->prepare("SELECT * FROM patient WHERE idPatient = ?");
    $stmt->execute([$_POST['idPatient']]);
    $patient = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$patient) {
        die("Patient introuvable.");
    }
    $idPatient = $_POST['idPatient'] ?? null;

    if (!$idPatient) {
        die("ID patient manquant.");
    }
    
    $stmt = $pdo->prepare("SELECT idMEDECIN FROM medecin WHERE idUser = ?");
    $stmt->execute([$_SESSION['id']]);
    $medecin = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$medecin) {
        die("Médecin introuvable.");
    }

    $stmt = $pdo->prepare("INSERT INTO consultation (
        idPatient, idMedecin, dateCons, rapport, orientation, ordonnance, certificat, motif, statut
    ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, 'En cours')");

    $stmt->execute([
        $_POST['idPatient'],
        $medecin['idMEDECIN'],
        $_POST['rapport'],
        !empty($_POST['orientation']) ? $_POST['orientation'] : null,
        $_POST['ordonnance'],
        $_POST['certificat'],
        $_POST['motif']
    ]);

    header("Location: details.php?idp=" . $_POST['idPatient'] . "&section=consultation&message=consultation_ok");

    exit();
} catch (PDOException $e) {
    die("Erreur DB : " . $e->getMessage());
}
