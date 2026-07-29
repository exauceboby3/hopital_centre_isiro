<?php
session_start();

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'medecin') {
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
        $stmt = $db->prepare("SELECT c.idCONSULTATION, c.idPatient, c.dateCons, c.rapport, p.nom_p, p.postnom_p
            FROM consultation c
            JOIN patient p ON c.idPatient = p.idPATIENT
            WHERE c.idMedecin = ? AND (c.rapport IS NULL OR c.rapport = 'Consultation en cours')
            ORDER BY c.dateCons DESC");
        $stmt->execute([$idMedecin]);
        $consultations = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($consultations as $row) {
            echo "<tr>";
            echo "<td>" . htmlspecialchars($row['nom_p'] . ' ' . $row['postnom_p']) .
                 "<br><a href='details.php?id=" . $row['idPatient'] . "' class='btn btn-link btn-sm'>Voir détails</a></td>";
            echo "<td>" . htmlspecialchars($row['dateCons']) . "</td>";
            echo "<td>" . htmlspecialchars($row['rapport'] ?? 'En attente') . "</td>";
            echo "<td>";
            if (empty($row['rapport'])) {
                echo "<a href='?action=demarrer&id={$row['idCONSULTATION']}' class='btn btn-success btn-sm'>Démarrer</a> ";
                echo "<a href='?action=renvoyer&id={$row['idCONSULTATION']}' class='btn btn-warning btn-sm'>Renvoyer</a>";
            } elseif ($row['rapport'] === 'Consultation en cours') {
                echo "<a href='?action=terminer&id={$row['idCONSULTATION']}' class='btn btn-danger btn-sm'>Terminer</a>";
            } else {
                echo "-";
            }
            echo "</td>";
            echo "</tr>";
        }
    }

} catch (Exception $e) {
    echo "<tr><td colspan='4'>Erreur : " . htmlspecialchars($e->getMessage()) . "</td></tr>";
}
