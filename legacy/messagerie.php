<?php
session_start();

$connexionDB = new PDO("mysql:host=localhost;dbname=service", "root", "");
$connexionDB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['id'] ?? 0;
$username = $_SESSION['user'] ?? '';
$selected_user_id = isset($_GET['user']) ? intval($_GET['user']) : 0;

if ($selected_user_id) {
    $updateLu = $connexionDB->prepare("UPDATE message SET lu = 1 WHERE idSender = ? AND idReceiver = ?");
    $updateLu->execute([$selected_user_id, $user_id]);
}

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


?>
<?php
include 'home.php';
?>
<!DOCTYPE html>
<html lang="fr">

<head>
    <meta charset="UTF-8">
    <title>Messagerie</title>
    <link rel="stylesheet" href="messagerie.css">
</head>

<body>

    <div class="messenger-container">
        <div class="user-list">
            <h3>Utilisateurs</h3>
            <div id="user-list-container">
                <?php foreach ($users as $u): ?>
                <?php endforeach; ?>
            </div>


        </div>

        <div class="chat-area">
            <div class="chat-header">
                <?php
                $receiverName = '';
                foreach ($users as $u) {
                    if ($u['idUser'] == $selected_user_id) {
                        $receiverName = $u['username'];
                        echo "Discussion avec : " . htmlspecialchars($receiverName);
                        break;
                    }
                }
                ?>
            </div>
            <div class="chat-messages" id="chat-messages">
            </div>

            <?php if ($selected_user_id): ?>
                <form id="chat-form" class="chat-input">
                    <input type="hidden" name="receiver_id" value="<?php echo $selected_user_id; ?>">
                    <input type="text" name="message_content" id="message_content" placeholder="Écrire un message..." required>
                    <button type="submit">Envoyer</button>
                </form>


            <?php else: ?>
                <div class="chat-input disabled">
                    Sélectionnez un utilisateur pour commencer.
                </div>
            <?php endif; ?>
        </div>
    </div>
    <audio id="receive-sound" src="assets/sounds/receive.mp3" preload="auto"></audio>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script>
        const selectedUserId = <?php echo json_encode($selected_user_id); ?>;
        let previousCount = 0;

        function loadMessages() {
            if (!selectedUserId) return;

            $.get("get_messages.php?user=" + selectedUserId, function(data) {
                const newCount = (data.match(/class="message /g) || []).length;
                if (newCount > previousCount && previousCount > 0) {
                    document.getElementById('receive-sound').play();
                }
                previousCount = newCount;
                $("#chat-messages").html(data);
                $("#chat-messages").scrollTop($("#chat-messages")[0].scrollHeight);
            });
        }
        setInterval(loadMessages, 3000);
        loadMessages();

        function loadUsers() {
            $.get("load_users.php?user=" + selectedUserId, function(data) {
                $("#user-list-container").html(data);
            });
        }

        setInterval(loadUsers, 5000);
        loadUsers();

        $("#chat-form").on("submit", function(e) {
            e.preventDefault();
            const content = $("#message_content").val().trim();
            if (content === "") return;

            $.post("send_message.php", {
                receiver_id: selectedUserId,
                message_content: content
            }, function(response) {
                $("#message_content").val('');
                loadMessages();
                document.getElementById('beep').play();
            });
        });
    </script>


</body>

</html>