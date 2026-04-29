<?php
// gescall_dialer.php - Audio Broadcast Mode (Customer First)
header('Content-Type: application/json');

$pass = isset($_REQUEST['pass']) ? $_REQUEST['pass'] : '';
$phone = isset($_REQUEST['phone_number']) ? $_REQUEST['phone_number'] : '';
$caller_id = isset($_REQUEST['caller_id']) ? $_REQUEST['caller_id'] : '';
$audio_name = isset($_REQUEST['audio_name']) ? $_REQUEST['audio_name'] : '';

// Context/Exten to execute AFTER Customer Answers
$broadcast_ext = '8305'; 
$broadcast_context = 'default';

if ($pass !== 'TEcnologia2020') {
    die(json_encode(["success" => false, "error" => "Authentication failed"]));
}

if (empty($phone)) {
    die(json_encode(["success" => false, "error" => "Phone number required"]));
}

$timeout = 30; 
$socket = @fsockopen("127.0.0.1", 5038, $errno, $errstr, $timeout);

if (!$socket) {
    die(json_encode(["success" => false, "error" => "AMI Connection Failed: $errstr"]));
}

function get_response($socket, $expect_key = null) {
    $buffer = "";
    $start = time();
    while (time() - $start < 30) {
        $line = fgets($socket, 4096);
        $buffer .= $line;
        if (trim($line) == "") {
             if ($expect_key && stripos($buffer, $expect_key) !== false) return $buffer;
             if (!$expect_key) return $buffer;
             return $buffer;
        }
    }
    return $buffer;
}

// Login
$actionid_login = uniqid("login_");
fputs($socket, "Action: Login\r\n");
fputs($socket, "Username: cron\r\n");
fputs($socket, "Secret: 1234\r\n");
fputs($socket, "ActionID: $actionid_login\r\n\r\n");

$login_res = "";
$start = time();
while(time() - $start < 5) {
    $pkt = get_response($socket);
    if (stripos($pkt, $actionid_login) !== false) {
        $login_res = $pkt;
        break;
    }
}

if (stripos($login_res, "Success") === false) {
     fclose($socket);
     die(json_encode(["success" => false, "error" => "AMI Login Failed", "ami_response" => $login_res]));
}

// Originate (Broadcast Mode)
// Channel = Customer (The person we call)
// Exten = The Broadcast Application (8305) - Where we send them when they answer
$actionid_orig = uniqid("orig_");
fputs($socket, "Action: Originate\r\n");
fputs($socket, "Channel: Local/$phone@default\r\n"); 
fputs($socket, "Exten: $broadcast_ext\r\n");
fputs($socket, "Context: $broadcast_context\r\n");
fputs($socket, "Priority: 1\r\n");

if (!empty($caller_id)) {
    fputs($socket, "CallerID: \"$caller_id\" <$caller_id>\r\n");
    fputs($socket, "Variable: ForceCID=$caller_id\r\n");
} else {
    fputs($socket, "CallerID: \"API Call\" <$phone>\r\n");
}

if (!empty($audio_name)) {
    fputs($socket, "Variable: AUDIO_FILE=$audio_name\r\n");
} else {
    fputs($socket, "Variable: AUDIO_FILE=beep\r\n");
}

fputs($socket, "Timeout: 30000\r\n"); 
fputs($socket, "Async: yes\r\n"); // ASYNC YES because we don't want to wait for them to answer to return API success.
// If we use Async: no, the API hangs until they answer (or timeout). 
// Usually for API responsiveness, Async: yes is better for broadcasts.
// But user liked seeing the error.
// Compromise: Async: yes. If dialplan invalid, it fails fast. 
fputs($socket, "ActionID: $actionid_orig\r\n\r\n");

// Read immediate ACK
$originate_res = "";
$start = time();
while(time() - $start < 5) {
    $pkt = get_response($socket);
    if (stripos($pkt, $actionid_orig) !== false) {
        $originate_res = $pkt;
        break;
    }
}

fputs($socket, "Action: Logoff\r\n\r\n");
fclose($socket);

echo json_encode([
    "success" => (stripos($originate_res, "Success") !== false || stripos($originate_res, "Queued") !== false),
    "message" => "Broadcast initiated",
    "details" => [
        "target" => "Local/$phone@default",
        "play_exten" => $broadcast_ext,
        "caller_id" => $caller_id,
        "audio_name" => $audio_name,
        "ami_response" => $originate_res
    ]
]);
?>
