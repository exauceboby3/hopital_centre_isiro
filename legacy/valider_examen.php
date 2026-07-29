<?php
session_start();
if ($_SESSION['role'] !== 'laborantin') {
    die("Accès interdit.");
}

try {
    $db = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Récupérer ID du laborantin connecté
    $stmt = $db->prepare("SELECT idLABORANTIN FROM laborantin WHERE idUser = ?");
    $stmt->execute([$_SESSION['id']]);
    $lab = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$lab) die("Laborantin introuvable.");

    // Valider l'examen
    $stmt = $db->prepare("UPDATE examen SET valide_par_labo = 1, date_validation = NOW(), idLaborantin = ? WHERE idEXAMEN = ?");
    $stmt->execute([$lab['idLABORANTIN'], $_POST['idExamen']]);

    header("Location: details.php?idp=" . $_GET['idp']);
    exit();
} catch (PDOException $e) {
    die("Erreur : " . $e->getMessage());
}
?>
