<?php
try {
    $connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
    $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Erreur: " . $e->getMessage());
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $user = trim($_POST['user']);
    $password = trim($_POST['password']);

    $req = $connexionDB->prepare('SELECT idUser, typeUser FROM users WHERE username = ? AND password = ?');
    $req->execute(array($user, $password));

    $resultat = $req->fetch(PDO::FETCH_ASSOC);

    if ($resultat) {
        session_start();
        $_SESSION['user'] = $user;
        $_SESSION['role'] = $resultat['typeUser']; //
        $_SESSION['id'] = $resultat['idUser'];

        switch ($resultat['typeUser']) {
            case 'admin':
                header("Location: dashboard.php");
                break;
            case 'secretaire':
                header("Location: dashboard.php");
                break;
            case 'medecin':
                header("Location: dashboard.php");
                break;
            case 'infirmier':
                header("Location: dashboard.php");
                break;
            case 'laborantin':
                header("Location: dashboard.php");
                break;
        }
        exit();
    } else {
        $error = 'Mauvais identifiant ou mot de passe !';
    }
}
