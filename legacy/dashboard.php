<?php
session_start();

try {
    $connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Erreur: " . $e->getMessage());
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION['date_debut'] = $_POST['date_debut'] ?? date('Y-m-01');
    $_SESSION['date_fin'] = $_POST['date_fin'] ?? date('Y-m-d');
    $_SESSION['medecin'] = $_POST['medecin'] ?? '';
    $_SESSION['service'] = $_POST['service'] ?? '';
}

$dateDebut = $_SESSION['date_debut'] ?? date('Y-m-01');
$dateFin = $_SESSION['date_fin'] ?? date('Y-m-d');
$medecin = $_SESSION['medecin'] ?? '';
$service = $_SESSION['service'] ?? '';

$role = $_SESSION['role'] ?? 'inconnu';
$user_id = $_SESSION['id'] ?? 0;

$medecinCondition = $medecin ? "AND idMedecin = $medecin" : "";
$serviceCondition = $service ? "AND service = '$service'" : "";

function getCount($db, $sql)
{
    $stmt = $db->prepare($sql);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row['total'] ?? 0;
}

function getSum($db, $sql)
{
    $stmt = $db->prepare($sql);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row['total'] ?? 0;
}

$patients_attente = getCount($connexionDB, "SELECT COUNT(*) as total FROM patient WHERE DateRdv BETWEEN '$dateDebut' AND '$dateFin' $serviceCondition");

if ($role === 'medecin') {
    $consultations_jour = getCount($connexionDB, "SELECT COUNT(*) as total FROM consultation WHERE dateCons BETWEEN '$dateDebut' AND '$dateFin' AND idMedecin = $user_id");
    $recettes_jour = 0;
} elseif ($role === 'infirmier') {
    $consultations_jour = getCount($connexionDB, "SELECT COUNT(*) as total FROM consultation WHERE dateCons BETWEEN '$dateDebut' AND '$dateFin'");
    $recettes_jour = 0;
} elseif ($role === 'secretaire') {
    $consultations_jour = 0;
    $recettes_jour = getSum($connexionDB, "SELECT SUM(montant) as total FROM facture WHERE DATE(dateEmission) BETWEEN '$dateDebut' AND '$dateFin'");
} else {
    $consultations_jour = getCount($connexionDB, "SELECT COUNT(*) as total FROM consultation WHERE dateCons BETWEEN '$dateDebut' AND '$dateFin' $medecinCondition");
    $recettes_jour = getSum($connexionDB, "SELECT SUM(montant) as total FROM facture WHERE DATE(dateEmission) BETWEEN '$dateDebut' AND '$dateFin'");
}

$stock_alertes = getCount($connexionDB, "SELECT COUNT(*) as total FROM pharmacie WHERE quantite <= seuil_minimal");

?>

<style>
    @media print {

        .btn,
        nav,
        aside,
        footer {
            display: none !important;
        }

        body {
            margin: 0;
        }

        .container,
        .container-fluid {
            width: 100% !important;
        }
    }
</style>

