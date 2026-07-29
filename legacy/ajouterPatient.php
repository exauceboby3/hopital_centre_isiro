<?php

$nom = $_POST['nom_p'];
$postnom = $_POST['postnom_p'];
$prenom = $_POST['prenom_p'];
$sexe = $_POST['sexe'];
$service = $_POST['service'];
$poids = $_POST['poids'];
$temp = $_POST['temp'];
$tension = $_POST['tension'];
$pathologie = $_POST['pathologie'];
$adresse = $_POST['adresse_p'];
$numTel = $_POST['numTel_p'];
$dateN = $_POST['DateNaissance_p'];
$dateR = $_POST['DateRdv'];
$insert = $_POST['insert'];

if ($insert == 'Valider') {

    try {

        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');

        $insert = $connexionDB->query("INSERT INTO patient(nom_p, postnom_p, prenom_p, sexe, service, poids, temp, tension, pathologie, adresse_p, numTel_p, DateNaissance_p, DateRdv)
        VALUES ('" . $nom . "','" . $postnom . "','" . $prenom . "','" . $sexe . "','" . $service . "','" . $poids . "','" . $temp . "','" . $tension . "','" . $pathologie . "','" . $adresse . "','" . $numTel . "','" . $dateN . "','" . $dateR . "')");      

        header("location:listePatient.php");
    } catch
    (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
}
else {
    try {
        $connexionDB = new PDO('mysql:host=localhost;dbname=service', 'root', '');

        $idPATIENT = $_POST['id'];


        $query = "UPDATE patient SET nom_p=?, postnom_p=?, prenom_p=?, sexe=?, service=?, poids=?, temp=?, tension=?, pathologie=? , adresse_p=?, numTel_p=?, DateNaissance_p=?,DateRdv=? WHERE idPATIENT=?";

        $query = $connexionDB->prepare($query);

        $query->execute(array($nom, $postnom, $prenom, $sexe, $service, $poids, $temp, $tension, $pathologie, $adresse, $numTel, $dateN, $dateR, $idPATIENT));

        header("location:listePatient.php");
    } catch
    (PDOException $e) {
        die("Erreur: " . $e->getMessage());
    }
}
