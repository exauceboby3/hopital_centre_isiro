<?php
session_start();
$connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
$connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['id'] ?? 0;
$other_id = intval($_GET['user'] ?? 0);

// Marquer comme lu
$connexionDB->prepare("UPDATE message SET lu = 1 WHERE idReceiver = ? AND idSender = ?")->execute([$user_id, $other_id]);

$stmt = $connexionDB->prepare("
    SELECT m.*, u.username AS sender_name 
    FROM message m 
    JOIN users u ON m.idSender = u.idUser 
    WHERE (m.idSender = :me AND m.idReceiver = :other) 
       OR (m.idSender = :other AND m.idReceiver = :me)
    ORDER BY m.dateEnvoi ASC
");
$stmt->execute(['me' => $user_id, 'other' => $other_id]);
$messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($messages as $msg): ?>
    <div class="message <?php echo $msg['idSender'] == $user_id ? 'sent' : 'received'; ?>">
        <?php if ($msg['idSender'] == $user_id): ?>
            <span class="vu-indicator">
                <?php echo $msg['lu'] ? '✔✔' : '✔'; ?>
            </span>
        <?php endif; ?>
        <div class="message-content">
            <?php echo htmlspecialchars($msg['contenu']); ?>
            <div class="timestamp">
                <?php echo $msg['dateEnvoi']; ?>
                <?php if ($msg['idSender'] == $user_id): ?>
                    <?php echo $msg['lu'] ? "✅✅" : "✅"; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>
<?php endforeach;
