<?php
session_start();
$connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
$connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['id'] ?? 0;

$stmt = $connexionDB->prepare("
    SELECT 
        u.idUser,
        u.username,
        u.last_active,
        (
            SELECT COUNT(*) 
            FROM message 
            WHERE (idSender = :me AND idReceiver = u.idUser) OR (idSender = u.idUser AND idReceiver = :me)
        ) AS total_messages,
        (
            SELECT idSender 
            FROM message 
            WHERE (idSender = :me AND idReceiver = u.idUser) OR (idSender = u.idUser AND idReceiver = :me)
            ORDER BY dateEnvoi DESC LIMIT 1
        ) AS last_sender,
        (
            SELECT COUNT(*) 
            FROM message 
            WHERE idSender = u.idUser AND idReceiver = :me AND lu = 0
        ) AS non_lus
    FROM users u
    WHERE u.idUser != :me
");

$stmt->execute(['me' => $user_id]);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);
$selected_user_id = $_GET['user'] ?? 0;

foreach ($users as $u):
    $isOnline = false;
    if (!empty($u['last_active'])) {
        $lastActive = strtotime($u['last_active']);
        $isOnline = (time() - $lastActive) < 30;
    }
?>
<a href="messagerie.php?user=<?php echo $u['idUser']; ?>"
   class="user-item <?php echo $u['idUser'] == $selected_user_id ? 'active' : ''; ?>">

    <?php if ($isOnline): ?>
        <span class="online-dot"></span>
    <?php endif; ?>

    <span style="margin-left: 16px; font-weight: <?php echo $u['last_sender'] == $u['idUser'] ? 'bold' : 'normal'; ?>">
        <?php echo htmlspecialchars($u['username']); ?>
    </span>

    <?php if ($u['non_lus'] > 0 && $u['idUser'] != $selected_user_id): ?>
        <span style="float:right; color:red; font-weight:bold;">
            <?php echo $u['non_lus']; ?>
        </span>
    <?php else: ?>
        <span style="float:right; color:#555;">
            (<?php echo $u['total_messages']; ?>)
        </span>
    <?php endif; ?>
</a>
<?php endforeach; ?>
