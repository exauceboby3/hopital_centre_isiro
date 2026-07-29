<?php

$nom = $_POST['nom_i'];
$postnom = $_POST['postnom_i'];
$prenom = $_POST['prenom_i'];
$specialite = $_POST['specialite_i'];
$adresse = $_POST['adresse_i'];
$numTel = $_POST['numTel_i'];
$username = $_POST['user'];
$password = $_POST['password'];
$type = "infirmier";
$insert = $_POST['insert'];

if ($insert == 'Valider') {
    try {
        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');
        $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $insertUser = $connexionDB->prepare("INSERT INTO users(username, password, typeUser) VALUES (?, ?, ?)");
        $insertUser->execute([$username, $password, $type]);

        $idUser = $connexionDB->lastInsertId();

        $insertInfirmier = $connexionDB->prepare("INSERT INTO infirmier(nom_i, postnom_i, prenom_i, adresse_i, numTel_i, specialite_i, idUser) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $insertInfirmier->execute([$nom, $postnom, $prenom, $adresse, $numTel, $specialite, $idUser]);

        header("location:listeInfirmier.php");
    } catch (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
} else {
    try {
        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');
        $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $idINFIRMIER = $_POST['id'];

        $update = $connexionDB->prepare("UPDATE infirmier SET nom_i=?, postnom_i=?, prenom_i=?, adresse_i=? , numTel_i=?, specialite_i=? WHERE idINFIRMIER=?");
        $update->execute([$nom, $postnom, $prenom, $adresse, $numTel, $specialite, $idINFIRMIER]);

        header("location:listeInfirmier.php");
    } catch (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
}
