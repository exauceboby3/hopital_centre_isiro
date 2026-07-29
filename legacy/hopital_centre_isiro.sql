
CREATE DATABASE IF NOT EXISTS service;
USE service;


CREATE TABLE IF NOT EXISTS users (
    idUser INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100),
    password VARCHAR(255),
    typeUser ENUM('admin', 'caisse', 'medecin','infirmier','laborantin'),
    deleted BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS facture (
    idFacture INT AUTO_INCREMENT PRIMARY KEY,
    idPatient INT,
    idUser INT,
    montant DECIMAL(10,2),
    description TEXT,
    statut ENUM('en_attente','payee') DEFAULT 'en_attente',
    dateEmission DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idPatient) REFERENCES patient(idPATIENT) ON DELETE CASCADE,
    FOREIGN KEY (idUser) REFERENCES users(idUser) ON DELETE SET NULL

);

CREATE TABLE IF NOT EXISTS message (
    idMessage INT AUTO_INCREMENT PRIMARY KEY,
    idSender INT,
    idReceiver INT,
    contenu TEXT,
    dateEnvoi DATETIME DEFAULT CURRENT_TIMESTAMP,
    lu BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (idSender) REFERENCES users(idUser) ON DELETE CASCADE,
    FOREIGN KEY (idReceiver) REFERENCES users(idUser) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medecin (
    idMEDECIN INT AUTO_INCREMENT PRIMARY KEY,
    nom_m VARCHAR(100),
    postnom_m VARCHAR(100),
    prenom_m VARCHAR(100),
    adresse_m VARCHAR(255),
    numTel_m VARCHAR(50),
    grade_m VARCHAR(100),
    specialite_m VARCHAR(100),
    idUser INT
);

-- Table: infirmier
CREATE TABLE IF NOT EXISTS infirmier (
    idINFIRMIER INT AUTO_INCREMENT PRIMARY KEY,
    nom_i VARCHAR(100),
    postnom_i VARCHAR(100),
    prenom_i VARCHAR(100),
    adresse_i VARCHAR(255),
    numTel_i VARCHAR(50),
    specialite_i VARCHAR(100),
    idUser INT

);

-- Table: secretaire
CREATE TABLE IF NOT EXISTS secretaire (
    idSECRETAIRE INT AUTO_INCREMENT PRIMARY KEY,
    nom_s VARCHAR(100),
    postnom_s VARCHAR(100),
    prenom_s VARCHAR(100),
    adresse_s VARCHAR(255),
    numTel_s VARCHAR(50),
    niveau_s VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS pharmacie (
    idPHARMA INT AUTO_INCREMENT PRIMARY KEY,
    nomMedicament VARCHAR(100),
    quantite INT,
    seuil_minimal INT DEFAULT 5,
    prix DECIMAL(10,2)
);


-- Table: patient
CREATE TABLE IF NOT EXISTS patient (
    idPATIENT INT AUTO_INCREMENT PRIMARY KEY,
    nom_p VARCHAR(100),
    postnom_p VARCHAR(100),
    prenom_p VARCHAR(100),
    sexe ENUM('M','F'),
    service VARCHAR(100),
    poids VARCHAR(100),
    temp VARCHAR(100),
    tension VARCHAR(100),
    pathologie VARCHAR(100),
    adresse_p VARCHAR(255),
    numTel_p VARCHAR(50),
    DateNaissance_p DATE,
    DateRdv DATE
);


CREATE TABLE IF NOT EXISTS chambre (
    idCHAMBRE INT AUTO_INCREMENT PRIMARY KEY,
    nombreLit INT,
    nbOccuped INT DEFAULT 0
);

-- Table: occupation
CREATE TABLE IF NOT EXISTS occupation (
    idOCCUPATION INT AUTO_INCREMENT PRIMARY KEY,
    idPatient INT,
    idMedecin INT,
    chambre INT,
    lit INT,
    dateD DATE,
    dateF DATE,
    FOREIGN KEY (idPatient) REFERENCES patient(idPATIENT) ON DELETE CASCADE,
    FOREIGN KEY (idMedecin) REFERENCES medecin(idMEDECIN) ON DELETE SET NULL,
    FOREIGN KEY (chambre) REFERENCES chambre(idCHAMBRE) ON DELETE SET NULL
);

-- Table: consultation
CREATE TABLE IF NOT EXISTS consultation (
    idCONSULTATION INT AUTO_INCREMENT PRIMARY KEY,
    idPatient INT,
    idMedecin INT,
    dateCons DATE,
    rapport TEXT,
    orientation TEXT,
    ordonnance TEXT,
    certificat TEXT,
    motif TEXT,
    statut VARCHAR(100),
    FOREIGN KEY (idPatient) REFERENCES patient(idPATIENT) ON DELETE CASCADE,
    FOREIGN KEY (idMedecin) REFERENCES medecin(idMEDECIN) ON DELETE SET NULL
);
CREATE TABLE laborantin (
    idLABORANTIN INT AUTO_INCREMENT PRIMARY KEY,
    nomLaborantin VARCHAR(100) NOT NULL,
    postnomLaborantin VARCHAR(100) NOT NULL,
    prenomLaborantin VARCHAR(100) NOT NULL,
    telephone VARCHAR(20),
    specialite VARCHAR(100),
    adresse TEXT,
    idUser INT UNIQUE,
    FOREIGN KEY (idUser) REFERENCES users(id) ON DELETE CASCADE
);


-- Table: examen
CREATE TABLE IF NOT EXISTS examen (
    idEXAMEN INT AUTO_INCREMENT PRIMARY KEY,
    idPatient INT,
    idMedecin INT,
    valide_par_labo TINYINT(1) DEFAULT 0,
    date_validation DATETIME DEFAULT NULL,
    idLaborantin INT DEFAULT NULL,
    dateExamen DATE,
    typeE VARCHAR(100),
    resultatExamen TEXT,
    fichierExam VARCHAR(255),
    FOREIGN KEY (idPatient) REFERENCES patient(idPATIENT) ON DELETE CASCADE,
    FOREIGN KEY (idMedecin) REFERENCES medecin(idMEDECIN) ON DELETE SET NULL,
    FOREIGN KEY (idLaborantin) REFERENCES laborantin(idLABORANTIN) ON DELETE SET NULL
);
ALTER TABLE examen ADD CONSTRAINT fk_medecin_examen FOREIGN KEY (idMedecin) REFERENCES medecin(idMEDECIN);

