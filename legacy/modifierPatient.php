<?php

$connect = mysqli_connect('localhost', 'root', '', 'service');

$input = filter_input_array(INPUT_POST);


$nom_p = mysqli_real_escape_string($connect, $input["nom_p"]);
$postnom_p = mysqli_real_escape_string($connect, $input["postnom_p"]);
$prenom_p = mysqli_real_escape_string($connect, $input["prenom_p"]);
$sexe = mysqli_real_escape_string($connect, $input["sexe"]);
$service = mysqli_real_escape_string($connect, $input["service"]);
$poids = mysqli_real_escape_string($connect, $input["poids"]);
$temp = mysqli_real_escape_string($connect, $input["temp"]);
$tension = mysqli_real_escape_string($connect, $input["tension"]);
$pathologie = mysqli_real_escape_string($connect, $input["pathologie"]);
$adresse_p = mysqli_real_escape_string($connect, $input["adresse_p"]);
$numTel_p = mysqli_real_escape_string($connect, $input["numTel_p"]);
$specialite_p = mysqli_real_escape_string($connect, $input["DateNaissance_p"]);
$numTel_p = mysqli_real_escape_string($connect, $input["DateRdv_p"]);

$query = "
 UPDATE patient
 SET nom_p = '" . $nom_p . "', 
 postnom_p = '" . $postnom_p . "',
 prenom_p = '" . $prenom_p . "',
 sexe='" . $sexe . "',
 service='" . $service . "',
 poids='" . $poids . "',
 temp='" . $temp . "',
 tension='" . $tension . "',
 pathologie='" . $pathologie . "',
 adresse_p = '" . $adresse_p . "',
 numTel_p = '" . $numTel_p . "',
 DateNaissance_p = '" . $DateNaissance_p . "',
 DateRdv = '" . $DateRdv . "'

 WHERE idPATIENT = '" . $input["idPATIENT"] . "'
 ";
mysqli_query($connect, $query);

echo json_encode($input);
