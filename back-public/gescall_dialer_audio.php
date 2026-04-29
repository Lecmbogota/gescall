<?php
// gescall_dialer.php - Sync Dialer with Audio Name Support
header('Content-Type: application/json');

$pass = isset($_REQUEST['pass']) ? $_REQUEST['pass'] : '';
$phone = isset($_REQUEST['phone_number']) ? $_REQUEST['phone_number'] : '';
$caller_id = isset($_REQUEST['caller_id']) ? $_REQUEST['caller_id'] : '';
$audio_name = isset($_REQUEST['audio_name']) ? $_REQUEST['audio_name'] : '';

// USE 8305 for Static Audio Playback (No AGI needed if just Playback)
$agent_ext = '8305'; 

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

// Originate (Sync)
$actionid_orig = uniqid("orig_");
fputs($socket, "Action: Originate\r\n");
fputs($socket, "Channel: Local/$agent_ext@default/n\r\n");
fputs($socket, "Exten: $phone\r\n");
fputs($socket, "Context: default\r\n");
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
    // Default audio if missing?
    fputs($socket, "Variable: AUDIO_FILE=beep\r\n");
}

fputs($socket, "Timeout: 30000\r\n"); 
fputs($socket, "Async: no\r\n");
fputs($socket, "ActionID: $actionid_orig\r\n\r\n");

$originate_res = "";
$start = time();
while(time() - $start < 30) {
    $pkt = get_response($socket);
    if (stripos($pkt, $actionid_orig) !== false) {
        $originate_res = $pkt;
        break;
    }
}

fputs($socket, "Action: Logoff\r\n\r\n");
fclose($socket);

echo json_encode([
    "success" => (stripos($originate_res, "Success") !== false),
    "message" => "Originate result",
    "details" => [
        "channel" => "Local/$agent_ext@default/n",
        "exten" => $phone,
        "caller_id" => $caller_id,
        "audio_name" => $audio_name,
        "ami_response" => $originate_res
    ]
]);
?>
