<?php
session_start();
if (empty($_SESSION['user'])) {
    header('Location: login.php');
    exit();
}

try {
    $connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Erreur: " . $e->getMessage());
}

$role = $_SESSION['role'] ?? '';
$user_id = $_SESSION['id'] ?? 0;
$message = "";

$idMedecin = 0;
if ($role === 'medecin') {
    $stmt = $connexionDB->prepare("SELECT idMEDECIN FROM medecin WHERE idUser = ?");
    $stmt->execute([$user_id]);
    $medecin = $stmt->fetch(PDO::FETCH_ASSOC);
    $idMedecin = $medecin['idMEDECIN'] ?? 0;
}

if ($role === 'infirmier' && $_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['envoyer_consultation'])) {
    $idPatient = $_POST['idPatient'];
    $idMedecinForm = $_POST['idMedecin'];

    $stmt = $connexionDB->prepare("INSERT INTO consultation (idPatient, idMedecin, dateCons) VALUES (?, ?, CURDATE())");
    $stmt->execute([$idPatient, $idMedecinForm]);

    header("Location: dashboard.php");
    exit();
}

if ($role === 'medecin' && isset($_GET['action']) && isset($_GET['id'])) {
    $idConsultation = intval($_GET['id']);
    $action = $_GET['action'];

    if ($action === 'demarrer') {
        $stmt = $connexionDB->prepare("UPDATE consultation SET rapport = 'Consultation en cours' WHERE idCONSULTATION = ? AND idMedecin = ?");
        $stmt->execute([$idConsultation, $idMedecin]);
    } elseif ($action === 'terminer') {
        $stmt = $connexionDB->prepare("UPDATE consultation SET rapport = 'Consultation terminée' WHERE idCONSULTATION = ? AND idMedecin = ?");
        $stmt->execute([$idConsultation, $idMedecin]);
    } elseif ($action === 'renvoyer') {
        $stmt = $connexionDB->prepare("DELETE FROM consultation WHERE idCONSULTATION = ? AND idMedecin = ?");
        $stmt->execute([$idConsultation, $idMedecin]);
    }
}

$step = isset($_GET['idPatient']) ? 2 : 1;

?>
<?php include 'home.php'; ?>

<!DOCTYPE html>
<html lang="fr">

<head>
    <meta charset="UTF-8">
    <title>Gestion des Rendez-vous</title>
    <link rel="stylesheet" href="rendezvous.css">
    <style>
        .badge-nouveau {
            background: red;
            color: white;
            padding: 5px;
            animation: clignote 1s infinite;
        }

        @keyframes clignote {
            0% {
                opacity: 1;
            }

            50% {
                opacity: 0;
            }

            100% {
                opacity: 1;
            }
        }
    </style>
</head>

<body>

    <h3 class="text-center">📅 Gestion des Rendez-vous</h3>
    <?php if (!empty($message)) echo "<div class='alert alert-success'>$message</div>"; ?>
    <div id="popupNotification" style="
    display: none;
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #f44336;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    z-index: 9999;
    font-size: 16px;
    animation: fadeIn 0.5s ease-in-out;
