<?php

$nom = $_POST['nom_m'];
$postnom = $_POST['postnom_m'];
$prenom = $_POST['prenom_m'];
$adresse = $_POST['adresse_m'];
$grade = $_POST['grade_m'];
$specialite = $_POST['specialite_m'];
$numTel = $_POST['numTel_m'];
$username = $_POST['user'];
$password = $_POST['password'];
$type = "medecin";
$insert = $_POST['insert'];

if ($insert == 'Valider') {
    try {
        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');
        $connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $insert1 = $connexionDB->prepare("INSERT INTO users(username, password, typeUser) VALUES (?, ?, ?)");
        $insert1->execute([$username, $password, $type]);

        $idUser = $connexionDB->lastInsertId();

        $insert2 = $connexionDB->prepare("INSERT INTO medecin(nom_m, postnom_m, prenom_m, adresse_m, grade_m, specialite_m, numTel_m, idUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $insert2->execute([$nom, $postnom, $prenom, $adresse, $grade, $specialite, $numTel, $idUser]);

        header("location:listeMedecin.php");
    } catch (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
}

else {
    try {
        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');

        $idMEDECIN = $_POST['id'];


        $query = "UPDATE medecin SET nom_m=?, postnom_m=?, prenom_m=?, adresse_m=? , grade_m=?, specialite_m=?, numTel_m=? WHERE idMEDECIN=?";

        $query = $connexionDB->prepare($query);

        $query->execute(array($nom, $postnom, $prenom,  $adresse, $grade, $specialite, $numTel, $idMEDECIN));

        header("location:listeMedecin.php");
    } catch
    (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
}
