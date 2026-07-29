<?php
if (!isset($_GET['idc'])) {
    die("ID consultation manquant.");
}

$idConsult = intval($_GET['idc']);
$db = new PDO("mysql:host=localhost;dbname=service", "root", "");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$stmt = $db->prepare("SELECT c.certificat, c.dateCons, p.nom_p, p.prenom_p FROM consultation c JOIN patient p ON c.idPatient = p.idPATIENT WHERE c.idCONSULTATION = ?");
$stmt->execute([$idConsult]);
$data = $stmt->fetch();

if (!$data || empty($data['certificat'])) {
    die("Certificat introuvable.");
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Certificat Médical</title>
    <style>
        body { font-family: Arial; padding: 30px; }
        .print-btn {
            background: #28a745; color: white;
            padding: 10px 20px;
            border: none;
            margin-bottom: 20px;
            cursor: pointer;
        }
        @media print {
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>

    <h2 style="text-align:center;">Certificat Médical</h2>
    <p><strong>Patient :</strong> <?= htmlspecialchars($data['nom_p'] . ' ' . $data['prenom_p']) ?></p>
    <p><strong>Date :</strong> <?= htmlspecialchars($data['dateCons']) ?></p>
    <hr>
    <p><?= nl2br(htmlspecialchars($data['certificat'])) ?></p>
</body>
</html>
