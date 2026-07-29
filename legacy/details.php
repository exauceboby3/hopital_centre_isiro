<?php
session_start();
if (!isset($_SESSION['role'])) {
    header("Location: login.php");
    exit();
}
$role = $_SESSION['role'];

if (isset($_GET['idp'])) {
    $idPatient = $_GET['idp'] ?? null;
} else {
    die("Aucun patient sélectionné.");
}
try {
    $pdo = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Erreur de connexion : " . $e->getMessage());
}

$patientId = isset($_GET['idp']) ? intval($_GET['idp']) : 0;
$activeSection = isset($_GET['section']) ? $_GET['section'] : 'infos';


$stmt = $pdo->prepare("SELECT * FROM patient WHERE idPATIENT = ?");
$stmt->execute([$patientId]);
$patient = $stmt->fetch();

if (!$patient) {
    die("Patient introuvable.");
}
$stmt = $pdo->prepare("SELECT c.orientation, m.nom_m, m.postnom_m, m.prenom_m
                       FROM consultation c
                       LEFT JOIN medecin m ON c.orientation = m.idMEDECIN
                       WHERE c.idPatient = ?
                       ORDER BY c.dateCons DESC
                       LIMIT 1");
$stmt->execute([$patientId]);
$orientation = $stmt->fetch();


?>

<!DOCTYPE html>
<html lang="fr">

<head>
    <meta charset="UTF-8">
    <title>Dossier Patient</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <style>
        body {
            background-color: #f8f9fa;
            font-size: 18px;
        }

        .sidebar {
            height: 100vh;
            background-color: #00796B;
            padding: 1rem;
            color: white;
        }

        .sidebar a {
            color: white;
            display: block;
            font-size: 20px;
            padding: 0.5rem;
            text-decoration: none;
        }

        .sidebar a:hover {
            background-color: #495057;
            border-radius: 5px;
        }

        .content-section {
            display: none;
        }

        .content-section.active {
            display: block;
        }
    </style>
</head>

<body>

    <div class="container-fluid">
        <div class="row">
            <div class="col-md-3 sidebar">
                <a href="details.php?idp=<?= $idPatient ?>&section=infos">👤 Infos Patient</a>
                <?php if ($role == 'admin' || $role == 'medecin'): ?>
                    <a href="details.php?idp=<?= $idPatient ?>&section=consultation">📝 Consultation</a>
                <?php endif; ?>
                <a href="details.php?idp=<?= $idPatient ?>&section=orientation">🧭 Orientation</a>
                <a href="details.php?idp=<?= $idPatient ?>&section=examen">🔬 Examen</a>
                <a href="dashboard.php">🏠 Retour à l'accueil</a>
            </div>

            <div class="col-md-9 p-4">
                <h2 class="mb-4">Dossier du Patient</h2>
                <div id="infos" class="content-section <?= $activeSection === 'infos' ? 'active' : '' ?>">
                    <h4>Informations du patient</h4>
                    <p><strong>Nom :</strong> <?= $patient['nom_p'] ?></p>
                    <p><strong>Post-nom :</strong> <?= $patient['postnom_p'] ?></p>
                    <p><strong>Prénom :</strong> <?= $patient['prenom_p'] ?></p>
                    <p><strong>Sexe :</strong> <?= $patient['sexe'] ?></p>
                    <p><strong>Adresse :</strong> <?= $patient['adresse_p'] ?></p>
                    <p><strong>Température :</strong> <?= $patient['temp'] ?> °C</p>
                    <p><strong>Tension :</strong> <?= $patient['tension'] ?></p>
                    <p><strong>Poids :</strong> <?= $patient['poids'] ?> kg</p>
                    <p><strong>Pathologie :</strong> <?= $patient['pathologie'] ?></p>
                </div>

                <?php if ($_SESSION['role'] === 'medecin'): ?>
                    <?php
                    $stmt = $pdo->prepare("SELECT idMEDECIN, nom_m, postnom_m, prenom_m FROM medecin");
                    $stmt->execute();
                    $medecins = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    ?>
                    <?php if (isset($_GET['message']) && $_GET['message'] == 'consultation_ok') : ?>
                        <div style="background: #d4edda; color: #155724; padding: 10px 15px; border: 1px solid #c3e6cb; border-radius: 5px; margin-bottom: 20px;">
                            ✅ Consultation enregistrée avec succès.
                        </div>
                    <?php endif; ?>

                    <div id="consultation" class="content-section <?= $activeSection === 'consultation' ? 'active' : '' ?>">
                        <div class="section-header">🩺 Consultations</div>
                        <?php
                        $stmt = $pdo->prepare("SELECT * FROM consultation WHERE idPatient = ? ORDER BY dateCons DESC");
                        $stmt->execute([$idPatient]);
                        $consultations = $stmt->fetchAll(PDO::FETCH_ASSOC);

                        if ($consultations):
                            foreach ($consultations as $consult):
                        ?>
                                <div class="card">
                                    <div class="row">
                                        <div class="col"><span class="label">Date :</span> <?= $consult['dateCons'] ?></div>
                                        <div class="col"><span class="label">Motif :</span> <?= htmlspecialchars($consult['motif']) ?></div>
                                    </div>
                                    <div class="row">
                                        <div class="col"><span class="label">Rapport :</span> <?= nl2br(htmlspecialchars($consult['rapport'])) ?></div>
                                        <div class="col"><span class="label">Orientation :</span> <?= $consult['orientation'] ?: 'Aucune' ?></div>
                                    </div>
                                    <?php if (!empty($consult['ordonnance'])): ?>
                                        <div class="row">
                                            <div class="col"><span class="label">Ordonnance :</span><br><?= nl2br(htmlspecialchars($consult['ordonnance'])) ?></div>
                                        </div>
                                    <?php endif; ?>
                                    <?php if (!empty($consult['certificat'])): ?>
                                        <div class="row">
                                            <div class="col"><span class="label">Certificat :</span><br><?= nl2br(htmlspecialchars($consult['certificat'])) ?></div>
                                        </div>
                                    <?php endif; ?>
                                </div>
                        <?php
                            endforeach;
                        else:
                            echo "<div class='alert alert-info'>Aucune consultation enregistrée.</div>";
                        endif;
                        ?>

                        <?php if ($_SESSION['role'] === 'medecin'): ?>
                            <button class="btn btn-success mb-3" data-bs-toggle="modal" data-bs-target="#consultationModal">
                                ➕ Ajouter Consultation
                            </button>
                        <?php endif; ?>
                    </div>

                    <div class="modal fade" id="consultationModal" tabindex="-1" aria-labelledby="consultationModalLabel" aria-hidden="true">
                        <div class="modal-dialog modal-lg">
                            <div class="modal-content">
                                <form method="POST" action="ajouter_consultation.php">
                                    <div class="modal-header">
                                        <h5 class="modal-title" id="consultationModalLabel">Nouvelle Consultation</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
                                    </div>
                                    <div class="modal-body">
                                        <input type="hidden" name="idPatient" value="<?= htmlspecialchars($idPatient) ?>">
                                        <div class="mb-3">
                                            <label for="motif" class="form-label">Motif</label>
                                            <input type="text" class="form-control" name="motif" required>
                                        </div>

                                        <div class="mb-3">
                                            <label for="orientation" class="form-label">Orientation</label>
                                            <select class="form-select" name="orientation">
                                                <option value="">Aucune</option>
                                                <option value="Laboratoire">Laboratoire</option>
                                                <option value="Pharmacie">Pharmacie</option>
                                                <option value="Radiologie">Radiologie</option>
                                                <option value="Hospitalisation">Hospitalisation</option>
                                            </select>
                                        </div>

                                        <div class="mb-3">
                                            <label for="rapport" class="form-label">Rapport</label>
                                            <textarea name="rapport" class="form-control" rows="4" required></textarea>
                                        </div>

                                        <div class="mb-3">
                                            <label for="ordonnance" class="form-label">Ordonnance</label>
                                            <textarea name="ordonnance" class="form-control" rows="4"></textarea>
                                        </div>

                                        <div class="mb-3">
                                            <label for="certificat" class="form-label">Certificat</label>
                                            <textarea name="certificat" class="form-control" rows="3"></textarea>
                                        </div>

                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                                        <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                <?php endif; ?>


                <div id="orientation" class="content-section <?= $activeSection === 'orientation' ? 'active' : '' ?>">

                    <h4>🧭 Orientation actuelle</h4>
                    <?php if ($orientation && $orientation['orientation']): ?>
                        <p class="alert alert-info"><strong>Orienté vers :</strong> <?= $orientation['orientation'] ?></p>
                    <?php else: ?>
                        <p class="text-muted">Aucune orientation enregistrée.</p>
                    <?php endif; ?>

                </div>
                <div id="examen" class="content-section <?= $activeSection === 'examen' ? 'active' : '' ?>">
                    <div class="section-header" onclick="toggleSection('examens-content')">
                        🔬 Examens demandés
                    </div>

                    <div class="content show" id="examens-content">
                        <?php
                       $stmt = $pdo->prepare("
                       SELECT 
                           e.*, 
                           CONCAT(m.nom_m, ' ', m.postnom_m, ' ', m.prenom_m) AS nomMedecin,
                           CONCAT(l.nomLaborantin, ' ', l.postnomLaborantin, ' ', l.prenomLaborantin) AS nomLaborantin
                       FROM examen e 
                       LEFT JOIN medecin m ON e.idMedecin = m.idMEDECIN 
                       LEFT JOIN laborantin l ON e.idLaborantin = l.idLABORANTIN
                       WHERE e.idPatient = ?
                   ");
                   
                    
                        $stmt->execute([$idPatient]);
                        $examens = $stmt->fetchAll();

                        ?>
                        <table class="table table-bordered">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Date</th>
                                    <th>Résultat</th>
                                    <th>Fichier</th>
                                    <th>Médecin</th>
                                    <th>Validation</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($examens as $examen): ?>
                                    <tr>
                                        <td><?= htmlspecialchars($examen['typeE']) ?></td>
                                        <td><?= htmlspecialchars($examen['dateExamen']) ?></td>
                                        <td><?= nl2br(htmlspecialchars($examen['resultatExamen'])) ?></td>
                                        <td>
                                            <?php if ($examen['fichierExam']): ?>
                                                <a href="uploads/examens/<?= $examen['fichierExam'] ?>" target="_blank">📎 Voir</a>
                                            <?php else: ?>
                                                Aucun
                                            <?php endif; ?>
                                        </td>
                                        <td><?= htmlspecialchars($examen['nomMedecin'] ?? '---') ?></td>
                                        <td>
                                            <?php if ($examen['valide_par_labo']): ?>
                                                ✅ Validé le <?= $examen['date_validation'] ?>
                                            <?php elseif ($_SESSION['role'] === 'laborantin'): ?>
                                                <form method="POST" action="valider_examen.php" style="display:inline;">
                                                    <input type="hidden" name="idExamen" value="<?= $examen['idEXAMEN'] ?>">
                                                    <button type="submit" class="btn btn-sm btn-outline-success">✔ Valider</button>
                                                </form>
                                            <?php else: ?>
                                                ⏳ En attente
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>

                        <?php if ($_SESSION['role'] === 'medecin') : ?>
                            <button class="btn btn-success mb-3" data-bs-toggle="modal" data-bs-target="#modalExamen">
                                ➕ Ajouter un examen
                            </button>

                            <div class="modal fade" id="modalExamen" tabindex="-1" aria-labelledby="modalExamenLabel" aria-hidden="true">
                                <div class="modal-dialog modal-lg">
                                    <div class="modal-content">
                                        <form method="POST" action="ajouter_examen.php" enctype="multipart/form-data">
                                            <div class="modal-header">
                                                <h5 class="modal-title" id="modalExamenLabel">Nouvel Examen</h5>
                                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
                                            </div>

                                            <input type="hidden" name="idPatient" value="<?= $idPatient ?>">

                                            <div class="modal-body">
                                                <div class="mb-3">
                                                    <label class="label">Type d'examen</label>
                                                    <input type="text" name="typeE" class="form-control" required>
                                                </div>
                                                <div class="mb-3">
                                                    <label class="label">Date de l'examen</label>
                                                    <input type="date" name="dateExamen" class="form-control" required>
                                                </div>
                                                <div class="mb-3">
                                                    <label class="label">Résultat (texte)</label>
                                                    <textarea name="resultatExamen" class="form-control" rows="3"></textarea>
                                                </div>
                                                <div class="mb-3">
                                                    <label class="label">Fichier (PDF/image)</label>
                                                    <input type="file" name="fichierExam" class="form-control">
                                                </div>
                                            </div>

                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        <?php endif; ?>

                    </div>
                </div>


            </div>
        </div>
    </div>

    <script>
        function showSection(id) {
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(id).classList.add('active');
        }
    </script>
    <script>
        function toggleSection(id) {
            const el = document.getElementById(id);
            el.classList.toggle("show");
        }
    </script>
    <?php if (!empty($_SESSION['notification_exam_audio'])): ?>
        <audio autoplay>
            <source src="sons/resultat_dispo.mp3" type="audio/mpeg">
        </audio>
        <?php unset($_SESSION['notification_exam_audio']); ?>
    <?php endif; ?>

</body>

</html>