<div>
    <link href="css/bootstrap.min.css" rel="stylesheet" id="bootstrap-css">
    <link rel="stylesheet" href="home.css" />
    <link rel='stylesheet prefetch' href='http://cdn.datatables.net/1.10.10/css/dataTables.bootstrap.min.css'>


    <script src="//code.jquery.com/jquery-1.10.2.min.js"></script>
    <script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.0/js/bootstrap.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

    <?php
    include 'home.php';
    ?>
    <div class="text-right mr-3 mt-2">
        <span class="badge badge-success">✅En ligne</span>
        <span class="badge badge-info">Nouveaux messages: <?php echo $messages_nouveaux; ?></span>
    </div>
    <div class="container-fluid mt-4">
        <h2 class="text-center mb-4">Tableau de bord</h2>

        <form method="POST" action="" class="form-inline justify-content-center mb-4">
            <div class="form-group mx-2">
                <label for="date_debut">Date début:</label>
                <input type="date" name="date_debut" id="date_debut" class="form-control" value="<?php echo htmlspecialchars($dateDebut); ?>">
            </div>
            <div class="form-group mx-2">
                <label for="date_fin">Date fin:</label>
                <input type="date" name="date_fin" id="date_fin" class="form-control" value="<?php echo htmlspecialchars($dateFin); ?>">
            </div>
            <div class="form-group mx-2">
                <label for="medecin">Médecin:</label>
                <select name="medecin" id="medecin" class="form-control">
                    <option value="">Tous</option>
                    <?php
                    $stmt = $connexionDB->prepare("SELECT idMEDECIN, nom_m, postnom_m FROM medecin");
                    $stmt->execute();
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $selected = ($medecin == $row['idMEDECIN']) ? 'selected' : '';
                        echo "<option value=\"{$row['idMEDECIN']}\" $selected>{$row['nom_m']} {$row['postnom_m']}</option>";
                    }
                    ?>
                </select>
            </div>
            <div class="form-group mx-2">
                <label for="service">Service:</label>
                <select name="service" id="service" class="form-control">
                    <option value="">Tous</option>
                    <?php
                    $stmt = $connexionDB->prepare("SELECT DISTINCT service FROM patient WHERE service IS NOT NULL AND service <> ''");
                    $stmt->execute();
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $selected = ($service == $row['service']) ? 'selected' : '';
                        echo "<option value=\"{$row['service']}\" $selected>{$row['service']}</option>";
                    }
                    ?>
                </select>
            </div>
            <button type="submit" class="btn btn-primary ml-2">Filtrer</button>
        </form>

        <div class="row justify-content-center" style="align-items : center">
            <?php if ($role == 'admin' || $role == 'infirmier' || $role == 'medecin'): ?>
                <div class="col-md-2 m-2">
                    <div class="card text-white bg-info">
                        <div class="card-body text-center">
                            <h5>Patients en attente</h5>
                            <h2><?php echo $patients_attente; ?></h2>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
            <?php if ($role == 'admin' || $role == 'secretaire' || $role == 'infirmier' || $role == 'medecin'): ?>
                <div class="col-md-2 m-2">
                    <div class="card text-white bg-success">
                        <div class="card-body text-center">
                            <h5>Consultations</h5>
                            <h2><?php echo $consultations_jour; ?></h2>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
            <?php if ($role == 'admin' || $role == 'secretaire'): ?>
                <div class="col-md-2 m-2">
                    <div class="card text-dark bg-warning">
                        <div class="card-body text-center">
                            <h5>Recettes</h5>
                            <h2><?php echo number_format($recettes_jour, 2, ',', ' '); ?> Fc</h2>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
            <?php if ($role == 'admin' || $role == 'secretaire'): ?>
                <div class="col-md-2 m-2">
                    <div class="card text-white bg-danger">
                        <div class="card-body text-center">
                            <h5>Alertes stock</h5>
                            <h2><?php echo $stock_alertes; ?></h2>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
    </div>
    <div class="text-center mb-3">
        <button class="btn btn-secondary" onclick="window.print()">
            <i class="fas fa-print"></i> Imprimer le rapport
        </button>
        <button class="btn btn-danger" onclick="exportPDF()">
            <i class="fas fa-file-pdf"></i> Exporter en PDF
        </button>
        <button class="btn btn-success" onclick="exportExcel()">
            <i class="fas fa-file-excel"></i> Exporter en Excel
        </button>
    </div>
    <div class="mt-4">
        <canvas id="statsChart" height="100"></canvas>
    </div>
</div>

<script src="https://kit.fontawesome.com/a076d05399.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<?php if ($role == 'admin'): ?>
    <script>
        const ctx = document.getElementById('statsChart').getContext('2d');
        const statsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Patients en attente', 'Consultations', 'Recettes', 'Alertes stock'],
                datasets: [{
                    label: 'Statistiques',
                    data: [<?php echo $patients_attente; ?>, <?php echo $consultations_jour; ?>, <?php echo $recettes_jour ?: 0; ?>, <?php echo $stock_alertes; ?>],
                    backgroundColor: ['#17a2b8', '#28a745', '#ffc107', '#dc3545']
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
<?php endif; ?>

<script>
    function exportPDF() {
        const {
            jsPDF
        } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        html2canvas(document.body, {
            scale: 2
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = canvas.height * imgWidth / canvas.width;

            doc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            const date = new Date().toLocaleDateString();
            doc.save(`Rapport_Statistiques_${date}.pdf`);
        });
    }

    function exportExcel() {
        const wb = XLSX.utils.book_new();
        const ws_data = [
            ["Rapport Statistiques", new Date().toLocaleDateString()],
            [],
            ["Statistique", "Valeur"],
            ["Patients en attente", "<?php echo $patients_attente; ?>"],
            ["Consultations", "<?php echo $consultations_jour; ?>"],
            ["Recettes", "<?php echo number_format($recettes_jour, 2, ',', ' '); ?> Fc"],
            ["Alertes stock", "<?php echo $stock_alertes; ?>"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, "Rapport");
        XLSX.writeFile(wb, `Rapport_Statistiques_${new Date().toLocaleDateString()}.xlsx`);
    }
</script>