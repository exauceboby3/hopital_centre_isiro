<?php
session_start();
try {
    $pdo = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Erreur: " . $e->getMessage());
}
if (!isset($_SESSION['id']) || $_SESSION['role'] !== 'medecin') {
    header("Location: login.php");
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $idPatient = intval($_POST['idPatient']);
    $idMedecin = $_SESSION['idMedecin'] ?? null;
    $typeE = $_POST['typeE'] ?? '';
    $dateExamen = $_POST['dateExamen'] ?? date('Y-m-d');
    $resultat = $_POST['resultatExamen'] ?? '';
    $nomFichier = null;

    if (isset($_FILES['fichierExam']) && $_FILES['fichierExam']['error'] === UPLOAD_ERR_OK) {
        $fileTmp = $_FILES['fichierExam']['tmp_name'];
        $fileName = basename($_FILES['fichierExam']['name']);
        $fileExt = pathinfo($fileName, PATHINFO_EXTENSION);
        $allowedExt = ['pdf', 'jpg', 'jpeg', 'png'];

        if (in_array(strtolower($fileExt), $allowedExt)) {
            $nomFichier = uniqid() . '.' . $fileExt;
            $uploadDir = 'uploads/examens/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }
            move_uploaded_file($fileTmp, $uploadDir . $nomFichier);
        }
    }

    $stmt = $pdo->prepare("
        INSERT INTO examen (idPatient, idMedecin, dateExamen, typeE, resultatExamen, fichierExam)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$idPatient, $idMedecin, $dateExamen, $typeE, $resultat, $nomFichier]);

    header("Location: details.php?id=" . $idPatient . "&section=examen");
    exit();
}
