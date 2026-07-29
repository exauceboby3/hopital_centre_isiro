<?php


$connect = mysqli_connect("localhost", "root", "", "service");
if(isset($_POST["id"]))
{
    $query = "DELETE FROM patient WHERE idPATIENT = '".$_POST["id"]."'";
    if(mysqli_query($connect, $query))
    {
        echo 'Patient supprimé';
    }
}