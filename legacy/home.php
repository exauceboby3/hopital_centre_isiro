<!DOCTYPE html>
<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

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
if (isset($_SESSION['id'])) {
    $userId = $_SESSION['id'];
    $update = $connexionDB->prepare("UPDATE users SET last_active = NOW() WHERE idUser = ?");
    $update->execute([$userId]);
}

if (!function_exists('getCount')) {
    function getCount($db, $sql)
    {
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row['total'] ?? 0;
    }
}

if (!function_exists('getSum')) {
    function getSum($db, $sql)
    {
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row['total'] ?? 0;
    }
}

$role = $_SESSION['role'] ?? 'inconnu';
$user = $_SESSION['user'] ?? '';
$user_id = $_SESSION['id'] ?? 0;
$messages_nouveaux = getCount($connexionDB, "SELECT COUNT(*) as total FROM message WHERE idReceiver = $user_id AND lu = 0");

?>
<html lang="fr">

<head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, nofollow">
    <title>Dashboard - <?php echo ucfirst($role); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="css/bootstrap.min.css" rel="stylesheet" id="bootstrap-css">
    <link rel="stylesheet" href="home.css" />
    <link rel='stylesheet prefetch' href='http://cdn.datatables.net/1.10.10/css/dataTables.bootstrap.min.css'>

    <script src="//code.jquery.com/jquery-1.10.2.min.js"></script>
    <script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.0/js/bootstrap.min.js"></script>
</head>

<body>
    <div id="top-nav" class="navbar navbar-inverse navbar-static-top">
        <div class="container-fluid">
            <div class="navbar-header">
                <a class="navbar-brand" href="#">Service Hopital</a>
            </div>
            <div class="navbar-collapse collapse">
                <ul class="nav navbar-nav navbar-right">
                    <li>
                        <span class="navbar-text text-success">Connecté en tant que: <strong><?php echo htmlspecialchars($user); ?> (<?php echo ucfirst($role); ?>)</strong></span>
                    </li>
                    <li><a href="logOut.php"><i class="fa fa-sign-out"></i> Déconnexion </a></li>
                </ul>
            </div>
        </div>
    </div>

    <div class="col-lg-3 col-md-3 col-sm-3 col-xs-12" style="font-size:12px">
        <ul class="nav nav-pills nav-stacked" style="border-right:1px solid black">

            <li><a href="dashboard.php"><i class="fa fa-dashboard"></i> Tableau de bord</a></li>

            <?php if ($role == 'admin' || $role == 'secretaire' || $role == 'infirmier' || $role == 'medecin'|| $role == 'laborantin'): ?>
                <li><a href="messagerie.php"><i class="fa fa-envelope"></i> Messages : <span id="msg-count"><?php echo $messages_nouveaux; ?></span></a></li>
            <?php endif; ?>

            <?php if ($role == 'admin' || $role == 'secretaire' || $role == 'infirmier'|| $role == 'medecin'|| $role == 'laborantin'): ?>
                <li><a href="listePatient.php"><i class="fa fa-user"></i> Patient</a></li>
            <?php endif; ?>

            <?php if ($role == 'admin' || $role == 'secretaire'): ?>
                <li><a href="listeMedecin.php"><i class="fa fa-user-md"></i> Médecin</a></li>
                <li><a href="listeInfirmier.php"><i class="fa fa-medkit"></i> Infirmier</a></li>
                <li><a href="listeSecretaire.php"><i class="fa fa-user"></i> Secrétaire</a></li>
                <li><a href="chambre.php"><i class="fa fa-hotel"></i> Chambre / Lit</a></li>
            <?php endif; ?>

            <?php if ($role == 'admin' || $role == 'secretaire' || $role == 'infirmier' || $role == 'medecin'|| $role == 'laborantin'): ?>
                <li><a href="rendezvous.php"><i class="fa fa-calendar"></i> Rendez-vous</a></li>
            <?php endif; ?>

        </ul>
    </div>

    <script type="text/javascript">
        $(function() {
            $('[data-toggle="tooltip"]').tooltip();
        });
        setInterval(loadMessages, 3000);
    </script>
    <script>
        function loadMessages() {
            $.get("get_unread_count.php", function(data) {
                $("#msg-count").text(data);
            });
        }

        setInterval(loadMessages, 3000);
    </script>

</body>

</html>