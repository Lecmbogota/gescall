<?php
// gescall_dialer.php - Custom Dialer for Headless Agents
header('Content-Type: application/json');

$pass = isset($_REQUEST['pass']) ? $_REQUEST['pass'] : '';
$phone = isset($_REQUEST['phone_number']) ? $_REQUEST['phone_number'] : '';
$agent_ext = '8300'; 

if ($pass !== 'TEcnologia2020') {
    die(json_encode(["success" => false, "error" => "Authentication failed"]));
}

if (empty($phone)) {
    die(json_encode(["success" => false, "error" => "Phone number required"]));
}

$timeout = 10;
$socket = @fsockopen("127.0.0.1", 5038, $errno, $errstr, $timeout);

if (!$socket) {
    die(json_encode(["success" => false, "error" => "AMI Connection Failed: $errstr"]));
}

// Function to read response
function read_ami_response($socket) {
    $response = "";
    while ($line = fgets($socket, 4096)) {
        $response .= $line;
        if (trim($line) == "") { // End of packet
            break;
        }
        // Check for 'Message: Authentication failed'
        if (stripos($line, "Authentication failed") !== false) return $response;
    }
    return $response;
}

// Login
fputs($socket, "Action: Login\r\n");
fputs($socket, "Username: cron\r\n");
fputs($socket, "Secret: 1234\r\n\r\n");
$login_res = read_ami_response($socket);

if (stripos($login_res, "Success") === false && stripos($login_res, "Accepted") === false) {
     fclose($socket);
     die(json_encode(["success" => false, "error" => "AMI Login Failed", "ami_response" => $login_res]));
}

// Originate
fputs($socket, "Action: Originate\r\n");
// Try adding /n to Local channel to avoid optimization issues
fputs($socket, "Channel: Local/$agent_ext@default/n\r\n");
fputs($socket, "Exten: $phone\r\n");
fputs($socket, "Context: default\r\n");
fputs($socket, "Priority: 1\r\n");
fputs($socket, "CallerID: $phone\r\n");
fputs($socket, "Async: yes\r\n\r\n");

$originate_res = read_ami_response($socket);

// Logoff
fputs($socket, "Action: Logoff\r\n\r\n");
fclose($socket);

echo json_encode([
    "success" => (stripos($originate_res, "Success") !== false || stripos($originate_res, "Queued") !== false),
    "message" => "Originate attempted",
    "details" => [
        "channel" => "Local/$agent_ext@default/n",
        "exten" => $phone,
        "ami_response" => $originate_res
    ]
]);
?>
