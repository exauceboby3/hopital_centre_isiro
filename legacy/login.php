<?php
require_once 'verifCnx.php';
?>

<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="style3.css" type="text/css" />
  <link href="css/bootstrap.min.css" rel="stylesheet" type="text/css" />
  <script src="js/jquery-1.11.3.min.js"></script>
  <script src="js/bootstrap.min.js"></script>
  <title>Se connecter</title>
</head>

<body>
  <div class="row">
    <br />
    <div class="login-container" id="login">
      <form method="POST">
        <center>
          <b style="font-size: 28px" id="login-name"> Se connecter </b>
        </center>
        <br />
        <div class="form-group">
          <label class="idn">Identifiant: </label>
          <div class="input-group">
            <span class="input-group-addon"><i class="glyphicon glyphicon-user"></i></span>
            <input
              type="text"
              class="form-control"
              name="user"
              placeholder="Entrer identifiant" />
          </div>
        </div>

        <div class="form-group">
          <label class="idn">Mot de passe: </label>
          <div class="input-group">
            <span class="input-group-addon"><i class="glyphicon glyphicon-lock"></i></span>
            <input
              type="password"
              class="form-control"
              id="password"
              name="password"
              placeholder="Entrer mot de passe" />
          </div>
        </div>
        <?php if (!empty($error)) echo "<p style='color:red;'>$error</p>"; ?>

        <br />

        <div class="form-group">
          <input
            style="
                width: 100%;
                padding: 10px;
                background: #2e8b57;
                color: #fff;
                border: none;
              "
            type="submit"
            class="btn btn-conx"
            value="Se connecter" />
        </div>
      </form>
    </div>
  </div>
</body>

</html>