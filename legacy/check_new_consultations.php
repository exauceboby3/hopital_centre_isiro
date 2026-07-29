<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'medecin') {
    echo json_encode(['nouvelles' => []]);
    exit;
}

try {
    $db = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $user_id = $_SESSION['id'];
    $stmt = $db->prepare("SELECT idMEDECIN FROM medecin WHERE idUser = ?");
    $stmt->execute([$user_id]);
    $medecin = $stmt->fetch(PDO::FETCH_ASSOC);
    $idMedecin = $medecin['idMEDECIN'] ?? 0;

    if ($idMedecin > 0) {
        $stmt = $db->prepare("SELECT idCONSULTATION FROM consultation 
            WHERE idMedecin = ? AND (rapport IS NULL OR rapport = 'Consultation en cours')");
        $stmt->execute([$idMedecin]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        echo json_encode(['nouvelles' => $ids]);
        exit;
    }

} catch (Exception $e) {
    echo json_encode(['nouvelles' => [], 'erreur' => $e->getMessage()]);
    exit;
}