">
        🔔 Nouvelle consultation assignée !
    </div>

    <style>
        @keyframes fadeIn {
            from {
                opacity: 0;
            }

            to {
                opacity: 1;
            }
        }
    </style>

    <?php if ($role === 'infirmier' && $step === 1): ?>
        <h4>1️⃣ Sélectionner un patient</h4>
        <input type="text" id="recherchePatient" placeholder="🔍 Rechercher un patient..." class="form-control mb-3">

        <table class="table" id="tablePatient">
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Post-nom</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                <?php
                $patients = $connexionDB->query("SELECT idPATIENT, nom_p, postnom_p FROM patient");
                foreach ($patients as $patient):
                ?>
                    <tr>
                        <td><?= htmlspecialchars($patient['nom_p']) ?></td>
                        <td><?= htmlspecialchars($patient['postnom_p']) ?></td>
                        <td>
                            <a href="?idPatient=<?= $patient['idPATIENT'] ?>" class="btn btn-primary btn-sm">Suivant</a>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <script>
            document.getElementById('recherchePatient').addEventListener('input', function() {
                let filtre = this.value.toLowerCase();
                document.querySelectorAll("#tablePatient tbody tr").forEach(tr => {
                    let nom = tr.children[0].textContent.toLowerCase();
                    let postnom = tr.children[1].textContent.toLowerCase();
                    tr.style.display = (nom.includes(filtre) || postnom.includes(filtre)) ? '' : 'none';
                });
            });
        </script>
    <?php endif; ?>
    <?php if ($role === 'infirmier' && $step === 2 && isset($_GET['idPatient'])):
        $idPatient = intval($_GET['idPatient']);
    ?>
        <?php

        $patientInfo = $connexionDB->prepare("SELECT nom_p, postnom_p FROM patient WHERE idPATIENT = ?");
        $patientInfo->execute([$idPatient]);
        $patient = $patientInfo->fetch(PDO::FETCH_ASSOC);
        ?>
        <h4>2️⃣ Sélectionner un médecin pour le patient <a href="" style="color:#f44336"><?= htmlspecialchars($patient['nom_p'] . ' ' . $patient['postnom_p']) ?></a></h4>
        <input type="text" id="rechercheMedecin" placeholder="🔍 Rechercher un médecin..." class="form-control mb-3">

        <table class="table" id="tableMedecin">
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Post-nom</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                <?php
                $medecins = $connexionDB->query("SELECT idMEDECIN, nom_m, postnom_m FROM medecin");
                foreach ($medecins as $medecin):
                ?>
                    <tr>
                        <td><?= htmlspecialchars($medecin['nom_m']) ?></td>
                        <td><?= htmlspecialchars($medecin['postnom_m']) ?></td>
                        <td>
                            <form method="POST">
                                <input type="hidden" name="idPatient" value="<?= $idPatient ?>">
                                <input type="hidden" name="idMedecin" value="<?= $medecin['idMEDECIN'] ?>">
                                <button type="submit" name="envoyer_consultation" class="btn btn-success btn-sm">Envoyer</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <script>
            document.getElementById('rechercheMedecin').addEventListener('input', function() {
                let filtre = this.value.toLowerCase();
                document.querySelectorAll("#tableMedecin tbody tr").forEach(tr => {
                    let nom = tr.children[0].textContent.toLowerCase();
                    let postnom = tr.children[1].textContent.toLowerCase();
                    tr.style.display = (nom.includes(filtre) || postnom.includes(filtre)) ? '' : 'none';
                });
            });
        </script>
    <?php endif; ?>

    <?php if ($role === 'medecin'): ?>
        <h4>🔹 Liste des consultations en attente / en cours
            <span id="nouveauBadge" style="display:none;" class="badge-nouveau">Nouvelle consultation</span>
        </h4>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Patient</th>
                    <th>Date consultation</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="consultationBody">
                <?php
                $stmt = $connexionDB->prepare("SELECT c.idCONSULTATION, c.idPatient, c.dateCons, c.rapport, p.nom_p, p.postnom_p
            FROM consultation c
            JOIN patient p ON c.idPatient = p.idPATIENT
            WHERE c.idMedecin = ? AND (c.rapport IS NULL OR c.rapport = 'Consultation en cours')
            ORDER BY c.dateCons DESC");
                $stmt->execute([$idMedecin]);
                $consultations = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($consultations as $row): ?>
                    <tr>
                        <td>
                            <?= htmlspecialchars($row['nom_p'] . ' ' . $row['postnom_p']) ?>
                            <br>
                            <a href="details.php?id=<?= $row['idPatient'] ?>" class="btn btn-link btn-sm">Voir détails</a>
                        </td>
                        <td><?= htmlspecialchars($row['dateCons']) ?></td>
                        <td><?= htmlspecialchars($row['rapport'] ?? 'En attente') ?></td>
                        <td>
                            <?php if (empty($row['rapport'])): ?>
                                <a href="?action=demarrer&id=<?= $row['idCONSULTATION'] ?>" class="btn btn-success btn-sm">Démarrer</a>
                                <a href="?action=renvoyer&id=<?= $row['idCONSULTATION'] ?>" class="btn btn-warning btn-sm">Renvoyer</a>
                            <?php elseif ($row['rapport'] === 'Consultation en cours'): ?>
                                <a href="?action=terminer&id=<?= $row['idCONSULTATION'] ?>" class="btn btn-danger btn-sm">Terminer</a>
                            <?php else: ?>
                                -
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <audio id="notifSound" src="assets/sounds/receive.mp3" preload="auto"></audio>

        <script>
            let consultationsExistantes = <?= json_encode(array_column($consultations, 'idCONSULTATION')) ?>;

            function showPopupNotification() {
                const popup = document.getElementById('popupNotification');
                popup.style.display = 'block';

                setTimeout(() => {
                    popup.style.display = 'none';
                }, 5000);
            }

            setInterval(() => {
                fetch('check_new_consultations.php')
                    .then(res => res.json())
                    .then(data => {
                        if (data.nouvelles.some(id => !consultationsExistantes.includes(id))) {
                            document.getElementById('notifSound').play();
                            document.getElementById('nouveauBadge').style.display = 'inline-block';
                            showPopupNotification();

                            fetch('get_consultations.php')
                                .then(res => res.text())
                                .then(html => {
                                    document.getElementById('consultationBody').innerHTML = html;
                                });

                            consultationsExistantes = data.nouvelles;
                        }
                    })
                    .catch(error => console.error('Erreur lors du check des consultations :', error));
            }, 2000);
        </script>
    <?php endif; ?>
    <script>
        function filtrerOptions(selectId, searchId) {
            const searchInput = document.getElementById(searchId);
            const selectElement = document.getElementById(selectId);

            searchInput.addEventListener('keyup', function() {
                const filtre = this.value.toLowerCase();
                for (let option of selectElement.options) {
                    const texte = option.text.toLowerCase();
                    option.style.display = texte.includes(filtre) ? 'block' : 'none';
                }
            });
        }

        filtrerOptions("selectPatient", "recherchePatient");
        filtrerOptions("selectMedecin", "rechercheMedecin");
    </script>

</body>

</html>